const { chromium } = require('C:/Users/yjf95/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const dir=path.resolve(__dirname,'../artifacts/map-layout');
fs.mkdirSync(dir,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:898}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/index.html');
 await page.locator('#loginAccount').fill('admin');await page.locator('#loginPassword').fill('admin');await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'进入项目',exact:true}).first().click();
 await page.waitForTimeout(3200);
 const report=[],checks=[];
 async function go(route){await page.goto('http://127.0.0.1:8765/index.html#'+route);await page.waitForTimeout(150);}
 async function layout(label){const rects=await page.evaluate(()=>{const r=document.querySelector('[data-map-workspace]');const get=slot=>{const n=r.querySelector(':scope>[data-map-slot="'+slot+'"]');if(!n)return null;return JSON.parse(JSON.stringify(n.getBoundingClientRect()));};return {left:get('left'),bottom:get('bottom'),right:get('right'),issues:!!r.querySelector('.map-issues'),height:r.clientHeight};});assert(rects.left&&rects.bottom&&rects.right,label+' has three panels');assert(rects.left.bottom<=rects.bottom.top+1,label+' left clears bottom');assert(rects.bottom.right<=rects.right.left+1,label+' bottom clears details');assert(rects.issues,label+' reserves issues');assert.equal(errors.length,0,errors.join('\n'));checks.push(label);}
 for(const route of ['p02','p02dma','p02asset','p04','p07','p08','p06compare','p10','p06h','p10h','p13','p13h','p15','p15h','simulation','qualityMap','p01']){
  await page.goto('http://127.0.0.1:8765/index.html#'+route);await page.waitForTimeout(350);
  const result=await page.evaluate(()=>[...document.querySelectorAll('[data-map-workspace]')].map(r=>({key:r.dataset.mapWorkspace,slots:[...r.children].filter(n=>n.dataset.mapSlot).map(n=>({slot:n.dataset.mapSlot,rect:JSON.parse(JSON.stringify(n.getBoundingClientRect())),visible:getComputedStyle(n).display!=='none'})),issues:!!r.querySelector('.map-issues'),height:r.clientHeight,bodyOverflow:document.documentElement.scrollHeight-innerHeight})));
  report.push({route,result,errors:errors.splice(0)});
  assert.equal(result.length,1,route+' map workspace');assert(result[0].issues,route+' issues slot');assert.equal(report.at(-1).errors.length,0,route+' runtime');
  if(['p04','p07','p08','simulation','p10','p13'].includes(route))await page.screenshot({path:path.join(dir,route+'.png')});
 }
 for(const width of [1280,1081]){
 await page.setViewportSize({width,height:898});
 await go('p04');await page.locator('[data-we="object"]').first().click();await layout('topology '+width);
 const first=await page.locator('[data-map-slot="bottom"] tbody tr').first().textContent();await page.locator('[data-we="table-next"]').click();assert.notEqual(await page.locator('[data-map-slot="bottom"] tbody tr').first().textContent(),first);
 await page.locator('[data-we="table-type"][data-value="valve"]').click();assert((await page.locator('[data-map-slot="bottom"] tbody').textContent()).includes('阀门'));
 await page.locator('[data-we="edit"]').click();assert(await page.locator('.we-edit-tools').isVisible());await page.screenshot({path:path.join(dir,'topology-detail-'+width+'.png')});await page.locator('[data-we="view"]').click();
 await go('p07');await page.locator('[data-we="table-type"][data-value="zone"]').click();await page.locator('[data-we="object"]').first().click();await layout('dma '+width);await page.locator('[data-map-toggle="bottom"]').click();await page.locator('[data-we="show-members"]').click();assert.equal(await page.locator('.map-bottom-closed').count(),0);assert(await page.locator('[data-we="table-type"][data-value="members"]').getAttribute('aria-selected')==='true');await page.screenshot({path:path.join(dir,'dma-detail-'+width+'.png')});
 await go('p08');await page.locator('[data-map-slot="bottom"] tbody button').first().click();await layout('comparison '+width);assert.equal(await page.locator('.product-map-compare-pane:visible').count(),2);await page.locator('[data-map-ledger-tab="bindings"]').click();assert(await page.locator('[data-map-ledger="bindings"]').isVisible());await page.locator('[data-map-ledger-tab="objects"]').click();await page.screenshot({path:path.join(dir,'compare-detail-'+width+'.png')});
 await go('p02');await page.locator('[data-action="global-search"]').click();await page.locator('[data-map-slot="bottom"] [data-action="select-monitor"]').first().click();await layout('one-map '+width);
 await page.locator('[data-action="open-layer-style"]').first().click();assert(await page.locator('[data-map-slot="right"] .product-layer-style-editor').isVisible());assert(await page.locator('[data-map-slot="left"] .product-layer-control-row').first().isVisible());await page.locator('[data-action="close-layer-style"]').click();
 await go('p10');if(await page.locator('[data-action="toggle-p10-bottom"][aria-label]').getAttribute('aria-label')==='展开监测对象抽屉')await page.locator('[data-action="toggle-p10-bottom"]').first().click();await page.locator('[data-map-slot="bottom"] [data-action="select-monitor"]').first().click();await layout('scada '+width);
 await go('p10h');const toggle=page.locator('[data-action="toggle-history-bottom"]');if(await toggle.getAttribute('aria-label')==='展开历史记录')await toggle.click();await page.locator('[data-map-slot="bottom"] [data-action="history-select"]').first().click();await layout('history '+width);
 await go('p13');await page.locator('[data-map-slot="bottom"] [data-ops="alarm-detail"]').first().click();await layout('alarm '+width);await page.locator('[data-map-layer=".we-pipe"]').uncheck();await page.locator('[data-map-slot="bottom"] [data-ops="alarm-detail"]').first().click();assert.equal(await page.locator('[data-map-layer=".we-pipe"]').isChecked(),false);
 await go('p15');await page.locator('[data-ops="work-new"]').click();await layout('work '+width);
 for(const route of ['simulation','qualityMap']){await go(route);await page.locator('[data-hy="analysis"]').click();await layout(route+' '+width);await page.locator('[data-hy="analysis-clear"]').click();await page.locator('[data-hy="table-tab"][data-value="user"]').click();await page.locator('[data-hy="locate"]').last().click();await layout(route+' object '+width);await page.screenshot({path:path.join(dir,route+'-detail-'+width+'.png')});await page.locator('.map-layers summary').click();await page.locator('[data-hy="colors"]').click();await layout(route+' colors '+width);assert(await page.locator('[data-map-slot="right"].hy-color-editor').isVisible());await page.locator('[data-hy="colors-close"]').click();}
 }
 await go('hydraulic');await page.locator('[data-v2="scene-new"]').click();await page.locator('[data-v2="scene-submit"]').click();await page.locator('[data-v2="job-result"]').first().click({timeout:20000});await page.locator('[data-map-workspace]').waitFor();
 await page.locator('[data-v2="findings"]').click();await layout('v2 findings');assert(await page.locator('[data-map-slot="bottom"] [data-v2="finding-locate"]').count()>0);await page.screenshot({path:path.join(dir,'v2-findings.png')});await page.locator('[data-v2="finding-locate"]').first().click();await layout('v2 finding detail');
 await page.locator('.v2-result-actions [data-v2="plan-from-run"]').click();await layout('v2 plan');assert(await page.locator('[data-map-slot="right"] #v2-plan-form').isVisible());await page.locator('[data-map-slot="right"] [data-v2="drawer-close"]').click();
 await page.getByRole('button',{name:'暗色',exact:false}).click();await go('simulation');await page.waitForTimeout(3200);await page.screenshot({path:path.join(dir,'simulation-dark.png')});await go('p04');await page.screenshot({path:path.join(dir,'topology-dark.png')});
 await page.goto('http://127.0.0.1:8765/index.html#p16');await page.getByRole('button',{name:'新建巡检任务',exact:true}).click();await page.screenshot({path:path.join(dir,'route.png')});report.push({route:'inspection-route',roots:await page.locator('[data-map-workspace]').count(),errors:errors.splice(0)});
 await layout('inspection route');
 fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({report,checks},null,2));
 console.log('Interaction checks passed: '+checks.length);
 console.log(JSON.stringify(report.map(r=>({route:r.route,roots:r.result?.map(x=>({key:x.key,slots:x.slots.map(n=>n.slot),height:x.height,overflow:x.bodyOverflow,issues:x.issues})),errors:r.errors})),null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
