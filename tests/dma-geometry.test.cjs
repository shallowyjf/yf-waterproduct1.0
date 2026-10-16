const {test}=require('node:test');
const assert=require('node:assert/strict');
const G=require('../dma-geometry.js');
global.window={DMAGeometry:G};global.document={addEventListener(){}};
require('../topology-editor.js');require('../dma-plans.js');
const points=xy=>xy.map(([x,y])=>({x,y}));
const clone=v=>JSON.parse(JSON.stringify(v));
const square=(x,y,w=1,h=w)=>points([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
const L=points([[0,0],[4,0],[4,1],[1,1],[1,4],[0,4]]);
const close=(actual,expected,eps=1e-8)=>assert.ok(Math.abs(actual-expected)<=eps,`${actual} != ${expected}`);
function zonesInNotch(){
  const a=L.map((p,i)=>({id:'A'+i,...p})),b=square(2,1.5,.4).map((p,i)=>({id:'B'+i,...p}));
  const data={nodes:[...a,...b],pipes:[{id:'P',start:'A0',end:'A2',geometry:points([[0,0],[4,0],[4,1]])}],zones:[
    {id:'A',nodeIds:a.map(n=>n.id),pipeIds:['P'],boundary:clone(L)},
    {id:'B',nodeIds:b.map(n=>n.id),pipeIds:[],boundary:square(2,1.5,.4)}
  ]};
  for(const z of data.zones)z.boundarySignature=G.boundarySignature(data,z);
  return data;
}
function editorFixture(){
  const data=zonesInNotch();data.schema='water-topology-v1';
  data.nodes.forEach(n=>Object.assign(n,{name:n.id,type:'node',elevation:0,diameter:null}));
  data.pipes.forEach(p=>Object.assign(p,{name:p.id,type:'pipe',a:{x:0,y:0},b:{x:4,y:1},startElevation:0,endElevation:0,diameter:100,length:5,material:'PE'}));
  data.zones.forEach(z=>Object.assign(z,{name:z.id,type:'zone',parent:''}));
  const values=new Map(),messages=[];global.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const e=new window.WaterTopologyEditor({render(){},toast(message){messages.push(message);},icon(){return '';}});
  e.use('spatial-test','',{data,preserve:true});e.mode='dma';e.s.editing=true;e.s.dirty=true;
  return {data:e.s.data,e,values,messages};
}

test('member geometry includes every polyline bend and authoritative connected endpoints',()=>{
  const data={nodes:[{id:'A',x:0,y:0},{id:'B',x:8,y:0}],pipes:[{id:'P',start:'A',end:'B',a:{x:-999,y:0},b:{x:999,y:0},geometry:{type:'LineString',coordinates:[[0,0],[2,5],[8,0]]}}]};
  const before=clone(data),result=G.pointsForZone(data,{nodeIds:['A'],pipeIds:['P']});
  assert.ok(result.some(p=>p.x===2&&p.y===5));assert.ok(result.some(p=>p.x===8&&p.y===0));assert.ok(!result.some(p=>Math.abs(p.x)===999));
  assert.deepEqual(data,before);assert.equal(result.length,3);
});

test('concave intersections use the actual polygon and support disconnected overlap regions',()=>{
  close(G.polygonArea(L),7);
  close(G.intersectionArea(L,square(2,2)),0); // Inside its hull, outside its concave boundary.
  close(G.intersectionArea(L,square(.5,.5,1.5)),1.25);
  const u=points([[0,0],[4,0],[4,4],[3,4],[3,1],[1,1],[1,4],[0,4]]),bar=square(0,2,4,1);
  close(G.polygonArea(u),10);close(G.intersectionArea(u,bar),2);
  close(G.intersectionArea([...u].reverse(),bar),2);close(G.intersectionArea(bar,[...u].reverse()),2);
  close(G.intersectionArea(u,u),10);
});

test('boundary edge or corner contact is permitted; positive area overlap is a conflict',()=>{
  const a=square(0,0),edge=square(1,0),corner=square(1,1),inside=square(.2,.2,.2),partial=square(.9,.2,.3);
  assert.equal(G.overlap(a,edge),false);assert.equal(G.overlap(a,corner),false);
  close(G.intersectionArea(a,edge),0);close(G.intersectionArea(a,corner),0);
  assert.equal(G.overlap(a,inside),true);assert.equal(G.overlap(a,partial),true);close(G.intersectionArea(a,partial),.03);
  assert.equal(G.pointInPolygon({x:1,y:.4},a),true);assert.equal(G.pointInPolygon({x:1,y:1},a),true);
  assert.throws(()=>G.overlap(a,edge,-1));assert.throws(()=>G.overlap(a,edge,NaN));
});

test('polyline enclosure checks complete segments, including exit and reentry between interior vertices',()=>{
  const notch=points([[0,0],[10,0],[10,4],[9,4],[9,1],[8,1],[8,4],[0,4]]);
  const crossing=points([[.5,3],[9.5,3]]); // Both endpoints and midpoint are inside; the segment crosses the notch.
  assert.ok(crossing.every(p=>G.pointInPolygon(p,notch)));assert.equal(G.pointInPolygon({x:5,y:3},notch),true);
  assert.equal(G.containsPolyline(notch,crossing),false);
  assert.equal(G.containsPolyline(notch,points([[.5,3],[.5,.5],[9.5,.5],[9.5,3]])),true);
  assert.equal(G.containsPolyline(notch,points([[8,4],[8,1],[9,1],[9,4]])),true);
  const data={nodes:[{id:'A',...crossing[0]},{id:'B',...crossing[1]}],pipes:[{id:'P',start:'A',end:'B',geometry:crossing}]},z={nodeIds:['A','B'],pipeIds:['P']};
  assert.equal(G.containsZone(data,z,notch),false);
});

test('invalid self-crossing, repeated-path and degenerate boundaries cannot be accepted',()=>{
  assert.equal(G.isSimplePolygon(L),true);assert.equal(G.isSimplePolygon([...L].reverse()),true);
  assert.equal(G.isSimplePolygon(points([[0,0],[3,3],[0,3],[3,0]])),false);
  assert.equal(G.isSimplePolygon(points([[0,0],[1,0],[2,0]])),false);
  assert.equal(G.isSimplePolygon(points([[0,0],[2,0],[2,2],[0,2],[2,0]])),false);
});

test('current explicit concave boundary is used and adjacent notched zone has no false conflict',()=>{
  const data=zonesInNotch(),before=clone(data);
  assert.deepEqual(G.zonePolygon(data,data.zones[0]),L);
  assert.deepEqual(G.findOverlaps(data),[]);assert.deepEqual(G.validateZones(data),[]);
  assert.deepEqual(data,before);
});

test('editing node coordinates, membership or an interior pipe bend invalidates a saved boundary and exposes overlap',()=>{
  const cases=[
    data=>{data.nodes[0].x=-.1;},
    data=>{data.nodes.push({id:'NEW',x:.5,y:.5});data.zones[0].nodeIds.push('NEW');},
    data=>{data.pipes[0].geometry[1].x=4.1;}
  ];
  for(const edit of cases){
    const data=zonesInNotch(),z=data.zones[0],signature=z.boundarySignature;edit(data);
    assert.notEqual(G.boundarySignature(data,z),signature);
    assert.deepEqual(G.zonePolygon(data,z),G.hull(G.pointsForZone(data,z)));
    const issues=G.validateZones(data);assert.ok(issues.some(i=>i.type==='stale-boundary'&&i.zoneId==='A'));
    assert.ok(issues.some(i=>i.type==='overlap'));
    const overlaps=G.findOverlaps(data);assert.equal(overlaps.length,1);assert.ok(overlaps[0].area>0);
  }
});

test('a matching signature cannot conceal an invalid boundary or a pipe extending outside it',()=>{
  for(const [boundary,expected] of [[points([[0,0],[4,4],[0,4],[4,0]]),'invalid-boundary'],[square(0,0,.5),'outside-boundary']]){
    const data=zonesInNotch(),z=data.zones[0];z.boundary=boundary;z.boundarySignature=G.boundarySignature(data,z);
    assert.deepEqual(G.zonePolygon(data,z),G.hull(G.pointsForZone(data,z)));
    assert.ok(G.validateZones(data).some(i=>i.type===expected&&i.zoneId==='A'));
  }
});

test('boundary signatures ignore member order and descriptive edits but retain geometry changes',()=>{
  const data=zonesInNotch(),z=data.zones[0],original=G.boundarySignature(data,z);
  z.nodeIds.reverse();z.name='重命名';data.nodes[0].name='节点改名';
  assert.equal(G.boundarySignature(data,z),original);
  data.pipes[0].geometry[1].y=.1;assert.notEqual(G.boundarySignature(data,z),original);
});

test('geometry remains stable at large coordinate origins without mutating input',()=>{
  const translate=poly=>poly.map(p=>({x:p.x+12608136,y:p.y+3750202})),a=translate(L),b=translate(square(.5,.5,1.5)),before=clone([a,b]);
  close(G.intersectionArea(a,b),1.25,1e-7);assert.deepEqual([a,b],before);
  close(G.polygonArea(a),7);
});

test('concave polygon labels stay inside even when the mean vertex position lies in its notch',()=>{
  const mean={x:L.reduce((sum,p)=>sum+p.x,0)/L.length,y:L.reduce((sum,p)=>sum+p.y,0)/L.length};
  assert.equal(G.pointInPolygon(mean,L),false);
  for(const polygon of [L,[...L].reverse()]){
    const label=G.labelPoint(polygon);assert.equal(G.pointInPolygon(label,polygon),true);
    const tiny=square(label.x-1e-5,label.y-1e-5,2e-5);
    assert.ok(tiny.every(p=>G.pointInPolygon(p,polygon)), 'label is interior rather than on an edge');
  }
});

test('geometry caches do not retain stale in-place edits or expose mutable cached polygons and triangles',()=>{
  const a=square(0,0,2),b=square(1,0,2);close(G.intersectionArea(a,b),2);
  b.forEach(p=>p.x+=10);close(G.intersectionArea(a,b),0);
  const expected=G.triangulate(L),returned=G.triangulate(L);returned[0][0].x=999;returned.pop();assert.deepEqual(G.triangulate(L),expected);
  const data=zonesInNotch(),polygon=G.zonePolygon(data,data.zones[0]);polygon[0].x=999;polygon.pop();assert.deepEqual(G.zonePolygon(data,data.zones[0]),L);
  data.zones[0].boundary[0].x=-.1;const changed=G.zonePolygon(data,data.zones[0]);assert.equal(changed[0].x,-.1);
});

test('DMA save and activation reject spatial overlap even when every member ID is distinct',()=>{
  const {data,e,values,messages}=editorFixture();
  delete data.zones[0].boundary;delete data.zones[0].boundarySignature;
  const stats=window.DMAPlans.stats(data,data.zones);assert.equal(stats.overlap,0);assert.equal(stats.spatialOverlap,1);
  assert.ok(e.dmaIssues().some(i=>i.title.includes('空间重叠')));
  e.action('save');assert.equal(values.size,0);assert.equal(e.s.dirty,true);assert.match(messages.at(-1),/空间重叠/);
  const bucket={activeId:'unchanged',items:[{id:'new',zones:data.zones}]};
  assert.throws(()=>window.DMAPlans.activate(bucket,'new',data),/空间重叠/);assert.equal(bucket.activeId,'unchanged');
});

test('DMA import, save and activation do not silently accept an invalid explicit boundary without spatial conflicts',()=>{
  const {data,e,values,messages}=editorFixture();data.zones=data.zones.slice(0,1);data.zones[0].boundarySignature='stale';
  assert.deepEqual(G.findOverlaps(data),[]);
  e.action('save');assert.equal(values.size,0);assert.match(messages.at(-1),/边界.*重新|重新.*边界/);
  assert.throws(()=>e.validateDma({schema:'water-dma-v1',topologyKey:'spatial-test',zones:data.zones}),/边界/);
  const bucket={activeId:'unchanged',items:[{id:'new',zones:data.zones}]};
  assert.throws(()=>window.DMAPlans.activate(bucket,'new',data),/边界/);assert.equal(bucket.activeId,'unchanged');
  data.zones[0].boundarySignature=G.boundarySignature(data,data.zones[0]);
  e.action('save');assert.equal(e.s.dirty,false);assert.ok(values.has('water-editor:spatial-test'));
  window.DMAPlans.activate(bucket,'new',data);assert.equal(bucket.activeId,'new');
});
