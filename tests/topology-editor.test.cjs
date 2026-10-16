const {test}=require('node:test');
const assert=require('node:assert/strict');
global.window={};
global.document={addEventListener(){}};
const storage=new Map();
global.localStorage={setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)};
require('../topology-editor.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function editor(){
  const e=new window.WaterTopologyEditor({render(){},toast(){},icon(){return '';}});
  const nodes=[['A',0,0],['B',10,0],['C',10,10],['D',0,10],['E',5,5],['F',40,40]].map(([id,x,y])=>({id,x,y,type:'node',name:id,elevation:10,diameter:null}));
  const pipe=(id,start,end,diameter=300)=>({id,type:'pipe',name:id,start,end,a:{x:0,y:0},b:{x:10,y:0},diameter,material:'PE',length:100,startElevation:10,endElevation:10});
  const data={schema:'water-topology-v1',nodes,pipes:[pipe('P1','A','B'),pipe('P2','B','C'),pipe('P3','C','D'),pipe('P4','D','A')],zones:[]};
  e.key='test';e.s={data,saved:clone(data),editing:true,dirty:false,history:[],selected:null,tool:'select',vertices:[],islands:[],view:[0,0,900,540],defaults:{diameter:300,material:'PE'},visible:{},tab:'layers'};
  return e;
}
test('view mode cannot mutate, delete, clear or import',()=>{
 const e=editor(),original=clone(e.s.data);e.s.editing=false;e.mutate(()=>e.s.data.nodes=[]);e.action('clear');e.action('delete');assert.deepEqual(e.s.data,original);assert.equal(e.s.modal,undefined);
});
test('DMA editor rejects point and pipe mutations',()=>{const e=editor(),before=clone(e.s.data);e.mode='dma';e.mutate(()=>{e.s.data.nodes[0].x=99;e.s.data.pipes=[];});assert.deepEqual(e.s.data,before);assert.equal(e.s.history.length,0);});
test('DMA import can move between plans of the same topology, not other topologies',()=>{const e=editor();e.key='PRJ-1:T8:dma:S2';const raw={schema:'water-dma-v1',topologyKey:'PRJ-1:T8',planId:'S1',zones:[]};assert.deepEqual(e.validateDma(raw).nodes,e.s.data.nodes);assert.throws(()=>e.validateDma({...raw,topologyKey:'PRJ-1:T3'}));});
test('DMA stores selected member sets and generates their minimal convex hull',()=>{
 const e=editor();e.s.tool='polygon';e.s.vertices=[{x:-1,y:-1},{x:11,y:-1},{x:11,y:11},{x:-1,y:11}];e.finishPolygon();
 const z=e.s.data.zones[0];assert.deepEqual(z.nodeIds,['A','B','C','D','E']);assert.deepEqual(z.pipeIds,['P1','P2','P3','P4']);assert.deepEqual(e.zonePoints(z),[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}]);assert.equal(e.s.dirty,true);
});
test('collinear selection cannot create a DMA polygon',()=>{
 const e=editor();e.s.vertices=[{x:-1,y:-1},{x:11,y:-1},{x:11,y:1},{x:-1,y:1}];e.finishPolygon();assert.equal(e.s.data.zones.length,0);
});
test('self-intersecting selection is rejected',()=>{
 const e=editor();e.s.vertices=[{x:-1,y:-1},{x:11,y:11},{x:11,y:-1},{x:-1,y:11}];e.finishPolygon();assert.equal(e.s.data.zones.length,0);
});
test('concave selection excludes a line whose endpoints are inside but middle is outside',()=>{
 const e=editor();e.s.vertices=[{x:-1,y:-1},{x:11,y:-1},{x:11,y:11},{x:8,y:11},{x:8,y:4},{x:2,y:4},{x:2,y:11},{x:-1,y:11}];e.finishPolygon();const z=e.s.data.zones[0];assert.ok(z.nodeIds.includes('C')&&z.nodeIds.includes('D'));assert.ok(!z.pipeIds.includes('P3'));
});
test('moving a node updates its connected geometry and DMA hull',()=>{
 const e=editor();const p=e.object('P1');assert.equal(e.coords(p)[0].x,0);e.mutate(()=>e.object('A').x=-15);assert.equal(e.coords(p)[0].x,-15);e.action('undo');assert.equal(e.coords(e.object('P1'))[0].x,0);assert.equal(e.s.dirty,false);
});
test('deleting connected node removes linked pipes and undo restores all objects',()=>{
 const e=editor(),original=clone(e.s.data);e.deleteObjects(['B']);assert.equal(e.object('B'),undefined);assert.equal(e.object('P1'),undefined);assert.equal(e.object('P2'),undefined);e.action('undo');assert.deepEqual(e.s.data,original);
});
test('connectivity checks reflect current endpoint references and isolated nodes',()=>{
 const e=editor();e.object('P1').start='';let issues=e.issues();assert.ok(issues.find(i=>i.objectId==='P1'&&i.category==='connectivity'));assert.ok(issues.find(i=>i.objectId==='F'&&i.category==='connectivity'));e.object('P1').start='A';assert.ok(!e.issues().find(i=>i.objectId==='P1'&&i.category==='connectivity'));
});
test('diameter threshold is strict, checks only degree-two nodes and highlights mismatched points',()=>{
 const e=editor();e.object('P1').diameter=400;assert.ok(!e.issues().find(i=>i.type==='两通点管径突变'));e.object('P1').diameter=401;assert.ok(e.issues().find(i=>i.objectId==='B'&&i.type==='两通点管径突变'));e.object('B').diameter=500;assert.deepEqual(e.issues().find(i=>i.objectId==='B'&&i.type==='点线管径不一致').objects,['B']);
});
test('slope threshold excludes exactly five percent',()=>{
 const e=editor();e.object('P1').endElevation=15;assert.ok(!e.issues().some(i=>i.category==='elevation'));e.object('P1').endElevation=15.1;assert.ok(e.issues().some(i=>i.category==='elevation'));
});
test('save serializes data and resets undo history; reload validation accepts it',()=>{
 const e=editor();e.mutate(()=>e.object('A').name='更新名称');e.action('save');assert.equal(e.s.dirty,false);assert.equal(e.s.history.length,0);const saved=e.validate(JSON.parse(storage.get('water-editor:test')));assert.equal(saved.nodes[0].name,'更新名称');
});
test('invalid import is rejected before data replacement',()=>{
 const e=editor(),bad=clone(e.s.data);bad.pipes[0].start='UNKNOWN';assert.throws(()=>e.validate(bad),/引用无效/);bad.pipes[0].start='A';bad.nodes[1].id='A';assert.throws(()=>e.validate(bad),/重复/);assert.equal(e.s.data.nodes.length,6);
});
test('DMA import only replaces zones and verifies topology ownership',()=>{
 const e=editor(),originalNodes=clone(e.s.data.nodes);const data=e.validateDma({schema:'water-dma-v1',topologyKey:'test',zones:[{id:'DMA-1',type:'zone',name:'分区',nodeIds:['A','B','C'],pipeIds:['P1']}]});assert.deepEqual(data.nodes,originalNodes);assert.equal(data.zones.length,1);assert.throws(()=>e.validateDma({schema:'water-dma-v1',topologyKey:'another',zones:[]}),/当前拓扑/);
});
test('import rejects degenerate or duplicated DMA members',()=>{
 const e=editor(),data=clone(e.s.data);data.zones=[{id:'DMA-1',type:'zone',name:'退化分区',nodeIds:['A','B'],pipeIds:[]}];assert.throws(()=>e.validate(data),/有效面/);data.zones[0].nodeIds=['A','B','C','C'];assert.throws(()=>e.validate(data),/引用无效/);
});
test('city fixture has a meshed, multi-source backbone and valid DMA memberships',()=>{
 require('../city-topology.js');const data=window.createCityTopology(),e=editor();e.s.data=data;e.validate(data);
 assert.equal(data.nodes.length,137);assert.equal(data.pipes.length,167);assert.equal(data.nodes.filter(n=>n.type==='plant').length,3);
 const reached=new Set(['CITY-W-WEST']),queue=['CITY-W-WEST'];
 while(queue.length){const id=queue.pop();for(const p of data.pipes.filter(p=>p.start===id||p.end===id))for(const next of [p.start,p.end])if(next&&!reached.has(next)){reached.add(next);queue.push(next);}}
 assert.ok(reached.has('CITY-W-NORTH')&&reached.has('CITY-W-EAST'));assert.equal(reached.size,130);
 const backboneEdges=data.pipes.filter(p=>reached.has(p.start)&&reached.has(p.end));assert.ok(backboneEdges.length-reached.size+1>=30);
 const counts=e.issues().reduce((a,i)=>(a[i.category]=(a[i.category]||0)+1,a),{});assert.deepEqual(counts,{elevation:1,connectivity:4,diameter:3,island:3});
});
