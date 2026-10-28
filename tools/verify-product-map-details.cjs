// Run against the local static prototype; browser storage is isolated and disposable.
const {chromium}=require('C:/Users/yjf95/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.PROTOTYPE_URL||'http://127.0.0.1:8765/index.html';
const output=path.resolve(__dirname,'../artifacts/product-map-details');fs.mkdirSync(output,{recursive:true});
const checks=[],errors=[];
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1600,height:1100}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#loginAccount').fill('admin');await page.locator('#loginPassword').fill('admin');await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.locator('[data-action="enter-project"][data-project-id="PRJ-SUIZHOU"]').click();
  async function go(route,selector){await page.goto(base+'#'+route);await page.locator(selector).first().waitFor();}
  const owner=(selector,id)=>`${selector} .we-node${id?`[data-value="${id}"],${selector} .we-node[data-we-object="${id}"]`:''}`;
  async function focus(selector,point,width=90){
   await page.locator(selector).first().evaluate((svg,{point,width})=>{const view=[point.x-width/2,point.y-width*.3,width,width*.6],camera=WaterMapViewport.get(svg);if(camera){camera.set(view);camera.flush();}else{svg.setAttribute('viewBox',view.join(' '));WaterMapViewport.limitSymbols(svg);}},{point,width});
  }
  async function position(selector){return page.locator(selector).first().evaluate(el=>{const shape=el.querySelector('circle,rect,path'),b=shape.getBBox(),matrix=shape.getScreenCTM(),q=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(matrix),box=shape.getBoundingClientRect();const hit=document.elementFromPoint(q.x,q.y)?.closest('.we-node');return {x:q.x,y:q.y,id:el.dataset.value||el.dataset.weObject,hit:hit?.dataset.value||hit?.dataset.weObject,width:box.width,height:box.height,screenScale:Math.hypot(matrix.a,matrix.b),radius:el.querySelector('circle')?.getAttribute('r')};});}
  async function selectedId(id){await page.waitForFunction(id=>{
   const panel=document.querySelector('[data-map-slot="right"]');if(!panel)return false;
   const productId=[...panel.querySelectorAll('.app-description-item')].find(row=>row.querySelector('.app-description-label')?.textContent.trim()==='对象编号')?.querySelector('.app-description-value')?.textContent.trim();
   const formId=panel.querySelector('input[name="id"]')?.value;
   const comparisonId=panel.querySelector('.app-card-title')?.textContent.split(' · ')[0].trim();
   return productId===id||formId===id||comparisonId===id;
  },id);}
  const dataset=await page.evaluate(()=>SuizhouDataset.snapshot);
  const pump=dataset.nodes.find(n=>n.id==='600000025');
  for(const [route,selector] of [['p02asset','.unified-topology-svg'],['p04','[data-we-map]'],['p08','.product-map-compare-canvas svg']]){
   await go(route,selector);await focus(selector,pump);
   let before=await position(owner(selector,pump.id));assert.equal(before.hit,pump.id,route+' pump center must hit its own symbol');assert.equal(before.radius,'8');
   await page.mouse.click(before.x,before.y);await selectedId(pump.id);
   await focus(selector,pump);
   const after=await position(owner(selector,pump.id));assert(after.width<=20.01&&after.height<=20.01,route+' pump screen size');assert(after.screenScale<=1.2501);assert(before.width<=20.01&&before.height<=20.01);
   assert.equal(after.hit,pump.id);await page.screenshot({path:path.join(output,route+'-pump.png')});
   // A nearby object placed beneath the long label reproduces the former
   // bounding-box occlusion. Only this disposable test page is modified.
   for(const kind of ['point','pipe']){
    const target=await page.locator(owner(selector,pump.id)).first().evaluate((node,kind)=>{
     const text=node.querySelector('text'),b=text.getBBox(),matrix=node.getScreenCTM(),scale=Math.hypot(matrix.a,matrix.b),x=b.x+b.width*.75,y=b.y+b.height*.5,ns='http://www.w3.org/2000/svg';
     const g=document.createElementNS(ns,'g');g.setAttribute('transform',node.getAttribute('transform'));g.dataset.regressionFixture=kind;
     const shape=document.createElementNS(ns,kind==='point'?'circle':'path');shape.dataset.regressionTarget=kind;
     if(kind==='point'){shape.setAttribute('cx',x);shape.setAttribute('cy',y);shape.setAttribute('r',4/scale);shape.setAttribute('fill','#22c55e');}
     else{shape.setAttribute('d',`M${x-12/scale} ${y}L${x+12/scale} ${y}`);shape.setAttribute('stroke','#16a34a');shape.setAttribute('stroke-width',8/scale);shape.setAttribute('fill','none');shape.setAttribute('pointer-events','stroke');}
     g.append(shape);node.parentNode.insertBefore(g,node);const q=new DOMPoint(x,y).matrixTransform(matrix);
     window.__regressionClick=null;window.addEventListener('click',event=>{window.__regressionClick=event.target.dataset.regressionTarget||null;},{capture:true,once:true});
     return {x:q.x,y:q.y,hit:document.elementFromPoint(q.x,q.y)?.dataset.regressionTarget,labelEvents:getComputedStyle(text).pointerEvents};
    },kind);
    assert.equal(target.labelEvents,'none');assert.equal(target.hit,kind,route+' long pump label must pass through to nearby '+kind);
    await page.mouse.click(target.x,target.y);assert.equal(await page.evaluate(()=>window.__regressionClick),kind);
    await page.locator('[data-regression-fixture]').evaluateAll(nodes=>nodes.forEach(n=>n.remove()));
   }
   checks.push({route,pump:pump.id,pumpRadius:8,beforeSize:[before.width,before.height],selectedSize:[after.width,after.height],screenScale:after.screenScale,nearbyPointAndPipeClickable:true,exactSelectedId:true});
  }
  // Click one real object of each imported point category and one real pipe.
  await go('p02asset','.unified-topology-svg');
  const types=[...new Set(dataset.nodes.map(n=>n.type))];
  const separated=dataset.nodes.map(n=>({n,distance:dataset.nodes.reduce((min,other)=>other===n?min:Math.min(min,Math.hypot(n.x-other.x,n.y-other.y)),Infinity)})).sort((a,b)=>b.distance-a.distance);
  for(const type of types){
   let sample;
   for(const {n} of separated.filter(({n})=>n.type===type).slice(0,25)){
    await focus('.unified-topology-svg',n,30);const target=await position(owner('.unified-topology-svg',n.id));
    if(target.hit===n.id){sample={n,target};break;}
   }
   assert.ok(sample,type+' has an unobstructed symbol');
   await page.mouse.click(sample.target.x,sample.target.y);await selectedId(sample.n.id);checks.push({route:'p02asset',type,id:sample.n.id,realClick:true});
  }
  const nodeById=new Map(dataset.nodes.map(n=>[n.id,n]));
  const pipe=[...dataset.pipes].sort((p,q)=>{const length=p=>{const a=nodeById.get(p.start),b=nodeById.get(p.end);return Math.hypot(a.x-b.x,a.y-b.y);};return length(q)-length(p);})[0];
  for(const width of [90,45,22.5]){
   const a=dataset.nodes.find(n=>n.id===pipe.start),b=dataset.nodes.find(n=>n.id===pipe.end);await focus('.unified-topology-svg',{x:(a.x+b.x)/2,y:(a.y+b.y)/2},width);
   const hit=await page.locator(`.unified-topology-svg .we-pipe[data-value="${pipe.id}"] .map-pipe-hit`).evaluate(el=>{
    const total=el.getTotalLength(),matrix=el.getScreenCTM(),group=el.closest('.we-pipe'),id=group.dataset.value;
    for(const t of [.5,.25,.75,.1,.9]){const p=el.getPointAtLength(total*t),q=new DOMPoint(p.x,p.y).matrixTransform(matrix),p2=el.getPointAtLength(Math.min(total,total*t+.001)),q2=new DOMPoint(p2.x,p2.y).matrixTransform(matrix),dx=q2.x-q.x,dy=q2.y-q.y,d=Math.hypot(dx,dy),normal={x:-dy/d,y:dx/d};
     const at=offset=>document.elementFromPoint(q.x+normal.x*offset,q.y+normal.y*offset)?.closest('.we-pipe')?.dataset.value;
     if(at(0)===id&&at(3)===id&&at(6)!==id)return {x:q.x+normal.x*3,y:q.y+normal.y*3,id,stroke:getComputedStyle(el).strokeWidth,vectorEffect:getComputedStyle(el).vectorEffect};
    }throw Error('No unobstructed pipe sample');
   });
   assert.equal(hit.stroke,'8px');assert.equal(hit.vectorEffect,'non-scaling-stroke');await page.mouse.click(hit.x,hit.y);await selectedId(pipe.id);
   const hiddenPass=await page.locator(`.unified-topology-svg .we-pipe[data-value="${pipe.id}"]`).evaluate((el,hit)=>{el.style.visibility='hidden';const id=document.elementFromPoint(hit.x,hit.y)?.closest('.we-pipe')?.dataset.value;el.style.removeProperty('visibility');return id!==hit.id;},hit);assert(hiddenPass,'Hidden pipe must not intercept clicks');
   checks.push({route:'p02asset',pipe:pipe.id,viewWidth:width,hitTolerancePixels:4,realClick:true,hiddenPipePassThrough:true});
  }
  // School source fields remain internal; product node and pipe details stay readable.
  await page.locator('#projectSelect').selectOption('PRJ-SH-CAMPUS');
  for(const [route,selector] of [['p02asset','.unified-topology-svg'],['p04','[data-we-map]']]){
   await go(route,selector);
   const campus=await page.evaluate(()=>CampusDataset.snapshot);
   for(const object of [campus.nodes.find(n=>n.id==='JS643'),campus.pipes.find(p=>p.sourceId==='40')])for(const width of [100,20]){
    const id=object.id;
    if(object.type==='pipe'){
     const a=campus.nodes.find(n=>n.id===object.start),b=campus.nodes.find(n=>n.id===object.end);await focus(selector,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},width);
     const hit=await page.locator(`${selector} .we-pipe[data-value="${id}"],${selector} .we-pipe[data-we-object="${id}"]`).first().evaluate(el=>{const path=el.querySelector('.map-pipe-hit');for(const t of [.5,.3,.7]){const p=path.getPointAtLength(path.getTotalLength()*t),q=new DOMPoint(p.x,p.y).matrixTransform(path.getScreenCTM()),target=document.elementFromPoint(q.x,q.y)?.closest('.we-pipe');if(target===el)return {x:q.x,y:q.y};}throw Error('School pipe has no unobstructed click point');});await page.mouse.click(hit.x,hit.y);
    }else{await focus(selector,object,width);const hit=await position(owner(selector,id));assert.equal(hit.hit,id);assert(hit.screenScale<=1.2501,'school node screen size capped');await page.mouse.click(hit.x,hit.y);}
    await selectedId(id);const panel=page.locator('[data-map-slot="right"]');const text=await panel.textContent();
    assert.doesNotMatch(text,/源文件|源模型|原测绘|安装标注|sourceId|sourceDescription|sourceTag|nodeKind|sourceX|sourceY/);assert.match(text,/对象编号|编号/);assert.match(text,/管径/);
    const largestScale=await page.locator(selector).first().evaluate(svg=>Math.max(...[...svg.querySelectorAll('.we-node')].map(n=>{const m=n.getScreenCTM();return Math.hypot(m.a,m.b);})));assert(largestScale<=1.2501);
    checks.push({project:'school',route,id,viewWidth:width,productFieldsOnly:true,exactSelectedId:true,largestSymbolScale:largestScale});await page.screenshot({path:path.join(output,`school-${route}-${object.type}-${width}.png`)});
   }
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,errors},null,2));console.log(`PASS ${checks.length} browser checks; evidence: ${output}`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
