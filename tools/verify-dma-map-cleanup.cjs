// DMA maps present zones and assets; attached instruments remain on SCADA.
// Browser contexts are disposable and never touch the user's live browser data.
const {chromium}=require('C:/Users/yjf95/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const D=require('../data/campus-dataset.js'),M=require('../campus-metering.js');
const base=process.env.PROTOTYPE_URL||'http://127.0.0.1:8765/index.html';
const output=path.resolve(__dirname,'../artifacts/dma-map-cleanup');fs.mkdirSync(output,{recursive:true});
const checks=[],errors=[];
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const account of ['school','admin']){
   const context=await browser.newContext({viewport:{width:1600,height:1200}}),page=await context.newPage();
   page.on('pageerror',e=>errors.push({account,message:e.message}));
   await page.goto(base);await page.locator('#loginAccount').fill(account==='school'?'school1':'admin');await page.locator('#loginPassword').fill(account==='school'?'School@2026':'admin');await page.getByRole('button',{name:'登录',exact:true}).click();
   if(account==='admin')await page.locator('[data-action="enter-project"][data-project-id="PRJ-SH-CAMPUS"]').click();
   async function go(route){await page.goto(base+'#'+route);await page.locator('.unified-topology-svg').waitFor();}
   async function expand(){const b=page.getByRole('button',{name:'展开对象抽屉',exact:true});if(await b.count())await b.click();}
   await go('p02dma');
   const saved=await page.evaluate(()=>({geometry:localStorage.getItem('water-editor:PRJ-SH-CAMPUS:T-SH-CAMPUS-20261013'),devices:localStorage.getItem('water-devices:PRJ-SH-CAMPUS')}));
   assert.equal(await page.locator('.unified-topology-svg .unified-monitor').count(),0);
   for(const type of ['pressure','flow','quality','level','noise'])assert.equal(await page.locator(`[data-p02-view="dma"][data-p02-layer="${type}"]`).count(),0);
   await expand();assert.equal(await page.locator('[data-action="p02-bottom-tab"][data-value="devices"]').count(),0);
   assert.doesNotMatch(await page.locator('.product-bottom-drawer-body thead').innerText(),/设备数量/);
   const baseView=await page.locator('.unified-topology-svg').evaluate(svg=>WaterMapViewport.get(svg).get());
   for(const zoom of [1,2,8]){
    const fitted=await page.locator('.unified-topology-svg').evaluate((svg,{baseView,zoom})=>{
     const camera=WaterMapViewport.get(svg),cx=baseView[0]+baseView[2]/2,cy=baseView[1]+baseView[3]/2;camera.set([cx-baseView[2]/zoom/2,cy-baseView[3]/zoom/2,baseView[2]/zoom,baseView[3]/zoom]);camera.flush();
     const inv=svg.getScreenCTM().inverse(),vertices=[[-6,0],[0,-6],[6,0],[6,8],[-6,8]];
     return [...svg.querySelectorAll('.we-user')].map(node=>{
      const glyph=node.querySelector('.dma-user-glyph'),zone=svg.querySelector(`.we-zone[data-value="${node.dataset.dmaOwner}"]`),matrix=glyph?.getScreenCTM();
      if(!glyph||!zone)return {id:node.dataset.value,fitted:false};
      // The conservative envelope includes selected strokes at all corners.
      const inside=vertices.every(([x,y])=>Array.from({length:16},(_,i)=>i*Math.PI/8).every(t=>{const p=new DOMPoint(x+2.2*Math.cos(t),y+2.2*Math.sin(t)).matrixTransform(matrix).matrixTransform(inv);return zone.isPointInFill(p);}));
      const anchor=new DOMPoint(0,0).matrixTransform(node.getScreenCTM()).matrixTransform(inv),actual=CampusDataset.snapshot.nodes.find(n=>n.id===node.dataset.value);
      const translate=node.getAttribute('transform').match(/^translate\(([-\d.]+) ([-\d.]+)\)/);
      return {id:node.dataset.value,fitted:true,inside,owner:node.dataset.dmaOwner,scale:+node.dataset.dmaGlyphScale,anchorUnchanged:Math.hypot(anchor.x-actual.x,anchor.y-actual.y)<1e-3&&+translate[1]===actual.x&&+translate[2]===actual.y};
     });
    },{baseView,zoom});
    assert.equal(fitted.length,13);assert(fitted.every(n=>n.fitted&&n.inside&&n.anchorUnchanged),JSON.stringify(fitted));
    checks.push({account,check:'user-icons-contained',zoom,users:fitted});
   }
   await page.locator('.unified-topology-svg').evaluate((svg,view)=>{WaterMapViewport.get(svg).set(view);WaterMapViewport.get(svg).flush();},baseView);
   for(const zone of D.snapshot.zones){
    await page.locator(`.product-bottom-drawer-body [data-action="select-dma"][data-value="${zone.id}"]`).click();
    const expected=M.seed().bindings.filter(b=>zone.nodeIds.includes(b.key.split('|')[1])||zone.pipeIds.includes(b.key.split('|')[1])).length;
    const fields=await page.locator('.product-gis-panel-right .app-description-item').evaluateAll(rows=>Object.fromEntries(rows.map(r=>[r.querySelector('.app-description-label').textContent.trim(),r.querySelector('.app-description-value').textContent.trim()])));
    assert.equal(fields['监测设备数量'],expected+' 台');assert.equal(await page.locator('.unified-topology-svg .unified-monitor').count(),0);
    if(zone.id==='DMA-02')await page.screenshot({path:path.join(output,account+'-dma-overview.png')});
    checks.push({account,check:'overview-equipment-count',zone:zone.id,count:expected});
   }
   await go('p10');assert.equal(await page.locator('.unified-monitor').count(),36);assert.equal(await page.locator('.dma-user-glyph').count(),0,'SCADA keeps its own asset presentation');
   assert.equal(await page.locator('[data-p10-layer="noise"]').count(),1);
   const after=await page.evaluate(()=>({geometry:localStorage.getItem('water-editor:PRJ-SH-CAMPUS:T-SH-CAMPUS-20261013'),devices:localStorage.getItem('water-devices:PRJ-SH-CAMPUS')}));assert.deepEqual(after,saved);
   checks.push({account,check:'scada-preserved',monitors:36,geometryAndDevicesUnchanged:true});await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({status:'PASS',checks,errors},null,2));console.log(`PASS ${checks.length} DMA map cleanup checks; evidence: ${output}`);
 }finally{await browser.close();}
})().catch(error=>{fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({message:error.message,stack:error.stack,checks,errors},null,2));console.error(error);process.exitCode=1;});
