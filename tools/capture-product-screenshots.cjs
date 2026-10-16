const {chromium}=require('C:/Users/yjf95/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve('../3. 产品功能截图_20260921'),version=process.argv[2]||'1.0',dir=path.join(root,version+'产品');fs.mkdirSync(dir,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});const records=[],errors=[],failures=[];try{
 const p=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});p.on('pageerror',e=>errors.push(e.message));let project='杭州市城区供水',source='内置演示数据';
 const wait=async()=>{await p.waitForTimeout(450);await p.waitForFunction(()=>!document.querySelector('.v2-empty[role="status"]')?.textContent.includes('正在加载'),{},{timeout:20000});await p.evaluate(()=>document.fonts.ready);};
 const go=async route=>{await p.goto('http://127.0.0.1:8765/index.html#'+route);await wait();for(const selector of ['[data-hy="colors-close"]','[data-hy="drawer-close"]','[data-hy="analysis-clear"]']){const b=p.locator(selector).first();if(await b.isVisible()){await b.click();await wait();}}if(route==='qualityMap'){await p.locator('[data-hy-change="metric"]').selectOption('chlorine');await wait();}const summary=p.locator('.map-layers details:not([open]) summary').first();if(await summary.isVisible()){await summary.click();await wait();}};
 const click=async selector=>{await p.locator(selector).first().click();await wait();};
 const act=async(a,id)=>click(`[data-v2="${a}"]${id?'[data-id="'+id+'"]':''}`);
 async function shot(module,title,note=''){await wait();const summary=p.locator('.map-layers details:not([open]) summary').first();if(await summary.isVisible())await summary.click();await p.locator('.product-toast').first().waitFor({state:'hidden',timeout:5000});await p.evaluate(()=>window.WaterMapViewport?.flush());const name=String(records.length+1).padStart(2,'0')+'_'+title.replace(/[\\/:*?"<>|]/g,'-')+'.png';await p.screenshot({path:path.join(dir,name)});records.push({version,module,title,note,project,source,route:new URL(p.url()).hash,file:version+'产品/'+name,width:1600,height:1000});fs.writeFileSync(path.join(root,'manifest-'+version+'.json'),JSON.stringify({records,errors,failures},null,2));console.log(version,name);}
 const item=async(module,title,route,fn,note)=>{try{await go(route);if(fn)await fn();await shot(module,title,note);}catch(e){failures.push({title,route,error:e.message});console.log('FAILED',title,e.message.slice(0,160));}};
 await p.goto('http://127.0.0.1:8765/index.html');await p.locator('#loginAccount').fill(version==='1.0'?'viewer1':'admin');await p.locator('#loginPassword').fill(version==='1.0'?'Viewer@2026':'admin');await p.getByRole('button',{name:'登录',exact:true}).click();await wait();
 if(version==='1.0')await shot('平台入口','城市项目管理');
 await click('[data-action="enter-project"][data-project-id="'+(version==='1.0'?'PRJ-001':'PRJ-SUIZHOU')+'"]');
 if(version==='1.0'){
  // Create illustrative records through the actual forms in this isolated browser.
  await go('p16');await click('[data-ops="task-new"]');await p.locator('#opsTaskForm [name="name"]').fill('中心城区管网周巡检');await p.locator('#opsTaskForm [name="assignee"]').selectOption('管线巡检班');await click('[data-ops="stop-add"]');for(const [i,id] of ['CITY-J-11','CITY-J-35','CITY-J-68'].entries())await p.locator('#opsTaskForm [name="stop"]').nth(i).selectOption(id);await p.locator('#opsTaskForm [name="accessConfirmed"]').check();await click('[data-ops="task-save"]');await p.locator('[data-ops="task-edit"]').first().waitFor();
  await go('p15');await click('[data-ops="work-new"]');await p.locator('#opsWorkForm [name="name"]').fill('中心东区压力异常现场核查');await p.locator('#opsWorkForm [name="hostId"]').selectOption('CITY-J-35');await p.locator('#opsWorkForm [name="assignee"]').selectOption('城东运维班');await p.locator('#opsWorkForm [name="priority"]').selectOption('紧急');await p.locator('#opsWorkForm [name="instructions"]').fill('核查监测点压力、阀门状态和沿线渗漏，记录现场处置结果。');await click('[data-ops="work-save"]');
  for(const [m,t,r] of [['一张图','运维一张图','p02'],['一张图','DMA分区漏损一张图','p02dma'],['一张图','管网资产一张图','p02asset'],['一张图','SCADA监测一张图','p10'],['拓扑管理','拓扑版本管理','p03'],['拓扑管理','拓扑编辑器与检查工具箱','p04'],['拓扑管理','拓扑设备挂接管理','p12'],['DMA分区管理','DMA方案管理','p06'],['DMA分区管理','DMA分区编辑器','p07'],['DMA分区管理','DMA历史记录','p06h'],['分析模块','监测点趋势分析','p11'],['分析模块','拓扑对比分析','p08'],['分析模块','对比数据总览','p09'],['数据模块','设备管理','devices'],['数据模块','数据质量','p14'],['数据模块','监测历史记录','p10h'],['异常报警','当日报警地图','p13'],['异常报警','报警历史记录','p13h'],['工单与巡检','工单管理地图','p15'],['工单与巡检','巡检任务管理','p16'],['工单与巡检','工单巡检历史','p15h']])await item(m,t,r);
  await item('一张图','监测对象详情与拓扑关系','p02',async()=>{await p.locator('.product-network [data-action="select-monitor"][data-value="P-DMA-3"]').first().evaluate(n=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})));});
  await item('拓扑管理','拓扑编辑工具与对象详情','p04',async()=>{await click('[data-we="object"]');await click('[data-we="edit"]');});
  await item('DMA分区管理','DMA成员与边界详情','p07',async()=>{await click('[data-we="table-type"][data-value="zone"]');await click('[data-we="object"]');});
  await item('异常报警','报警确认与处理详情','p13',async()=>{await click('[data-map-slot="bottom"] [data-ops="alarm-detail"]');});
  await item('工单与巡检','工单派发与处理详情','p15',async()=>{await click('[data-map-slot="bottom"] [data-ops="work-detail"]');});
  await item('工单与巡检','巡检路线与频率配置','p16',async()=>{await click('[data-ops="task-edit"]');});
  await item('主题与真实拓扑','运维一张图暗色主题','p02',async()=>{await click('[data-theme-toggle]:visible');});await click('[data-theme-toggle]:visible');
  await p.locator('#projectSelect').selectOption('PRJ-SUIZHOU');project='随州市供水管网';source='随州发布拓扑 SZ-20260921';
  await item('主题与真实拓扑','随州真实管网资产','p02asset');
 }else{
  project='随州市供水管网';source='随州计算 12152 · 2026-09-21 实际稳态结果';
  await item('水力模型','随州实时仿真一张图','simulation',null,'仅展示已导入的实际计算时刻。');
  for(const [metric,title] of [['pressure','压力'],['flow','流量'],['loss','管损'],['velocity','流速'],['head','水头']])await item('水力模型',title+'云图与分析','simulation',async()=>{await p.locator('[data-hy-change="metric"]').selectOption(metric);await click('[data-hy="analysis"]');});
  await item('水力模型','分级着色与自定义区间','simulation',async()=>{await click('[data-hy="colors"]');});
  await item('水力模型','设备端口与水力计算明细','simulation',async()=>{await click('[data-hy="table-tab"][data-value="pump"]');await click('.hy-ledger [data-hy="locate"]');});
  await item('水力模型','水力沙箱方案管理','hydraulic');
  await item('水力模型','发布拓扑与计算时刻沙箱配置','hydraulic',async()=>{await act('scene-open','SZ-BASELINE');});
  await item('水力模型','关阀爆管泄漏操作入口','valveAnalysis');
  await item('水力模型','地图关阀操作配置','valveAnalysis',async()=>{await act('scene-open');await click('[data-map-ledger="objects"] [data-v2="ws-select"][data-id="700000697"]');await act('ws-close');},'沙箱操作界面；修改后需接入求解器生成对应新结果。');
  await item('水力模型','爆管与自动关阀应急预案','emergency',async()=>{await act('scene-open');await p.locator('[name="ws-category"]').selectOption('pipe');await click('[data-map-ledger="objects"] [data-v2="ws-select"][data-id="100004314"]');await act('ws-burst');await act('ws-emergency');});
  await item('水力模型','历史计算云图与结果导出','hydraulicHistory');
  await item('水力模型','历史结果归档详情','hydraulicHistory',async()=>{await click('[data-ar="details"]');});
  await p.locator('#projectSelect').selectOption('PRJ-001');project='杭州市城区供水';source='标准场景演示数据 · 原型计算';await go('modelReview');await p.locator('[data-v2="review-compare"]').first().waitFor({timeout:30000});
  await item('计算与场景','水力水质标准场景目录','modelReview');
  await item('计算与场景','计算任务与运行状态','calculationCenter');
  await item('计算与场景','方案计算结果对比','modelReview',async()=>{await act('review-compare','02');});
  await item('计算与场景','应急方案计算影响分析','modelReview',async()=>{const id=await p.evaluate(async()=>{const d=await WaterV2Storage.read('PRJ-001');return d.reviewPack.records.find(r=>r.code==='07').sceneId;});await act('scene-result',id);await act('findings');});
  await item('计算与场景','多时刻实时仿真时间轴','simulation');
  await item('计算与场景','水龄云图与高水龄用户分析','simulation',async()=>{await p.locator('[data-hy-change="metric"]').selectOption('age');await click('[data-hy="analysis"]');},'随州结果未提供水龄，此图使用标准演示数据。');
  for(const [m,t,r] of [['水质模型','水质沙箱方案管理','qualityScenes'],['水质模型','水质管控一张图','qualityMap'],['水质模型','水质异常影响分析方案','qualityEvent'],['水质模型','水质历史计算云图与导出','qualityHistory'],['管控计划','管控计划列表','controlPlans']])await item(m,t,r);
  await item('水质模型','水质沙箱拓扑与参数配置','qualityScenes',async()=>{await act('scene-open');});
  await item('水质模型','余氯云图与水质异常分析','qualityMap',async()=>{await click('[data-hy="analysis"]');});
  await item('水质模型','水质异常场景影响结果','modelReview',async()=>{const id=await p.evaluate(async()=>{const d=await WaterV2Storage.read('PRJ-001');return d.reviewPack.records.find(r=>r.code==='10').sceneId;});await act('scene-result',id);await act('findings');});
  await item('管控计划','管控计划审核与执行详情','controlPlans',async()=>{await act('plan-detail');});
  await item('主题','水质一张图暗色主题','qualityMap',async()=>{await click('[data-theme-toggle]:visible');});
 }
 fs.writeFileSync(path.join(root,'manifest-'+version+'.json'),JSON.stringify({records,errors,failures},null,2));console.log(JSON.stringify({count:records.length,errors,failures}));if(errors.length||failures.length)process.exitCode=1;
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
