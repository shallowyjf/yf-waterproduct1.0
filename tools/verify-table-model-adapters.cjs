const {chromium}=require('C:/Users/yjf95/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.PROTOTYPE_URL||'http://127.0.0.1:8765/index.html',dir=path.resolve(__dirname,'../artifacts/table-model-adapters');
fs.mkdirSync(dir,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1280,height:898}}),errors=[],report=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
 const go=async route=>{await page.goto(base+'#'+route);await page.waitForTimeout(200);};
 const login=async()=>{await page.locator('#loginAccount').fill('admin');await page.locator('#loginPassword').fill('admin');await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator('[data-action="enter-project"][data-project-id="PRJ-SUIZHOU"]').click();};
 async function exercise(label,selector,idLabel,action){
  const table=page.locator(selector),component=table.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," water-table ")][1]');
  await component.locator('.water-table-query').waitFor();
  const all=await table.evaluate(t=>window.WaterTable.rows(t).map(r=>({id:r.id,name:r.name}))),target=all.at(-1);
  assert(all.length>20,`${label} complete model fixture`);assert.equal(await table.locator('tbody tr').count(),10);
  assert.equal(await component.locator('.water-table-query').count(),1);assert.equal(await component.locator('.water-table-pagination').count(),1);
  assert.equal(await component.locator('.water-table-query select').count(),0);
  await component.locator('[data-water-page="next"]').click();assert.equal(await table.locator('tbody tr:first-child td:first-child').innerText(),idLabel==='结果名称'?all[10].name:all[10].id);
  const search=idLabel==='结果名称'?target.name:target.id;
  await component.locator('[aria-label="搜索当前表格"]').fill(search);await component.getByRole('button',{name:'查询',exact:true}).click();
  assert(await table.locator('tbody').innerText().then(t=>t.includes(search)),`${label} searches beyond first page`);
  await component.locator('[data-water-reset]').click();
  const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'}),expected=all.map(r=>idLabel==='结果名称'?r.name:r.id).sort(collator.compare).at(-1);
  await table.getByRole('button',{name:'排序：'+idLabel,exact:true}).click();await table.getByRole('button',{name:'排序：'+idLabel,exact:true}).click();
  assert.equal(await table.locator('tbody tr:first-child td:first-child').innerText(),expected,`${label} sorts complete model before pagination`);
  await table.getByRole('button',{name:'筛选：'+idLabel,exact:true}).click();
  const menu=page.locator('.water-column-menu');await menu.locator('[name="contains"]').fill(search);await menu.getByRole('button',{name:'确定',exact:true}).click();
  assert(await table.locator('tbody').innerText().then(t=>t.includes(search)),`${label} header filter uses all records`);
  assert.match(await component.locator('.water-table-pagination').innerText(),/1 \/ 1/);
  if(action){await table.locator(action(target)).click();await page.waitForTimeout(120);if(label==='archives'){assert(await page.locator('[data-hy-map]').isVisible());assert(await table.locator('tbody tr.is-selected').innerText().then(t=>t.includes(search)),`${label} selected archive opens its map`);}else assert(await page.locator('[data-map-slot="right"]').isVisible(),`${label} filtered-row action retains details`);}
  await component.locator('[data-water-reset]').click();
  await page.setViewportSize({width:1081,height:898});
  await table.getByRole('button',{name:'筛选：'+idLabel,exact:true}).click();
  const box=await page.locator('.water-column-menu').boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=1081&&box.y+box.height<=898,`${label} header popup fits viewport`);
  await page.keyboard.press('Escape');
  const layout=await component.evaluate(c=>{const r=c.getBoundingClientRect(),panel=c.closest('[data-map-slot="bottom"]'),p=panel.getBoundingClientRect(),q=c.querySelector('.water-table-query').getBoundingClientRect(),f=c.querySelector('.water-table-pagination').getBoundingClientRect();return {width:r.width,panelWidth:p.width,searchTop:q.top,panelTop:p.top,pagerBottom:f.bottom,panelBottom:p.bottom,overflow:c.scrollWidth-c.clientWidth};});
  assert(layout.width<=layout.panelWidth+2,`${label} table wrapper fits panel`);assert(layout.overflow<=2,`${label} scroll stays inside table`);
  await page.screenshot({path:path.join(dir,label+'.png')});report.push({label,total:all.length,layout});
  await page.setViewportSize({width:1280,height:898});
 }
 try{
  await page.goto(base);await login();
  await go('simulation');await exercise('hydraulic','.hy-ledger table[data-water-table-model]','对象编号',r=>`[data-hy="locate"][data-value="${r.id}"]`);
  await go('p04');await exercise('topology','[data-map-slot="bottom"] table[data-water-table-model]','对象编号',r=>`[data-we="object"][data-value="${r.id}"]`);
  await go('hydraulic');await page.locator('[data-v2="scene-open"][data-id="SZ-BASELINE"]').click();await exercise('scenario','[data-map-ledger="objects"] table[data-water-table-model]','对象编号',r=>`[data-v2="ws-select"][data-id="${r.id}"]`);
  // These fixtures live only in this isolated browser context and exercise archive pagination.
  await page.evaluate(async()=>{const project=document.querySelector('#projectSelect').value,db=await window.WaterV2Storage.read(project),source=window.WaterResultArchives.list(db,'hydraulic')[0];for(let i=0;i<25;i++)window.WaterResultArchives.save(db,source,'分页校验 '+String(i).padStart(2,'0'),source.start,source.end);await window.WaterV2Storage.write(project,db);});
  await page.reload();await login();await go('hydraulicHistory');await exercise('archives','.ar-ledger table[data-water-table-model]','结果名称',r=>`[data-ar="select"][data-id="${r.id}"]`);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,report},null,2));
 }catch(error){await page.screenshot({path:path.join(dir,'failure.png')});console.error(JSON.stringify({errors,report,url:page.url()},null,2));throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
