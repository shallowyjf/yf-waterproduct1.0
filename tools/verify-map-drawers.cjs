const {chromium}=require('C:/Users/yjf95/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'../artifacts/map-drawers');fs.mkdirSync(dir,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1081,height:898}}),errors=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/index.html');
 await page.locator('#loginAccount').fill('admin');await page.locator('#loginPassword').fill('admin');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:'进入项目',exact:true}).first().click();
 async function go(route){await page.goto('http://127.0.0.1:8765/index.html#'+route);await page.waitForTimeout(100);}
 async function select(selector){const el=page.locator(selector).first();await el.evaluate(n=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})));}
 async function audit(name){
   const right=page.locator('[data-map-slot="right"]');await right.waitFor({state:'visible'});
   const result=await right.evaluate(r=>({width:r.clientWidth,scroll:r.scrollWidth,overflow:[r,...r.querySelectorAll('*')].filter(n=>n.clientWidth>0&&n.scrollWidth>n.clientWidth+2&&getComputedStyle(n).overflowX!=='hidden'&&getComputedStyle(n).display!=='inline').map(n=>({tag:n.tagName,cls:n.className,w:n.clientWidth,sw:n.scrollWidth,text:n.textContent.slice(0,90)})),values:[...r.querySelectorAll('.app-description-value')].map(n=>n.getBoundingClientRect().width),tabs:[...r.querySelectorAll('.product-drawer-tabs button')].map(n=>n.textContent)}));
   checks.push({name,...result});assert(result.scroll<=result.width+2, name+' drawer overflow '+JSON.stringify(result));assert.equal(result.overflow.length,0,name+' inner overflow '+JSON.stringify(result.overflow));assert(result.values.every(w=>w>=140),name+' readable value columns');assert(!result.tabs.some(t=>['拓扑关系','连接关系','边界监测'].includes(t)),name+' merged tabs');
 }
 for(const theme of ['light','dark']){
  if(theme==='dark')await page.locator('[data-theme-toggle]:visible').click();
  for(const width of [1081,1280]){
   await page.setViewportSize({width,height:898});
   await go('p02');
   for(const id of ['P-DMA-3','Q-001','WQ-001','WL-001']){
    await select(`.product-network [data-action="select-monitor"][data-value="${id}"]`);
    await audit(`${theme} ${width} monitor ${id} basic`);
    assert.equal(await page.locator('[data-map-slot="right"] .product-detail-section h3').allTextContents().then(t=>t.join(',')),'挂接对象,所属分区');
    if(id==='P-DMA-3'){await page.waitForTimeout(3200);await page.screenshot({path:path.join(dir,`pressure-${theme}-${width}.png`)});}
    for(const tab of ['metrics','history']){await page.locator(`[data-action="p02-drawer-tab"][data-value="${tab}"]`).click();await audit(`${theme} ${width} monitor ${id} ${tab}`);}
   }
   // Check every node category against real selectable map objects.
   await go('p02asset');
   const samples=await page.evaluate(()=>Object.values(window.createCityTopology().nodes.reduce((a,n)=>{if(!a[n.type]||n.name.length>a[n.type].name.length)a[n.type]=n;return a;},{})).map(n=>({id:n.id,type:n.type})));
   for(const n of samples){await select(`.product-network [data-action="select-asset"][data-value="${n.id}"]`);await audit(`${theme} ${width} asset ${n.type}`);assert(await page.locator('[data-map-slot="right"]').textContent().then(t=>t.includes('连接管线')));}
   await select('.product-network [data-action="select-pipe"]');await audit(`${theme} ${width} pipe`);
   assert(await page.locator('[data-map-slot="right"]').textContent().then(t=>t.includes('起点 · ')&&t.includes('终点 · ')));
   await page.locator('[data-map-slot="right"] [data-action="select-asset"]').first().click();await audit(`${theme} ${width} pipe endpoint navigation`);
   await go('p02dma');await select('.product-network [data-action="select-dma"]');await audit(`${theme} ${width} dma`);
   assert(await page.locator('[data-map-slot="right"]').textContent().then(t=>t.includes('挂接监测点')&&t.includes('边界管线')));
   await go('p10');await select('.product-network [data-action="select-monitor"]');await audit(`${theme} ${width} scada`);
   await go('p10h');const toggle=page.locator('[data-action="toggle-history-bottom"]');if(await toggle.getAttribute('aria-label')==='展开历史记录')await toggle.click();await select('[data-map-slot="bottom"] [data-action="history-select"]');await audit(`${theme} ${width} history`);
   await go('p13');await select('[data-map-slot="bottom"] [data-ops="alarm-detail"]');await audit(`${theme} ${width} alarm`);
   await go('p15');await page.locator('[data-ops="work-new"]').click();await audit(`${theme} ${width} work form`);
   await go('p04');await select('[data-we="object"]');await audit(`${theme} ${width} topology editor`);
   await go('p07');await page.locator('[data-we="table-type"][data-value="zone"]').click();await select('[data-we="object"]');await audit(`${theme} ${width} dma editor`);
   for(const route of ['simulation','qualityMap']){await go(route);await page.locator('[data-hy="table-tab"][data-value="user"]').click();await page.locator('[data-hy="locate"]').last().click();await audit(`${theme} ${width} ${route}`);}
  }
 }
 await page.locator('[data-theme-toggle]:visible').click();await page.setViewportSize({width:1081,height:898});await go('p02asset');
 const objects=await page.locator('.product-network [data-action="select-asset"],.product-network [data-action="select-pipe"]').evaluateAll(ns=>[...new Map(ns.map(n=>[n.dataset.value||n.dataset.pipeId,{action:n.dataset.action,id:n.dataset.value||n.dataset.pipeId}])).values()]);
 for(const object of objects){await select(`.product-network [data-action="${object.action}"][data-value="${object.id}"],.product-network [data-action="${object.action}"][data-pipe-id="${object.id}"]`);await audit('all objects '+object.id);assert((await page.locator('[data-map-slot="right"]').textContent()).includes(object.id));}
 console.log('All selectable assets and pipes checked: '+objects.length);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(checks,null,2));console.log('Drawer checks passed: '+checks.length);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
