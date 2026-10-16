const {chromium}=require('C:/Users/yjf95/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.resolve('artifacts/map-performance');fs.mkdirSync(dir,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/index.html');await page.locator('#loginAccount').fill('admin');await page.locator('#loginPassword').fill('admin');await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator('[data-action="enter-project"][data-project-id="PRJ-SUIZHOU"]').click();
 async function verify(route,selector,open){await page.goto('http://127.0.0.1:8765/index.html#'+route);if(open)await page.locator(open).click();await page.locator(selector).waitFor();await page.waitForTimeout(250);
  const result=await page.evaluate(async selector=>{
   const svg=document.querySelector(selector),camera=WaterMapViewport.get(svg);if(!camera)throw Error('No camera: '+selector);
   const initial=camera.get(),count=svg.querySelectorAll('*').length,box=svg.getBoundingClientRect(),x=box.x+box.width*.57,y=box.y+box.height*.43,world=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM().inverse());
   let writes=0;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(...args){writes++;return original.apply(this,args)};
   const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),error=()=>{const q=world.matrixTransform(svg.getScreenCTM());return Math.hypot(q.x-x,q.y-y)};
   const anchorErrors=[];for(let i=0;i<6;i++){svg.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:x,clientY:y,deltaY:-45}));await frames();anchorErrors.push(error());}
   const preview=error();await new Promise(r=>setTimeout(r,250));const committed=error(),zoomed=camera.get();
   // Burst events in one frame must also preserve the pointer anchor.
   for(let i=0;i<10;i++)svg.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:x,clientY:y,deltaY:10}));await frames();camera.flush();const burstError=error();
   const sameSVG=svg===document.querySelector(selector),sameObjects=count===svg.querySelectorAll('*').length;
   camera.reset();camera.flush();const reset=camera.get();Storage.prototype.setItem=original;
   return {initial,zoomed,reset,anchorErrors,preview,committed,burstError,sameSVG,sameObjects,writes};
  },selector);
  assert(result.zoomed[2]<result.initial[2]);assert(result.anchorErrors.every(n=>n<1),JSON.stringify(result));assert(result.committed<1&&result.burstError<1,JSON.stringify(result));assert(result.sameSVG&&result.sameObjects);assert.equal(result.writes,0);
  const start=await page.locator(selector).evaluate(svg=>{const b=svg.getBoundingClientRect();for(const fx of [.55,.65,.75,.4])for(const fy of [.3,.4,.5,.6]){const x=b.x+b.width*fx,y=b.y+b.height*fy;if(document.elementFromPoint(x,y)?.closest('svg')===svg)return {x,y,view:WaterMapViewport.get(svg).get()};}throw Error('Map covered');});
  await page.evaluate(selector=>{window.__testedSVG=document.querySelector(selector);window.__mapClicks=0;document.addEventListener('click',e=>{if(e.target.closest('svg[data-map-viewport]'))window.__mapClicks++;},{once:true});},selector);
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+60,start.y+35,{steps:8});await page.mouse.up();
  assert(await page.evaluate(selector=>window.__testedSVG===document.querySelector(selector)&&window.__mapClicks===0,selector),'Pan must not select an object or reconstruct the map');
  const dragged=await page.locator(selector).evaluate(svg=>({view:WaterMapViewport.get(svg).get(),transform:svg.style.transform,interacting:svg.classList.contains('map-is-interacting')}));assert(Math.abs(dragged.view[0]-start.view[0])>1);assert.equal(dragged.interacting,false);assert(!dragged.transform||dragged.transform==='none');
  await page.screenshot({path:path.join(dir,route+'-viewport.png')});checks.push({route,...result,dragged});console.log('PASS',route);
 }
 await verify('p02dma','.unified-topology-svg');
 await verify('p04','[data-we-map]');
 await verify('p07','[data-we-map]');
 await verify('simulation','[data-hy-map]');
 const previous=await page.locator('[data-hy-map]').evaluate(s=>WaterMapViewport.get(s).get());await page.locator('[data-hy-change="metric"]').selectOption('flow');const next=await page.locator('[data-hy-map]').evaluate(s=>WaterMapViewport.get(s).get());assert(previous.every((v,i)=>Math.abs(v-next[i])<.01));
 await verify('hydraulicHistory','[data-hy-map]');
 const download=page.waitForEvent('download');await page.locator('[data-ar="svg"]').click();const exported=path.join(dir,'zoomed-history.svg');await(await download).saveAs(exported);assert(!fs.readFileSync(exported,'utf8').includes('translate3d'));
 await verify('hydraulic','[data-sandbox-map]','[data-v2="scene-open"][data-id="SZ-BASELINE"]');
 await page.locator('[data-v2="ws-tool"][data-id="user"]').click();assert.equal(await page.locator('[data-sandbox-map]').evaluate(s=>WaterMapViewport.get(s).canPan({})),false);
 const nodeCount=await page.locator('[data-sandbox-map] .ws-node').count();const blank=await page.locator('[data-sandbox-map]').evaluate(svg=>{const b=svg.getBoundingClientRect();for(const fx of [.5,.6,.7])for(const fy of [.2,.3,.4]){const x=b.x+b.width*fx,y=b.y+b.height*fy;if(document.elementFromPoint(x,y)===svg)return {x,y};}throw Error('No blank map point');});await page.mouse.click(blank.x,blank.y);assert.equal(await page.locator('[data-sandbox-map] .ws-node').count(),nodeCount+1);
 await page.goto('http://127.0.0.1:8765/index.html#p02dma');await page.locator('[data-theme-toggle]:visible').click();await page.setViewportSize({width:1081,height:898});await page.screenshot({path:path.join(dir,'p02dma-dark.png')});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(dir,'interaction-checks.json'),JSON.stringify({checks,errors},null,2));console.log('PASS: wheel anchors, burst events, stable SVG, zero storage writes, pan, reset, metric persistence, edit mode guard, dark theme.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
