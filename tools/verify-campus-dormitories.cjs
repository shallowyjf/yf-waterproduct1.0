// Real-browser regression against an isolated, disposable browser profile.
const {chromium}=require('C:/Users/yjf95/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../campus-metering.js');
const base=process.env.PROTOTYPE_URL||'http://127.0.0.1:8765/index.html';
const account=process.env.PROTOTYPE_ACCOUNT==='school'?'school':'admin';
const output=path.resolve(__dirname,'../artifacts/campus-dormitories'+(account==='school'?'-school':''));fs.mkdirSync(output,{recursive:true});
const dorms=['22','JS625','JS42','JS615','JS608','JS612'],seed=C.seed(),checks=[],errors=[];
const dmaChecks=[];let mainMenuPages=[];
const fixed=value=>value.toFixed(3),milli=value=>Math.round(value*1000);
const period=(id,start,end)=>seed.devices.find(d=>d.id===id).daily.filter(r=>r.date>=start&&r.date<=end).reduce((sum,r)=>sum+milli(r.volume),0)/1000;
const last=(id,end)=>seed.devices.find(d=>d.id===id).daily.find(r=>r.date===end);
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 let page;
 try{
  page=await browser.newPage({viewport:{width:1600,height:1200}});
  page.on('pageerror',error=>errors.push(error.message));
  async function login(){
   await page.locator('#loginAccount').fill(account==='school'?'school1':'admin');
   await page.locator('#loginPassword').fill(account==='school'?'School@2026':'admin');
   await page.getByRole('button',{name:'登录',exact:true}).click();
   if(account==='admin')await page.locator('[data-action="enter-project"][data-project-id="PRJ-SH-CAMPUS"]').click();
   await page.goto(base+'#p10');
   await page.locator('.product-gis-contextbar').waitFor();
  }
  async function schoolMenus(){
   const pages=[];
   for(const group of await page.locator('#sideNav [data-action="toggle-primary-nav"]').evaluateAll(nodes=>nodes.map(n=>n.dataset.value))){
    await page.locator(`#sideNav [data-action="toggle-primary-nav"][data-value="${group}"]`).click();
    pages.push(...await page.locator('#navDrawer [data-page]').evaluateAll(nodes=>nodes.map(n=>n.dataset.page)));
    await page.locator('#navDrawer [data-action="close-nav-drawer"]').click();
   }
   assert.deepEqual(pages.sort(),['leakage','p02asset','p02dma','p10']);
   assert.equal(await page.locator('#projectSelect option').count(),1);
   assert.equal(await page.locator('#projectSelect').inputValue(),'PRJ-SH-CAMPUS');
   return pages;
  }
  await page.goto(base);
  await login();
  if(account==='school')mainMenuPages=await schoolMenus();
  const panel=()=>page.locator('.user-floors[data-floor-mode="monitor"]');
  async function openDorm(number){
   const expand=page.getByRole('button',{name:'展开监测对象抽屉',exact:true});
   if(await expand.count())await expand.click();
   await page.locator('[data-action="p10-bottom-tab"][data-value="users"]').click();
   const search=page.locator('[data-user-ledger="true"] .water-table-query');
   await search.getByRole('searchbox',{name:'搜索当前表格'}).fill('宿舍'+number);
   await search.getByRole('button',{name:'查询',exact:true}).click();
   const rows=page.locator('[data-user-ledger="true"] tbody tr:not([hidden])');
   assert.equal(await rows.count(),1,'search must find only dorm '+number);
   const cells=await rows.first().locator('td').allTextContents();
   assert.equal(cells[0],dorms[number-1]);assert.equal(cells[1],'宿舍'+number);
   assert.equal(cells[2],'10');assert.equal(cells[3],'1');
   await rows.locator('[data-action="open-user-monitor"]').click();
   await page.locator(`.user-floors[data-floor-root="${dorms[number-1]}"]`).waitFor();
   assert.match(await panel().textContent(),/预设设备 · 示例数据/);
  }
  async function query(start,end){
   await panel().locator('input[name="start"]').fill(start);
   await panel().locator('input[name="end"]').fill(end);
   await panel().locator('[data-floor-form="range"]').getByRole('button',{name:'查询',exact:true}).click();
   assert.equal(await panel().locator('input[name="start"]').inputValue(),start);
   assert.equal(await panel().locator('input[name="end"]').inputValue(),end);
  }
  async function assertRoot(number,start,end){
   const meter=`CAMPUS-L3-D${number}-F`,row=last(meter,end);
   assert.deepEqual(await panel().locator(':scope > .floor-summary strong').allTextContents(),[fixed(row.flow),fixed(row.total),fixed(period(meter,start,end))]);
  }
  for(let number=1;number<=6;number++){
   console.log('Checking 宿舍'+number);
   await openDorm(number);
   assert.equal(await panel().locator('input[name="start"]').inputValue(),'2026-10-20');
   assert.equal(await panel().locator('input[name="end"]').inputValue(),'2026-10-26');
   await assertRoot(number,'2026-10-20','2026-10-26');
   const children=()=>panel().locator(':scope > .floor-monitor-table tbody tr');
   assert.equal(await children().count(),5);
   assert.deepEqual(await children().locator('td:first-child').allTextContents(),['用户01','用户02','用户03','用户04','用户05']);
   const pages=()=>panel().locator(':scope > .floor-monitor-table .water-table-pagination');
   assert.match(await pages().textContent(),/共 10 条.*1 \/ 2/);
   assert.equal(await pages().locator('[data-water-page="prev"]').isDisabled(),true);
   await pages().locator('[data-water-page="next"]').click();
   assert.deepEqual(await children().locator('td:first-child').allTextContents(),['用户06','用户07','用户08','用户09','用户10']);
   assert.equal(await pages().locator('[data-water-page="next"]').isDisabled(),true);
   await pages().locator('[data-water-page="prev"]').click();
   await query('2026-10-12','2026-10-26');
   await assertRoot(number,'2026-10-12','2026-10-26');
   const userMeter=`CAMPUS-D${number}-U01`,userId=`CAMPUS-D${number}-USER01`;
   const row=last(userMeter,'2026-10-26');
   assert.deepEqual(await children().first().locator('td').allTextContents(),['用户01',fixed(row.flow),fixed(row.total),fixed(period(userMeter,'2026-10-12','2026-10-26'))]);
   await panel().locator(`[data-floor-action="select"][data-id="${userId}"]`).click();
   assert.equal(await panel().locator('.floor-detail h4').textContent(),'用户01 · 每日用水');
   const daily=()=>panel().locator('.floor-detail tbody tr');
   assert.equal(await daily().count(),7);
   assert.equal(await daily().first().locator('td:first-child').textContent(),'2026-10-12');
   let expected=last(userMeter,'2026-10-12');
   assert.deepEqual(await daily().first().locator('td').allTextContents(),['2026-10-12',fixed(Math.round(expected.volume/24*1000)/1000),fixed(expected.total),fixed(expected.volume)]);
   await panel().locator('.floor-detail [data-water-page="next"]').click();
   assert.equal(await daily().first().locator('td:first-child').textContent(),'2026-10-19');
   await panel().locator('.floor-detail [data-water-page="next"]').click();
   assert.equal(await daily().count(),1);
   assert.equal(await daily().first().locator('td:first-child').textContent(),'2026-10-26');
   assert.equal(await panel().locator('.floor-detail [data-water-page="next"]').isDisabled(),true);
   await panel().locator('[data-floor-action="recent"]').click();
   await panel().locator('[data-floor-action="analysis"]').click();
   assert.equal(await panel().locator('[data-floor-action="analysis"]').getAttribute('aria-pressed'),'true');
   const total=period(`CAMPUS-L3-D${number}-F`,'2026-10-20','2026-10-26');
   const sub=Array.from({length:10},(_,i)=>`CAMPUS-D${number}-U${String(i+1).padStart(2,'0')}`).reduce((sum,id)=>sum+milli(period(id,'2026-10-20','2026-10-26')),0)/1000;
   const difference=(milli(total)-milli(sub))/1000;
   assert.deepEqual(await panel().locator('.floor-comparison strong').allTextContents(),[fixed(total),fixed(sub),fixed(difference),(Math.round(difference/total*100*1000)/1000).toFixed(2)+'%']);
   assert.match(await panel().locator('.floor-analysis-note').first().textContent(),/覆盖 10 \/ 10 个用户水表/);
   assert.equal(await panel().locator('.floor-trend-total').count(),1);
   assert.equal(await panel().locator('.floor-trend-subTotal').count(),1);
   assert.equal(await panel().locator('.floor-dot-total').count(),7);
   assert.equal(await panel().locator('.floor-dot-subTotal').count(),7);
   await panel().locator('.floor-daily-comparison summary').click();
   assert.equal(await panel().locator('.floor-daily-comparison tbody tr').count(),7);
   if(number===3){
    assert.match(await panel().locator('.floor-notices').textContent(),/超过15%/);
    await panel().locator('.floor-analysis').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'dormitory-3-analysis.png')});
    await panel().locator('.floor-analysis').screenshot({path:path.join(output,'dormitory-3-analysis-detail.png')});
   }
   await query('2026-10-27','2026-10-29');
   assert.deepEqual(await panel().locator(':scope > .floor-summary strong').allTextContents(),['—','—','—']);
   assert.deepEqual(await panel().locator('.floor-comparison strong').allTextContents(),['—','—','—','—']);
   assert.match(await panel().locator('.floor-notices').textContent(),/缺失读数/);
   assert.equal(await panel().locator('.floor-trend-total').count(),0);
   assert.equal(await panel().locator('.floor-trend-subTotal').count(),0);
   assert.deepEqual(await children().first().locator('td').allTextContents(),['用户01','—','—','—']);
   await query('2026-10-25','2026-10-28');
   assert.deepEqual(await panel().locator(':scope > .floor-summary strong').allTextContents(),['—','—','—']);
   assert.equal(await panel().locator('.floor-dot-total').count(),2,'partial range displays only the two actual days');
   await panel().locator('[data-floor-action="recent"]').click();
   await panel().locator('[data-floor-action="overview"]').click();
   assert.equal(await panel().locator('.floor-analysis').count(),0);
   await assertRoot(number,'2026-10-20','2026-10-26');
   checks.push({dormitory:number,hostId:dorms[number-1],users:10,childPages:2,dateQueryDays:15,dailyPages:3,analysisTotal:total,analysisSubTotal:sub,difference,outOfRangeEmpty:true,partialRangeNoInventedReadings:true});
  }
  const storedBefore=await page.evaluate(()=>({devices:localStorage.getItem('water-devices:PRJ-SH-CAMPUS'),store:localStorage.getItem('water-topology-store:PRJ-SH-CAMPUS'),marker:localStorage.getItem('water-campus-metering:PRJ-SH-CAMPUS')}));
  await page.reload();
  // The prototype keeps its login session in memory; log in again through the
  // real UI before checking that the durable device/topology data survived.
  await login();
  for(let number=1;number<=6;number++){
   await openDorm(number);
   await assertRoot(number,'2026-10-20','2026-10-26');
   assert.match(await panel().locator(':scope > .floor-monitor-table .water-table-pagination').textContent(),/共 10 条/);
  }
  const storedAfter=await page.evaluate(()=>({devices:localStorage.getItem('water-devices:PRJ-SH-CAMPUS'),store:localStorage.getItem('water-topology-store:PRJ-SH-CAMPUS'),marker:localStorage.getItem('water-campus-metering:PRJ-SH-CAMPUS')}));
  assert.deepEqual(storedAfter,storedBefore);
  assert.equal(JSON.parse(storedAfter.devices).filter(d=>d.id.startsWith('CAMPUS-')).length,96);
  assert.equal(storedAfter.marker,C.revision);
  if(account==='school'){
   assert.deepEqual(await schoolMenus(),mainMenuPages);
   await page.locator('#sideNav [data-action="toggle-primary-nav"][data-value="analysis"]').click();
   await page.locator('#navDrawer [data-page="leakage"]').click();
   await page.locator('[data-sp-form="analysis-query"]').waitFor();
   for(const zone of ['DMA-02','DMA-04']){
    const form=()=>page.locator('[data-sp-form="analysis-query"]');
    await form().locator('[name="zone"]').selectOption(zone);
    await form().locator('[name="analysisMetric"]').selectOption('comparison');
    await form().locator('[name="start"]').fill('2026-07');
    await form().locator('[name="end"]').fill('2026-09');
    await form().getByRole('button',{name:'查询',exact:true}).click();
    const chart=await page.locator('.dma-analysis-chart').evaluate(el=>JSON.parse(decodeURIComponent(el.dataset.echartLine)));
    assert.deepEqual(chart.times,['2026-07','2026-08','2026-09']);
    assert.deepEqual(chart.series.map(s=>s.name),['分区用水量','营收水量']);
    assert.ok(chart.series.every(s=>s.data.every(v=>typeof v==='number'&&v>0)));
    assert.deepEqual(chart.series[1].data,['2026-07','2026-08','2026-09'].map(month=>seed.standard.revenueRecords.find(r=>r.zoneId===zone&&r.month===month).volume));
    await form().locator('[name="analysisMetric"]').selectOption('hourly');
    await form().locator('[name="start"]').fill('2026-10-25');
    await form().locator('[name="end"]').fill('2026-10-26');
    await form().getByRole('button',{name:'查询',exact:true}).click();
    const hourly=await page.locator('.dma-analysis-chart').evaluate(el=>JSON.parse(decodeURIComponent(el.dataset.echartLine)));
    assert.equal(hourly.times.length,48);
    assert.ok(hourly.series[0].data.every(v=>typeof v==='number'&&v>=0));
    const expected=seed.standard.balances.filter(r=>r.zoneId===zone&&r.date>='2026-10-25'&&r.date<='2026-10-26').reduce((sum,r)=>sum+milli(r.inlet)-milli(r.outlet),0);
    assert.equal(hourly.series[0].data.reduce((sum,v)=>sum+milli(v),0),expected);
    dmaChecks.push({zone,monthlyUsageAndRevenue:true,months:3,hourlyPoints:48,hourlySumMatchesDaily:true});
   }
   await page.screenshot({path:path.join(output,'school-dma-analysis.png')});
   assert.deepEqual(await schoolMenus(),mainMenuPages);
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({account,mainMenuPages,checks,dmaChecks,reloadRequiresLogin:true,reloadRetainedAllSixDormitories:true,registryAndTopologyUnchanged:true,errors},null,2));
  for(const name of ['failure.png','failure.json'])fs.rmSync(path.join(output,name),{force:true});
  console.log(`PASS ${account}: ${checks.length} dormitory browser scenarios plus refresh, ${dmaChecks.length} DMA scenarios; evidence: ${output}`);
 }catch(error){
  if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
  fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({account,message:error.message,checks,dmaChecks,errors},null,2));
  throw error;
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
