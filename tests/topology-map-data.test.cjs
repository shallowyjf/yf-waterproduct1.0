const {test}=require('node:test');
const assert=require('node:assert/strict');
global.window={};global.document={addEventListener(){}};
const storage=new Map();global.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
require('../city-topology.js');require('../topology-editor.js');require('../topology-map-data.js');
function setup(){const data=window.createCityTopology();const e=new window.WaterTopologyEditor({render(){},toast(){},icon(){return '';}});e.use('test-'+storage.size,'',{data});return {data:e.s.saved,e};}
test('historical events resolve to current city objects without legacy coordinates',()=>{
 const {data,e}=setup(),model=window.TopologyMapData.build(data,e);
 for(const id of ['WO-2026-072','WO-2026-068','INS-2026-114','INS-2026-108']){const host=window.TopologyMapData.historyHost(model,'work',{id});assert.ok(model.objects.has(host));assert.ok(model.position(host));}
 const quality=window.TopologyMapData.historyHost(model,'alarm',{id:'ALM-018',metric:'余氯偏低'}),flow=window.TopologyMapData.historyHost(model,'alarm',{id:'ALM-018',metric:'数据延迟'});assert.notEqual(quality,flow);
 model.objects.delete('CITY-B-WEST');assert.equal(window.TopologyMapData.historyHost(model,'work',{id:'WO-2026-068'}),null);
});
test('interior users preserve connectivity, version isolation and DMA membership with graded diameters',()=>{
 const source=window.addNorthwestUsers(window.repairLogisticsBranch(window.normalizeTopologyTerminals(window.repairTopologyConnections(window.createCityTopology())))),snapshot=JSON.stringify(source),data=window.addInteriorUsers(source);
 assert.equal(JSON.stringify(source),snapshot);assert.equal(data.nodes.length,source.nodes.length+24);assert.equal(data.pipes.length,source.pipes.length+24);
 assert.deepEqual(window.addInteriorUsers(data),data);
 for(const size of [80,100,150,200,250,300,800,1000])assert.ok(data.pipes.some(p=>p.diameter===size));
 for(const n of data.nodes.filter(n=>n.type==='user'))assert.equal(data.pipes.filter(p=>p.start===n.id||p.end===n.id).length,1);
 for(const n of data.nodes.filter(n=>n.id.startsWith('CITY-U-IN-')&&n.type==='user'))assert.ok(data.zones.some(z=>z.nodeIds.includes(n.id)));
 const e=new window.WaterTopologyEditor({render(){},toast(){},icon(){return '';}});e.use('interior','',{data,preserve:true});e.validate(data);assert.equal(e.issues().filter(i=>['connectivity','island'].includes(i.category)).length,0);
});
test('repair keeps baseline immutable and inherits DMA while clearing connectivity and islands',()=>{
 const original=window.createCityTopology(),snapshot=JSON.stringify(original),fixed=window.repairTopologyConnections(original);
 const e=new window.WaterTopologyEditor({render(){},toast(){},icon(){return '';}});e.use('repair','',{data:fixed,preserve:true});
 assert.equal(JSON.stringify(original),snapshot);assert.deepEqual(fixed.zones,original.zones);
 assert.equal(fixed.nodes.length,137);assert.equal(fixed.pipes.length,169);
 assert.equal(e.issues().filter(i=>i.category==='island'||['管线端点未连接节点','节点未连接管线'].includes(i.type)).length,0);
 const model=window.TopologyMapData.build(fixed,e);for(const event of model.events){assert.ok(model.objects.has(event.hostId));assert.ok(model.position(event.id));}
});
test('terminal normalization makes users and caps degree one without losing associations',()=>{
 const source=window.repairTopologyConnections(window.createCityTopology()),before=JSON.stringify(source),data=window.normalizeTopologyTerminals(source);
 assert.equal(JSON.stringify(source),before);
 const e=new window.WaterTopologyEditor({render(){},toast(){},icon(){return '';}});e.use('terminal','',{data,preserve:true});e.validate(data);
 assert.equal(e.issues().filter(i=>['connectivity','island'].includes(i.category)).length,0);
 for(const n of data.nodes){const degree=data.pipes.filter(p=>p.start===n.id||p.end===n.id).length;if(['user','cap'].includes(n.type))assert.equal(degree,1);if(n.type==='node')assert.ok(degree>=2);}
 for(const z of source.zones){const next=data.zones.find(a=>a.id===z.id);assert.ok(z.nodeIds.every(id=>next.nodeIds.includes(id)));assert.ok(z.pipeIds.every(id=>next.pipeIds.includes(id)));}
 assert.deepEqual(window.normalizeTopologyTerminals(data),data);
});
test('logistics user is downstream of its valve and island tie starts at the backbone',()=>{
 const data=window.repairLogisticsBranch(window.normalizeTopologyTerminals(window.repairTopologyConnections(window.createCityTopology())));
 const user=data.nodes.find(n=>n.id==='CITY-U-1');assert.equal(user.x,105);assert.equal(user.y,45);
 const linked=data.pipes.filter(p=>p.start===user.id||p.end===user.id);assert.equal(linked.length,1);assert.equal(linked[0].start,'CITY-BV-1');
 assert.equal(data.pipes.find(p=>p.id==='REPAIR-P-001').start,'CITY-J-11');
 const e=new window.WaterTopologyEditor({render(){},toast(){},icon(){return '';}});e.use('logistics','',{data,preserve:true});e.validate(data);
 assert.equal(e.issues().filter(i=>['connectivity','island'].includes(i.category)).length,0);
});
test('northwest loop supplies two distinct single-connection users',()=>{
 const source=window.repairLogisticsBranch(window.normalizeTopologyTerminals(window.repairTopologyConnections(window.createCityTopology()))),data=window.addNorthwestUsers(source);
 assert.equal(data.nodes.length,139);assert.equal(data.pipes.length,171);assert.equal(data.nodes.filter(n=>n.type==='user').length,15);
 for(const [host,id] of [['CITY-I-11','CITY-U-NW-1'],['CITY-I-13','CITY-U-NW-2']]){const linked=data.pipes.filter(p=>p.start===id||p.end===id);assert.equal(linked.length,1);assert.equal(linked[0].start,host);}
 assert.deepEqual(window.addNorthwestUsers(data),data);assert.equal(source.nodes.length,137);
 const e=new window.WaterTopologyEditor({render(){},toast(){},icon(){return '';}});e.use('nw-users','',{data,preserve:true});e.validate(data);assert.equal(e.issues().filter(i=>['connectivity','island'].includes(i.category)).length,0);
});
test('all city catalogs and DMA geometry share actual topology members',()=>{
 const {data,e}=setup(),m=window.TopologyMapData.build(data,e);
 assert.equal(m.assets.length,137);assert.equal(m.pipes.length,167);assert.equal(m.zones.length,4);
 for(const z of m.zones){assert.ok(z.nodeIds.every(id=>m.objects.has(id)));assert.ok(z.pipeIds.every(id=>m.objects.has(id)));assert.ok(z.boundaries.every(id=>m.objects.has(id)));assert.ok(z.path.startsWith('M'));}
 assert.equal(m.totalLength,data.pipes.reduce((a,p)=>a+p.length,0));
});
test('monitor and event positions resolve to existing node or pipe geometry',()=>{
 const {data,e}=setup(),m=window.TopologyMapData.build(data,e);
 for(const item of [...m.monitors,...m.events]){assert.ok(m.objects.has(item.hostId),item.id);const host=m.objects.get(item.hostId);const expected=host.type==='pipe'?e.coords(host).reduce((a,p)=>[a[0]+p.x/2,a[1]+p.y/2],[0,0]):[host.x,host.y];assert.deepEqual(m.position(item.id),expected);}
});
test('removed monitoring host stays unbound instead of pointing at another entity',()=>{
 const {data,e}=setup();data.nodes=data.nodes.filter(n=>n.id!=='CITY-BV-10');e.s.data=data;
 const m=window.TopologyMapData.build(data,e),p=m.monitors.find(m=>m.id==='P-032');
 assert.equal(p.quality,'UNBOUND');assert.equal(m.position(p.id),null);assert.equal(m.position('ALM-032'),null);
});
test('history session is isolated and cannot enter edit mode or mutate',()=>{
 const {data,e}=setup();const snapshot=JSON.parse(JSON.stringify(data));snapshot.sampleRevision='legacy';snapshot.nodes[0].name='历史名称';
 e.use('history','',{data:snapshot,readOnly:true,preserve:true});e.action('edit');assert.equal(e.s.editing,false);
 e.mutate(()=>e.s.data.nodes=[]);assert.equal(e.s.data.nodes.length,137);assert.notEqual(data.nodes[0].name,'历史名称');
 assert.equal(window.TopologyMapData.build(e.s.saved,e,true).history,true);
});
