const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

global.window={};global.document={addEventListener(){}};
const G=require('../dma-geometry.js');window.DMAGeometry=G;
global.WaterHydraulics=require('../hydraulics-data.js');
global.WaterV2=require('../v2-scenarios.js');
global.WaterOperations=require('../operations.js');
const D=require('../data/campus-dataset.js');
require('../campus-project.js');
require('../topology-editor.js');
require('../topology-map-data.js');
require('../dma-plans.js');
const C=global.CampusProject,H=global.WaterHydraulics,V=global.WaterV2;
const clone=v=>JSON.parse(JSON.stringify(v));
const digest=rows=>createHash('sha256').update(JSON.stringify(rows.sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
function storage(){const entries=new Map();return {entries,getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};}
function withoutBoundaries(zones){return zones.map(zone=>{const z=clone(zone);for(const field of ['boundary','boundaryMode','boundarySignature','boundaryAreaM2','boundaryNote','boundaryWidthM','boundaryRevision','boundaryPreviousAreaM2','boundaryAreaReductionPercent','boundaryWidthException'])delete z[field];return z;});}
function distanceToSegment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy,t=length2?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length2)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function sourceSegments(data,z){return data.pipes.filter(p=>z.pipeIds.includes(p.id)).flatMap(p=>p.sourceGeometry.slice(1).map((b,i)=>({id:p.id,a:p.sourceGeometry[i],b})));}
function displaySourcePoint(data,p){const t=data.metadata.displayTransform;return {x:t.width/2+(p[0]-t.centerX)*t.scale,y:t.height/2-(p[1]-t.centerY)*t.scale};}
function editor(data=C.snapshot(),store=storage()){
  global.localStorage=store;
  const e=new window.WaterTopologyEditor({render(){},toast(){},icon(){return '';}});
  e.use('campus-test','',{data,preserve:true});return e;
}
function components(data){
  const graph=new Map(data.nodes.map(n=>[n.id,[]]));
  for(const p of data.pipes){assert.ok(graph.has(p.start)&&graph.has(p.end),p.id);graph.get(p.start).push(p.end);graph.get(p.end).push(p.start);}
  const pending=new Set(graph.keys()),groups=[];
  while(pending.size){const found=new Set(),queue=[pending.values().next().value];while(queue.length){const n=queue.pop();if(found.has(n))continue;found.add(n);pending.delete(n);queue.push(...graph.get(n).filter(id=>!found.has(id)));}groups.push(found);}
  return groups;
}

test('campus import preserves every original ID, endpoint, length, diameter and source coordinate',()=>{
  const s=C.snapshot();
  assert.equal(s.nodes.length,102);assert.equal(s.pipes.length,100);
  const all=[...s.nodes,...s.pipes,...s.zones];assert.equal(new Set(all.map(o=>o.id)).size,all.length);
  // Digests independently computed from 20261013_sources/_work/model_final.json.
  // These cover all source values, not selected samples or the importer summary.
  assert.equal(digest(s.nodes.map(n=>[n.sourceId,n.sourceX,n.sourceY])),'8059bda72fb103e7332bd5e796cd92abcbb4339691fdd54ed7796ed11630952d');
  assert.equal(digest(s.pipes.map(p=>[p.sourceId,p.start,p.end,p.length,p.diameter,p.sourceGeometry])),'d520ed0df600b148554efcb58e2155aedb19575d2348d68339dc562213b0d6be');
  assert.ok(s.nodes.every(n=>n.id===n.sourceId));
  assert.ok(Math.abs(s.pipes.reduce((sum,p)=>sum+p.length,0)-1770.7670407253368)<1e-9);
  assert.deepEqual(s.pipes.reduce((counts,p)=>(counts[p.diameter]=(counts[p.diameter]||0)+1,counts),{}),{100:32,200:68});
  assert.deepEqual(editor(s).validate(s),s);
});

test('display geometry uses one scale and preserves true source geometry without a guessed CRS',()=>{
  const s=C.snapshot(),t=s.metadata.displayTransform,nodes=new Map(s.nodes.map(n=>[n.id,n]));
  assert.equal(s.metadata.coordinateSystem.crs,null);assert.equal(s.metadata.coordinateSystem.basemapAllowed,false);
  const display=([x,y])=>({x:t.width/2+(x-t.centerX)*t.scale,y:t.height/2-(y-t.centerY)*t.scale});
  for(const n of s.nodes){const expected=display([n.sourceX,n.sourceY]);assert.ok(Math.abs(n.x-expected.x)<=.000001,n.id);assert.ok(Math.abs(n.y-expected.y)<=.000001,n.id);}
  for(const p of s.pipes){
    assert.deepEqual(p.a,{x:nodes.get(p.start).x,y:nodes.get(p.start).y});assert.deepEqual(p.b,{x:nodes.get(p.end).x,y:nodes.get(p.end).y});
    assert.equal(p.geometry.length,p.sourceGeometry.length);
    p.sourceGeometry.forEach((xy,i)=>{const expected=display(xy);assert.ok(Math.abs(p.geometry[i].x-expected.x)<=.000001,p.id);assert.ok(Math.abs(p.geometry[i].y-expected.y)<=.000001,p.id);});
  }
});

test('both independent supply systems remain separate with their original pending source heads',()=>{
  const s=C.snapshot(),groups=components(s);
  assert.deepEqual(groups.map(g=>g.size).sort((a,b)=>a-b),[44,58]);
  for(const [source,nodeCount,pipeCount] of [['JS52-1',58,57],['JS642',44,43]]){
    const group=groups.find(g=>g.has(source));assert.equal(group.size,nodeCount);
    assert.equal(s.pipes.filter(p=>group.has(p.start)&&group.has(p.end)).length,pipeCount);
    assert.equal(s.nodes.filter(n=>group.has(n.id)&&n.type==='plant').length,1);
    assert.ok(s.nodes.filter(n=>group.has(n.id)).every(n=>n.sourceIdForSupply===source));
    const n=s.nodes.find(n=>n.id===source);assert.equal(n.headM,0);assert.equal(n.headStatus,'待设置');
  }
  assert.equal(s.nodes.filter(n=>n.elevation===null).length,18);
});

test('the four DMA memberships contain exactly the requested buildings without overlaps or invalid IDs',()=>{
  const s=C.snapshot(),expected=[
    ['DMA-01',['宿舍1','宿舍2','宿舍3','北教学楼'],['22','JS625','JS42','17']],
    ['DMA-02',['体育馆厕所1','体育馆厕所2','花房'],['6','5','4']],
    ['DMA-03',['南教学楼','食堂'],['JS39','2']],
    ['DMA-04',['宿舍4','宿舍5','宿舍6'],['JS615','JS608','JS612']]
  ],allBuildings=expected.flatMap(x=>x[2]);
  assert.equal(s.zones.length,4);
  for(const [id,names,ids] of expected){
    const z=s.zones.find(z=>z.id===id);assert.deepEqual(z.buildings,names);assert.deepEqual(z.buildingNodeIds,ids);
    assert.deepEqual(z.nodeIds.filter(id=>allBuildings.includes(id)).sort(),[...ids].sort());
    assert.equal(z.hypothetical,true);assert.equal(z.boundaryMetersInstalled,false);
    assert.ok(s.nodes.filter(n=>z.nodeIds.includes(n.id)).every(n=>n.componentId===z.componentId));
    assert.ok(editor(s).zonePoints(z).length>=3);
  }
  const stats=window.DMAPlans.stats(s,s.zones);
  assert.equal(stats.overlap,0);assert.equal(stats.invalid,0);assert.equal(stats.nodes,75);assert.equal(stats.pipes,75);
  assert.equal(stats.unassignedNodes,27);assert.equal(stats.unassignedPipes,25);
  const assignedNodes=new Set(s.zones.flatMap(z=>z.nodeIds)),assignedPipes=new Set(s.zones.flatMap(z=>z.pipeIds));
  assert.deepEqual(s.nodes.filter(n=>!assignedNodes.has(n.id)).map(n=>n.id).sort(),[...s.metadata.sharedNodeIds].sort());
  assert.deepEqual(s.pipes.filter(p=>!assignedPipes.has(p.id)).map(p=>p.id).sort(),[...s.metadata.sharedPipeIds].sort());
  const bucket=C.store().dmaPlans[D.topologyId];window.DMAPlans.activate(bucket,bucket.activeId,s);
});

test('DMA-03 outlet is DMA-04 inlet with a single hypothetical meter and no duplicate pipe ownership',()=>{
  const s=C.snapshot(),a=s.zones.find(z=>z.id==='DMA-03'),b=s.zones.find(z=>z.id==='DMA-04'),boundary='CAMPUS-P-28';
  assert.deepEqual(a.outletPipeIds,[boundary]);assert.deepEqual(b.inletPipeIds,[boundary]);
  assert.ok(!a.pipeIds.includes(boundary)&&b.pipeIds.includes(boundary));
  assert.match(a.balanceFormula,/入口.*出口/);
  const meters=s.metadata.boundaryMeterPlans;assert.equal(meters.length,4);
  assert.equal(meters.filter(m=>m.pipeId===boundary).length,1);
  assert.ok(meters.every(m=>m.hypothetical===true&&m.installed===false&&m.reading===null));
  for(const z of s.zones){
    const members=new Set(z.nodeIds),boundaries=s.pipes.filter(p=>members.has(p.start)!==members.has(p.end)).map(p=>p.id).sort();
    assert.deepEqual(boundaries,[...z.inletPipeIds,...z.outletPipeIds].sort());
    for(const id of z.inletPipeIds){const p=s.pipes.find(p=>p.id===id);assert.ok(!members.has(p.assumedSupplyStart)&&members.has(p.assumedSupplyEnd));}
    for(const id of z.outletPipeIds){const p=s.pipes.find(p=>p.id===id);assert.ok(members.has(p.assumedSupplyStart)&&!members.has(p.assumedSupplyEnd));}
  }
});

test('four saved polygon boundaries enclose all original member pipes and have no positive-area spatial overlaps',()=>{
  const s=C.snapshot(),before=clone(s),e=editor(s),model=window.TopologyMapData.build(s,e);
  assert.deepEqual(G.validateZones(s),[]);
  for(const z of s.zones){
    assert.equal(z.boundaryWidthM,10);assert.ok(z.boundary.length>=3);
    assert.equal(G.isSimplePolygon(z.boundary),true,z.id);
    assert.equal(z.boundarySignature,G.boundarySignature(s,z));
    assert.equal(G.containsZone(s,z,z.boundary),true,z.id);
    for(const id of z.pipeIds){
      const p=s.pipes.find(p=>p.id===id),line=p.geometry?.length?p.geometry:[p.a,p.b];
      assert.equal(G.containsPolyline(z.boundary,line),true,`${z.id} contains ${id}`);
    }
    assert.deepEqual(e.zonePoints(z),G.zonePolygon(s,z));
    const rendered=model.zones.find(item=>item.id===z.id),label={x:rendered.labelX,y:rendered.labelY};
    assert.ok(rendered.path.length>0);assert.equal(G.pointInPolygon(label,z.boundary),true,`${z.id} label stays within its own boundary`);
    for(const other of s.zones.filter(other=>other.id!==z.id))assert.equal(G.pointInPolygon(label,other.boundary),false,`${z.id} label must not be in ${other.id}`);
  }
  for(let i=0;i<s.zones.length;i++)for(let j=i+1;j<s.zones.length;j++){
    const a=s.zones[i],b=s.zones[j];assert.ok(G.intersectionArea(a.boundary,b.boundary)<=G.DEFAULT_AREA_TOLERANCE,`${a.id} overlaps ${b.id}`);
  }
  assert.deepEqual(G.findOverlaps(s),[]);
  const sports=s.zones.find(z=>z.id==='DMA-02');
  assert.ok(G.polygonArea(sports.boundary)<G.polygonArea(G.hull(G.pointsForZone(s,sports))), 'sports boundary retains a concave recess around DMA-01');
  assert.deepEqual(s,before);
});

test('pipe corridor is ten metres wide in source units on isolated straight sections, not ten display pixels',()=>{
  const s=C.snapshot(),joint=s.nodes.find(n=>n.id==='2'),generation=s.metadata.boundaryGeneration;let sections=0;
  assert.equal(generation.widthM,10);assert.equal(generation.halfWidthM,5);assert.ok(generation.bufferRadiusM>=5&&generation.bufferRadiusM<=5.03);
  assert.equal(generation.junctionClips.length,1);assert.equal(generation.junctionClips[0].nodeId,'2');assert.equal(generation.junctionClips[0].splitAxis,'sourceX');assert.equal(generation.junctionClips[0].splitValueM,joint.sourceX);assert.ok(generation.junctionClips[0].widthException);
  for(const z of s.zones){
    const segments=sourceSegments(s,z);let count=0;
    for(const segment of segments)for(const t of [.25,.5,.75]){
      const dx=segment.b[0]-segment.a[0],dy=segment.b[1]-segment.a[1],length=Math.hypot(dx,dy);
      if(length*Math.min(t,1-t)<12)continue;
      const center=[segment.a[0]+t*dx,segment.a[1]+t*dy];
      if(segments.some(other=>other!==segment&&distanceToSegment(center,other.a,other.b)<=12))continue;
      // The two serial DMA zones explicitly divide their shared junction; check regular branches away from it.
      if(['DMA-03','DMA-04'].includes(z.id)&&Math.abs(center[0]-joint.sourceX)<10)continue;
      for(const side of [-1,1]){
        const insideAt=distance=>G.pointInPolygon(displaySourcePoint(s,[center[0]-side*dy/length*distance,center[1]+side*dx/length*distance]),z.boundary);
        assert.equal(insideAt(4.99),true,`${z.id} ${segment.id} side ${side} is at least 5 m`);
        assert.equal(insideAt(5.05),false,`${z.id} ${segment.id} side ${side} remains tight`);
        let lo=4,hi=6;for(let i=0;i<25;i++){const mid=(lo+hi)/2;if(insideAt(mid))lo=mid;else hi=mid;}
        assert.ok(lo>=4.99999&&hi<=5.03,`${z.id} ${segment.id} measured half width ${lo}–${hi} m`);
      }
      count++;sections++;
    }
    assert.ok(count>=2,`${z.id} needs multiple independent ordinary cross sections`);
  }
  assert.ok(sections>=20);
});

test('tight corridors remove broad empty envelopes and substantially reduce displayed area',()=>{
  const s=C.snapshot(),scale=s.metadata.displayTransform.scale;let total=0,emptyChecks=0;
  for(const z of s.zones){
    const area=G.polygonArea(z.boundary)/(scale*scale),segments=sourceSegments(s,z),sourcePoints=segments.flatMap(p=>[p.a,p.b]);total+=area;
    assert.ok(area<G.polygonArea(G.hull(G.pointsForZone(s,z)))/(scale*scale),z.id);
    const xs=sourcePoints.map(p=>p[0]),ys=sourcePoints.map(p=>p[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);let empty=0;
    for(let i=1;i<10;i++)for(let j=1;j<10;j++){
      const point=[xmin+(xmax-xmin)*i/10,ymin+(ymax-ymin)*j/10];
      if(Math.min(...segments.map(p=>distanceToSegment(point,p.a,p.b)))<10)continue;
      assert.equal(G.pointInPolygon(displaySourcePoint(s,point),z.boundary),false,`${z.id} must not fill space far from its pipes`);empty++;emptyChecks++;
    }
    assert.ok(empty>0,`${z.id} empty-envelope samples`);
  }
  // Independently recorded prior 8/15/7/7-vertex enclosing polygons.
  assert.ok(total<45242.16232488715/2,`corridor area ${total} m² must be less than half the previous 45,242.16 m²`);
  assert.ok(emptyChecks>50);
});

test('fresh import has no invented device, monitoring, operating or hydraulic records',()=>{
  const st=storage();C.initialize(st);const s=C.snapshot(),e=editor(s,st),model=window.TopologyMapData.build(s,e);
  assert.deepEqual(JSON.parse(st.getItem('water-devices:'+D.projectId)),[]);
  const ops=JSON.parse(st.getItem('water-operations:v1:'+D.projectId));
  assert.deepEqual(ops.tasks,[]);assert.deepEqual(ops.orders,[]);assert.deepEqual(ops.alarms,[]);assert.equal(ops.seeded,true);
  assert.deepEqual(model.monitors,[]);assert.deepEqual(model.events,[]);
  for(const z of model.zones)for(const k of ['inlet','outlet','pressure','minPressure','leakage'])assert.equal(z[k],'—',`${z.id}.${k}`);
  const params=H.defaults(s);assert.equal(params.demand,null);assert.deepEqual(params.pattern,[]);assert.ok(Object.values(params.sources).every(v=>v===null));
  assert.deepEqual(V.timeSeries(D.topologyId,s,'2026-10-13'),[]);
  const db=V.empty(),before=clone(db);V.seed(db,D.topologyId,s);assert.deepEqual(db,before);
  assert.throws(()=>H.simulate(s,params),/待补充/);assert.throws(()=>H.liveRun(s,D.topologyId,[],'2026-10-13'),/待补充/);
});

test('initialization is repeatable and preserves saved user edits, DMA plans and other projects',()=>{
  const st=storage();st.setItem('water-editor:OTHER:T9','original-project');
  assert.equal(C.initialize(st),true);assert.equal(C.initialize(st),false);
  const key='water-editor:'+D.projectId+':'+D.topologyId,edited=JSON.parse(st.getItem(key));edited.nodes[0].name='用户改名';st.setItem(key,JSON.stringify(edited));
  const storeKey='water-topology-store:'+D.projectId,plan=JSON.parse(st.getItem(storeKey));plan.dmaPlans[D.topologyId].items[0].zones[0].name='用户修改方案';st.setItem(storeKey,JSON.stringify(plan));
  const before=[...st.entries];assert.equal(C.initialize(st),false);assert.deepEqual([...st.entries],before);
  const returned=C.snapshot();returned.nodes[0].name='changed';returned.zones[0].nodeIds.length=0;
  assert.deepEqual(C.snapshot(),D.snapshot);assert.equal(st.getItem('water-editor:OTHER:T9'),'original-project');
  const freshStore=C.store();freshStore.dmaPlans[D.topologyId].items[0].zones[0].name='changed';assert.notEqual(C.store().dmaPlans[D.topologyId].items[0].zones[0].name,'changed');
});

test('partial storage failure rolls back only new import keys and permits a clean retry',()=>{
  const st=storage();st.setItem('existing','keep');const write=st.setItem;let attempts=0;
  st.setItem=(k,v)=>{if(++attempts===3)throw Error('quota full');write(k,v);};
  assert.throws(()=>C.initialize(st),/quota full/);assert.deepEqual([...st.entries],[['existing','keep']]);
  st.setItem=write;assert.equal(C.initialize(st),true);assert.equal(C.initialize(st),false);
});

test('existing campus import gains polygon boundaries without replacing topology, plan edits or user-defined valid boundaries',()=>{
  const st=storage();C.initialize(st);
  const dataKey='water-editor:'+D.projectId+':'+D.topologyId,catalogKey='water-topology-store:'+D.projectId;
  const data=C.snapshot(),catalog=C.store();data.zones=withoutBoundaries(data.zones);data.userMemo='保留';data.nodes[0].name='原名称修改';
  const plan=catalog.dmaPlans[D.topologyId].items[0];plan.name='我的分区方案';plan.zones=withoutBoundaries(plan.zones);plan.zones[0].name='用户分区名';
  const editedPlan={...clone(plan),id:'USER-EDITED',name:'用户改过成员'};editedPlan.zones[0].nodeIds.pop();catalog.dmaPlans[D.topologyId].items.push(editedPlan);
  const customPlan={...clone(plan),id:'USER-BOUNDARY',name:'用户合法边界',zones:clone(D.snapshot.zones)};customPlan.zones[0].boundary.reverse();catalog.dmaPlans[D.topologyId].items.push(customPlan);
  st.setItem(dataKey,JSON.stringify(data));st.setItem(catalogKey,JSON.stringify(catalog));st.setItem('water-editor:'+D.projectId+':USER-VERSION','用户另一版本');
  const immutable=clone(D.snapshot);assert.equal(C.initialize(st),true);
  const migrated=JSON.parse(st.getItem(dataKey)),saved=JSON.parse(st.getItem(catalogKey)),plans=saved.dmaPlans[D.topologyId].items;
  assert.deepEqual(migrated.nodes,data.nodes);assert.deepEqual(migrated.pipes,data.pipes);assert.deepEqual(migrated.metadata,data.metadata);assert.equal(migrated.userMemo,'保留');
  for(const z of migrated.zones){assert.deepEqual(z.boundary,D.snapshot.zones.find(a=>a.id===z.id).boundary);assert.equal(z.boundarySignature,G.boundarySignature(migrated,z));}
  assert.equal(plans[0].name,'我的分区方案');assert.equal(plans[0].zones[0].name,'用户分区名');assert.ok(plans[0].zones[0].boundary);
  assert.deepEqual(plans[1].zones[0],editedPlan.zones[0]);assert.equal(plans[1].zones[0].boundary,undefined);
  assert.deepEqual(plans[2].zones,customPlan.zones);assert.equal(st.getItem('water-editor:'+D.projectId+':USER-VERSION'),'用户另一版本');
  assert.deepEqual(D.snapshot,immutable);const after=[...st.entries];assert.equal(C.initialize(st),false);assert.deepEqual([...st.entries],after);
});

test('boundary migration does not stamp original shapes onto changed member geometry',()=>{
  const st=storage();C.initialize(st);const dataKey='water-editor:'+D.projectId+':'+D.topologyId,catalogKey='water-topology-store:'+D.projectId;
  const data=C.snapshot(),catalog=C.store();data.zones=withoutBoundaries(data.zones);data.nodes.find(n=>n.id==='JS625').x+=.5;
  catalog.dmaPlans[D.topologyId].items[0].zones=withoutBoundaries(catalog.dmaPlans[D.topologyId].items[0].zones);
  st.setItem(dataKey,JSON.stringify(data));st.setItem(catalogKey,JSON.stringify(catalog));assert.equal(C.initialize(st),true);
  const actual=JSON.parse(st.getItem(dataKey)),plan=JSON.parse(st.getItem(catalogKey)).dmaPlans[D.topologyId].items[0];
  assert.deepEqual(actual.nodes,data.nodes);assert.deepEqual(actual.pipes,data.pipes);
  assert.equal(actual.zones.find(z=>z.id==='DMA-01').boundary,undefined);assert.equal(plan.zones.find(z=>z.id==='DMA-01').boundary,undefined);
  assert.ok(actual.zones.find(z=>z.id==='DMA-02').boundary);
});

test('known previous generated polygons migrate to narrow corridors while custom shapes and edited plans stay intact',()=>{
  const st=storage();C.initialize(st);const dataKey='water-editor:'+D.projectId+':'+D.topologyId,catalogKey='water-topology-store:'+D.projectId;
  const data=C.snapshot(),catalog=C.store(),oldBoundaries=D.snapshot.metadata.previousBoundaryByZone;
  assert.deepEqual(Object.keys(oldBoundaries).sort(),D.snapshot.zones.map(z=>z.id).sort());
  function prior(zones){for(const z of zones){z.boundary=clone(oldBoundaries[z.id]);z.boundaryMode='enclosing-polygon';for(const field of ['boundaryWidthM','boundaryRevision','boundaryPreviousAreaM2','boundaryAreaReductionPercent','boundaryWidthException'])delete z[field];z.boundarySignature=G.boundarySignature(data,z);}return zones;}
  prior(data.zones);data.userMemo='旧导入保留';data.metadata.boundaryValidation={oldBoundaryRevision:true};delete data.metadata.boundaryGeneration;delete data.metadata.previousBoundaryByZone;
  const original=catalog.dmaPlans[D.topologyId].items[0];prior(original.zones);original.name='保留旧方案名称';
  const custom={...clone(original),id:'CUSTOM-CORRIDOR',zones:clone(D.snapshot.zones)};custom.zones[0].boundary.reverse();custom.zones[0].boundaryNote='用户自定义';catalog.dmaPlans[D.topologyId].items.push(custom);
  const edited={...clone(original),id:'EDITED-OLD'};edited.zones[0].nodeIds.pop();catalog.dmaPlans[D.topologyId].items.push(edited);
  st.setItem(dataKey,JSON.stringify(data));st.setItem(catalogKey,JSON.stringify(catalog));assert.equal(C.initialize(st),true);
  const actual=JSON.parse(st.getItem(dataKey)),plans=JSON.parse(st.getItem(catalogKey)).dmaPlans[D.topologyId].items;
  for(const z of actual.zones){const expected=D.snapshot.zones.find(a=>a.id===z.id);assert.deepEqual(z.boundary,expected.boundary);assert.equal(z.boundaryWidthM,10);assert.equal(z.boundaryRevision,expected.boundaryRevision);assert.equal(z.boundaryPreviousAreaM2,expected.boundaryPreviousAreaM2);assert.equal(z.boundaryAreaReductionPercent,expected.boundaryAreaReductionPercent);assert.deepEqual(z.boundaryWidthException,expected.boundaryWidthException);}
  assert.deepEqual(actual.nodes,data.nodes);assert.deepEqual(actual.pipes,data.pipes);assert.equal(actual.userMemo,'旧导入保留');
  assert.deepEqual(actual.metadata,{...data.metadata,boundaryValidation:D.snapshot.metadata.boundaryValidation,boundaryGeneration:D.snapshot.metadata.boundaryGeneration,previousBoundaryByZone:D.snapshot.metadata.previousBoundaryByZone});
  assert.equal(plans[0].name,'保留旧方案名称');assert.deepEqual(plans[0].zones.map(z=>z.boundary),D.snapshot.zones.map(z=>z.boundary));
  assert.deepEqual(plans[1].zones,custom.zones);assert.deepEqual(plans[2].zones[0],edited.zones[0]);
  const before=[...st.entries];assert.equal(C.initialize(st),false);assert.deepEqual([...st.entries],before);
});

test('a failed boundary migration restores both original serialized records',()=>{
  const st=storage();C.initialize(st);const dataKey='water-editor:'+D.projectId+':'+D.topologyId,catalogKey='water-topology-store:'+D.projectId;
  const data=C.snapshot(),catalog=C.store();data.zones=withoutBoundaries(data.zones);catalog.dmaPlans[D.topologyId].items[0].zones=withoutBoundaries(catalog.dmaPlans[D.topologyId].items[0].zones);
  st.setItem(dataKey,JSON.stringify(data));st.setItem(catalogKey,JSON.stringify(catalog));const before=[...st.entries],write=st.setItem;let attempts=0;
  st.setItem=(k,v)=>{if(++attempts===2)throw Error('migration quota');return write(k,v);};
  assert.throws(()=>C.initialize(st),/migration quota/);assert.deepEqual([...st.entries],before);
  st.setItem=write;assert.equal(C.initialize(st),true);assert.equal(C.initialize(st),false);
});

test('app topology editor uses the requested saved campus version and does not replace user edits',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
  const functionSource=source.slice(source.indexOf('  function topologyEditor()'),source.indexOf('  let hydraulicUI;'));
  const st=storage();C.initialize(st);
  const originalKey=D.projectId+':'+D.topologyId,edited=C.snapshot();edited.nodes[0].name='原版本修改';st.setItem('water-editor:'+originalKey,JSON.stringify(edited));
  const next=C.snapshot();next.nodes[0].name='新版本修改';st.setItem('water-editor:'+D.projectId+':CAMPUS-V2',JSON.stringify(next));
  global.localStorage=st;
  const ctx={state:{activeProjectId:D.projectId,selectedTopology:D.topologyId},window:{...window,CampusProject:C},localStorage:st,liveTopologyEditor:null,render(){},showToast(){},topologyCheckIcon(){},baseNetworkMap(){return '';}};
  vm.createContext(ctx);vm.runInContext(functionSource,ctx);
  let e=ctx.topologyEditor();assert.equal(e.key,originalKey);assert.equal(e.s.data.nodes[0].name,'原版本修改');
  // A saved version must not fall back to the original dataset or another project.
  e.seed=()=>C.snapshot();ctx.state.selectedTopology='CAMPUS-V2';e=ctx.topologyEditor();
  assert.equal(e.key,D.projectId+':CAMPUS-V2');assert.equal(e.s.data.nodes[0].name,'新版本修改');
  ctx.state.selectedTopology=D.topologyId;assert.equal(ctx.topologyEditor().s.data.nodes[0].name,'原版本修改');
  assert.deepEqual(JSON.parse(st.getItem('water-editor:'+originalKey)),edited);
});
