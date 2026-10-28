// End-to-end checks against a disposable, isolated browser storage context.
const {chromium}=require('C:/Users/yjf95/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),XLSX=require('../vendor/xlsx.full.min.js');
const base=process.env.PROTOTYPE_URL||'http://127.0.0.1:8765/index.html',dir=path.resolve(__dirname,'../artifacts/campus-metering');
fs.mkdirSync(dir,{recursive:true});
const checks=[],errors=[],consoleErrors=[],downloads=[];
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true}),page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push({message:message.text(),location:message.location()});});
 async function login(){await page.locator('#loginAccount').fill('admin');await page.locator('#loginPassword').fill('admin');await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator('[data-action="enter-project"][data-project-id="PRJ-SH-CAMPUS"]').click();}
 async function go(route,selector='.sp-page'){await page.goto(base+'#'+route);await page.locator(selector).first().waitFor();}
 async function act(action,id){await page.locator(`[data-sp="${action}"]${id===undefined?'':`[data-id="${id}"]`}`).first().click();}
 async function download(action,name){const pending=page.waitForEvent('download');await act(action);const item=await pending,file=path.join(dir,name);await item.saveAs(file);downloads.push(name);return file;}
 const allCount=locator=>locator.evaluate(table=>WaterTable.rows(table).length);
 const allCells=locator=>locator.evaluate(table=>WaterTable.rows(table).map(row=>Array.isArray(row)?row:[...row.cells].map(cell=>cell.textContent)));
 async function searchDevices(query){const form=page.locator('.sp-page > .sp-table .water-table-query');await form.getByRole('searchbox',{name:'搜索当前表格'}).fill(query);await form.getByRole('button',{name:'查询',exact:true}).click();}
 const workbook=file=>{const wb=XLSX.read(fs.readFileSync(file),{type:'buffer'});return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);};
 const chart=async()=>JSON.parse(decodeURIComponent(await page.locator('.dma-analysis-chart').getAttribute('data-echart-line')));
 async function snapshot(){return page.evaluate(()=>{const project='PRJ-SH-CAMPUS',devices=JSON.parse(localStorage.getItem('water-devices:'+project)),store=JSON.parse(localStorage.getItem('water-topology-store:'+project)),standard=JSON.parse(localStorage.getItem('water-standard:'+project));return {devices,bindings:store.bindings,standard,marker:localStorage.getItem('water-campus-metering:'+project),storageUnits:Object.entries(localStorage).reduce((sum,[key,value])=>sum+key.length+value.length,0),deviceUnits:localStorage.getItem('water-devices:'+project).length,standardUnits:localStorage.getItem('water-standard:'+project).length};});}
 try{
  await page.goto(base);await login();await go('devices');const initial=await snapshot();
  assert.equal(initial.devices.filter(d=>d.preset).length,96);assert.equal(initial.devices.filter(d=>d.businessUserId).length,60);assert.equal(initial.bindings.filter(b=>b.preset).length,36);
  assert.equal(new Set(initial.devices.map(d=>d.id)).size,initial.devices.length);assert(initial.bindings.every(b=>b.devices.every(id=>!initial.devices.find(d=>d.id===id)?.businessUserId)));
  assert.equal(await allCount(page.locator('.sp-page > .sp-table table')),96);assert.match(await page.locator('.sp-page').innerText(),/预设待安装/);assert.match(await page.locator('.sp-page').innerText(),/示例非实测/);
  checks.push({check:'ledger-and-bindings',devices:96,businessMeters:60,physicalBindings:36,noDoubleCounting:true});
  const ledger=workbook(await download('ledger-export','device-ledger.xlsx'));assert.equal(ledger.length,96);const childRow=ledger.find(r=>r['设备编号']==='CAMPUS-D1-U01');assert.equal(childRow['用户或宿主编号'],'CAMPUS-D1-USER01');assert.equal(childRow['上级三级表'],'CAMPUS-L3-D1-F');assert.equal(childRow['数据来源'],'示例非实测');
  // Physical installation instrument: full daily usage and matching exports.
  const id='CAMPUS-L2-M4-F',device=initial.devices.find(d=>d.id===id);
  await searchDevices(id);
  assert.equal(await page.locator('.sp-page > .sp-table tbody tr').count(),1);await act('data',id);await act('data-tab','usage');
  assert.equal(await allCount(page.locator('.sp-data-drawer .sp-table table')),118);assert(await page.locator('.sp-data-drawer .sp-trend').count());
  const expected=+device.daily.reduce((sum,r)=>sum+r.volume,0).toFixed(3),shown=await page.locator('.sp-data-drawer .sp-data-summary').last().locator('strong').first().innerText();assert.equal(parseFloat(shown),expected);
  await page.waitForFunction(()=>!document.querySelector('#toastRoot')?.children.length);await page.screenshot({path:path.join(dir,'device-usage.png')});
  const usage=workbook(await download('usage-export','device-usage.xlsx'));assert.equal(usage.length,118);assert.equal(+usage.reduce((sum,r)=>sum+r['当日用水量 m³'],0).toFixed(3),expected);assert.equal(usage.at(-1)['日末累计水量 m³'],device.daily.at(-1).total);
  const csv=await download('usage-csv','device-usage.csv');assert.match(fs.readFileSync(csv,'utf8'),/示例非实测/);
  checks.push({check:'device-usage',id,days:118,volume:expected,exports:['xlsx','csv']});
  // A selected time ending at 23:59 includes the 23:59:59 cumulative sample.
  await act('data-tab','history');assert.equal(await page.locator('.sp-data-drawer [name="metric"]').inputValue(),'flow');
  const expectedFlow=device.samples.filter(s=>s.metric==='flow');assert.equal(await allCount(page.locator('.sp-data-drawer table')),expectedFlow.length);
  await page.locator('.sp-data-drawer [name="metric"]').selectOption('volume');await page.locator('[data-sp-form="history"] button').click();
  assert.equal(await allCount(page.locator('.sp-data-drawer table')),device.samples.filter(s=>s.metric==='volume').length);assert.match((await allCells(page.locator('.sp-data-drawer table'))).at(-1).join(' '),/23:59:59/);
  const volumeRows=workbook(await download('data-export','cumulative-history.xlsx'));assert.equal(volumeRows.at(-1)['值'],device.daily.at(-1).total);assert.equal(volumeRows.at(-1)['数据来源'],'示例非实测');
  await page.screenshot({path:path.join(dir,'device-volume-history.png')});checks.push({check:'flow-volume-history',flowSamples:expectedFlow.length,volumeSamples:volumeRows.length,lastReading:volumeRows.at(-1)['值']});await act('close-data');
  // Editing an existing user submeter must not add a node flow binding.
  await searchDevices('CAMPUS-D1-U01');await act('edit','CAMPUS-D1-U01');assert.equal(await page.locator('[data-sp-form="device"] [name="hostId"]').inputValue(),'22');
  await page.locator('[data-sp-form="device"] [name="name"]').fill('宿舍1 用户01 · 回归验证');await page.locator('[data-sp-form="device"] button[type="submit"], [data-sp-form="device"] button:not([type])').last().click();
  const afterEdit=await snapshot();assert.equal(afterEdit.bindings.length,initial.bindings.length);assert(afterEdit.bindings.every(b=>!b.devices.includes('CAMPUS-D1-U01')));assert.equal(afterEdit.devices.find(d=>d.id==='CAMPUS-D1-U01').name,'宿舍1 用户01 · 回归验证');checks.push({check:'edit-submeter-no-aggregate',passed:true});
  // Comparison and monthly difference share the same totals and daily detail.
  await go('leakage');await page.locator('[name="zone"]').selectOption('DMA-02');await page.locator('[data-sp-form="analysis-query"] button').click();
  assert.equal(await page.locator('[name="start"]').inputValue(),'2026-07');assert.equal(await page.locator('[name="end"]').inputValue(),'2026-09');let config=await chart();assert.deepEqual(config.series.map(s=>s.name),['分区用水量','营收水量']);assert.equal(config.series[0].data.length,3);assert(config.series.every(s=>s.data.every(Number.isFinite)));assert.match(await page.locator('.sp-page').innerText(),/不能全部认定为漏损/);
  await act('analysis-details');assert.equal(await page.locator('.sp-page .sp-panel .sp-table tbody tr').count(),3);await act('finding',await page.locator('[data-sp="finding"]').last().getAttribute('data-id'));assert.equal(await allCount(page.locator('[aria-label="月度水量明细"] table')),30);await act('close-finding');
  await page.locator('.sp-heading').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(dir,'dma-monthly-comparison.png')});
  const monthly=workbook(await download('analysis-export','dma-monthly.xlsx'));assert.equal(monthly.length,3);assert.equal(monthly[0]['数据来源'],'校园预设示例（非实测）');assert.match(monthly[0]['统计说明'],/30/);
  await page.locator('[name="analysisMetric"]').selectOption('difference');const difference=await chart();assert.equal(difference.series.length,1);assert.equal(difference.series[0].name,'月度差值');difference.series[0].data.forEach((value,i)=>assert(Math.abs(value-(config.series[0].data[i]-config.series[1].data[i]))<.002));
  checks.push({check:'dma-month-comparison-difference-daily',zone:'DMA-02',months:3,detailDays:30,comparison:config.series.map(s=>({name:s.name,data:s.data}))});
  // Same source hourly volumes, no persistence of the synthesized large array.
  await page.locator('[name="analysisMetric"]').selectOption('hourly');await page.locator('[name="start"]').fill('2026-10-20');await page.locator('[name="end"]').fill('2026-10-21');await page.locator('[data-sp-form="analysis-query"] button').click();
  config=await chart();assert.equal(config.series[0].data.length,48);assert(config.series[0].data.every(Number.isFinite));assert.equal(await allCount(page.locator('.sp-page .sp-panel .sp-table table')),48);
  const hourly=workbook(await download('analysis-export','dma-hourly.xlsx'));assert.equal(hourly.length,48);const sum=+hourly.reduce((total,r)=>total+r['分区用水量 m³'],0).toFixed(3),expectedHours=+initial.standard.balances.filter(r=>r.zoneId==='DMA-02'&&r.date>='2026-10-20'&&r.date<='2026-10-21').reduce((total,r)=>total+r.inlet-r.outlet,0).toFixed(3);assert.equal(sum,expectedHours);
  await page.locator('.sp-heading').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(dir,'dma-hourly-analysis.png')});checks.push({check:'dma-hourly',hours:48,total:sum,matchesDaily:true});
  // Boundaries with no downstream sales meters remain explicitly unknown.
  await page.locator('[name="analysisMetric"]').selectOption('comparison');
  for(const zone of ['DMA-01','DMA-03','DMA-04']){await page.locator('[name="zone"]').selectOption(zone);await page.locator('[data-sp-form="analysis-query"] button').click();const c=await chart();assert(c.series[0].data.every(Number.isFinite));if(zone!=='DMA-04'){assert(c.series[1].data.every(v=>v===null));assert.match(await page.locator('.sp-page').innerText(),/待抄表/);}else{assert(c.series[1].data.every(Number.isFinite));assert.match(await page.locator('.sp-page').innerText(),/合计估算/);}checks.push({check:'dma-coverage',zone,revenueAvailable:zone==='DMA-04'});}
  // Creating and exporting a saved report must not materialize hourly fixtures.
  await go('reports');await act('report-generate');assert(await page.locator('[data-sp="report-xlsx"]').count());const report=workbook(await download('report-xlsx','saved-ledger-report.xlsx'));assert.equal(report.length,96);
  const beforeReload=await snapshot();assert.equal((beforeReload.standard.hourlyBalances||[]).length,0);assert(beforeReload.storageUnits*2<5*1024*1024);assert(beforeReload.standardUnits<500000);
  await page.reload();await login();await go('devices');const afterReload=await snapshot();assert.equal(afterReload.devices.length,beforeReload.devices.length);assert.deepEqual(afterReload.bindings,beforeReload.bindings);assert.deepEqual(afterReload.devices,beforeReload.devices);assert.deepEqual(afterReload.standard,beforeReload.standard);assert.equal(afterReload.marker,beforeReload.marker);checks.push({check:'refresh-idempotence-and-capacity',storageUnits:afterReload.storageUnits,estimatedUtf16Bytes:afterReload.storageUnits*2,deviceUnits:afterReload.deviceUnits,standardUnits:afterReload.standardUnits,persistedHours:0,editedDevicePreserved:true});
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);fs.rmSync(path.join(dir,'failure.png'),{force:true});
  fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({status:'PASS',checks,downloads,errors,consoleErrors},null,2));console.log(`PASS ${checks.length} campus browser checks; ${downloads.length} exports; ${dir}`);
 }catch(error){await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({status:'FAIL',checks,downloads,errors,consoleErrors,error:error.stack,url:page.url()},null,2));throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
