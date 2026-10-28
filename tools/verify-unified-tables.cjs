const {chromium}=require('C:/Users/yjf95/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.PROTOTYPE_URL||'http://127.0.0.1:8765/index.html',output=path.resolve(__dirname,'../artifacts/unified-tables');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base);await page.locator('#loginAccount').fill('admin');await page.locator('#loginPassword').fill('admin');await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.locator('[data-action="enter-project"][data-project-id="PRJ-SH-CAMPUS"]').click();
  async function route(id){await page.goto(base+'#'+id);await page.waitForTimeout(450);}
  for(const id of ['p02dma','p02asset','p10','devices','p12','p03','p06','p06h','p10h','p11','p08','p09','p13','p13h','p15','p15h','p16','hydraulicModel','qualityModel','hydraulic','calculationCenter','hydraulicHistory','reports','leakage']){
   await route(id);
   for(const label of ['展开对象列表','展开监测对象抽屉','展开对象抽屉']){const b=page.getByRole('button',{name:label,exact:true});if(await b.count())await b.first().click();}
   const report=await page.evaluate(()=>({tables:[...document.querySelectorAll('#workspace table')].map(t=>({key:t.dataset.waterTableKey||'',headers:[...t.querySelectorAll('th')].map(h=>h.dataset.waterLabel||h.textContent),enhanced:!!t.closest('.water-table'),query:t.closest('.water-table')?.querySelectorAll('.water-table-query').length,pager:t.closest('.water-table')?.querySelectorAll('.water-table-pagination').length,children:[...t.closest('.water-table')?.querySelector('.water-table-query')?.children||[]].map(c=>c.tagName),visibleRows:[...t.tBodies[0].rows].filter(r=>!r.hidden).length})),legacy:[...document.querySelectorAll('#opsFilter,.product-bottom-filterbar,.sp-filters,#dbSearch,.product-table-column-toolbar,.v2-search,[name="jobStatus"]')].filter(e=>e.offsetWidth||e.offsetHeight).map(e=>e.outerHTML.slice(0,250))}));
   assert.deepEqual(report.legacy,[],id+' retains standalone list controls');
   for(const table of report.tables){assert.ok(table.enhanced,id+' table not enhanced '+table.headers);assert.equal(table.query,1,id+' duplicate queries');assert.equal(table.pager,1,id+' duplicate pager');assert.deepEqual(table.children,['INPUT','BUTTON','BUTTON']);assert.ok(table.visibleRows<=10,id+' pagination failed');}
   checks.push({route:id,...report});
  }
  await route('devices');const ledger=page.locator('#workspace [data-water-table-key$="standard|devices"]');
  const table=await ledger.count()?ledger:page.locator('#workspace table').first(),component=table.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," water-table ")][1]');
  const total=await table.evaluate(t=>WaterTable.rows(t).length);assert.equal(total,96);
  const allNames=await table.evaluate(t=>WaterTable.rows(t).map(r=>r.name));
  const input=component.getByRole('searchbox');await input.fill(allNames.at(-1));await component.getByRole('button',{name:'查询',exact:true}).click();
  assert.ok(await table.evaluate(t=>WaterTable.rows(t).length)<total);assert.ok(await table.locator('tbody').textContent().then(t=>t.includes(allNames.at(-1))));
  await component.getByRole('button',{name:'重置',exact:true}).click();assert.equal(await table.evaluate(t=>WaterTable.rows(t).length),96);
  const statusHeader=table.locator('th').filter({hasText:'设备类型'});await statusHeader.getByRole('button',{name:/筛选/}).click();
  const popover=page.getByRole('dialog',{name:'设备类型筛选与排序'});await popover.getByRole('button',{name:'清空',exact:true}).click();await popover.getByRole('button',{name:'确定',exact:true}).click();
  assert.equal(await table.evaluate(t=>WaterTable.rows(t).length),0);await component.getByRole('button',{name:'重置',exact:true}).click();
  const expectedRange=await table.evaluate(t=>WaterTable.rows(t).filter(r=>r.value>=2&&r.value<=3).map(r=>r.id));
  await table.getByRole('button',{name:'筛选：最新数据',exact:true}).click();await page.locator('.water-column-menu [name="min"]').fill('2');await page.locator('.water-column-menu [name="max"]').fill('3');await page.locator('.water-column-menu').getByRole('button',{name:'确定',exact:true}).click();
  assert.deepEqual(await table.evaluate(t=>WaterTable.rows(t).map(r=>r.id)),expectedRange);
  await table.getByRole('button',{name:'排序：最新数据',exact:true}).click();await table.getByRole('button',{name:'排序：最新数据',exact:true}).click();
  const values=await table.evaluate(t=>WaterTable.rows(t).map(r=>r.value));assert.deepEqual(values,[...values].sort((a,b)=>b-a));
  await route('p03');await route('devices');assert.deepEqual(await table.evaluate(t=>WaterTable.rows(t).map(r=>r.value)),values,'filters and sorting survive route changes');
  await component.getByRole('button',{name:'重置',exact:true}).click();assert.equal(await table.evaluate(t=>WaterTable.rows(t).length),96);
  await table.locator('th').filter({hasText:'设备编号'}).getByRole('button',{name:/排序/}).click();assert.equal(await table.locator('th').filter({hasText:'设备编号'}).getAttribute('aria-sort'),'ascending');
  await component.getByRole('button',{name:'下一页',exact:true}).click();assert.match(await component.locator('.water-table-pagination').textContent(),/2 \/ 10/);
  await page.screenshot({path:path.join(output,'devices.png'),fullPage:true});
  await route('p10');const expand=page.getByRole('button',{name:'展开监测对象抽屉',exact:true});if(await expand.count())await expand.click();await page.locator('[data-action="p10-bottom-tab"][data-value="users"]').click();
  const users=page.locator('.product-gis-bottom .water-table').first();await users.getByRole('searchbox').fill('宿舍6');await users.getByRole('button',{name:'查询',exact:true}).click();
  assert.equal(await users.locator('tbody tr:visible').count(),1);assert.match(await users.locator('tbody tr:visible').textContent(),/宿舍6/);
  await users.locator('[data-action="open-user-monitor"]:visible').click();await page.locator('.user-floors').waitFor();
  await page.screenshot({path:path.join(output,'user-monitor.png'),fullPage:true});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,deviceCount:total,errors},null,2));console.log(JSON.stringify({routes:checks.length,tables:checks.reduce((s,c)=>s+c.tables.length,0),deviceCount:total,errors,output},null,2));
 }catch(error){fs.writeFileSync(path.join(output,'partial-report.json'),JSON.stringify({checks,errors},null,2));await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});console.error(error);process.exitCode=1;}finally{await browser.close();}
})();
