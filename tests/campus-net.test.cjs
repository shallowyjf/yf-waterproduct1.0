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
require('../dma-demo.js');
const C=global.CampusProject;
const clone=v=>JSON.parse(JSON.stringify(v));
const digest=rows=>createHash('sha256').update(JSON.stringify(rows.sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
function storage(){const entries=new Map();return {entries,getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};}
function editor(data=C.snapshot(),st=storage()){
  global.localStorage=st;
  const e=new window.WaterTopologyEditor({render(){},toast(){},icon(){return '';}});
  e.use('campus-net-test','',{data,preserve:true});return e;
}
function components(data){
  const graph=new Map(data.nodes.map(n=>[n.id,[]]));
  for(const p of data.pipes){assert.ok(graph.has(p.start)&&graph.has(p.end),p.id);graph.get(p.start).push(p.end);graph.get(p.end).push(p.start);}
  const pending=new Set(graph.keys()),groups=[];
  while(pending.size){const found=new Set(),queue=[pending.values().next().value];while(queue.length){const n=queue.pop();if(found.has(n))continue;found.add(n);pending.delete(n);queue.push(...graph.get(n).filter(id=>!found.has(id)));}groups.push(found);}
  return groups;
}

// Independently decoded from the 43,977-byte NET, SHA-256
// ac8c23b1d996ce80c667dfa225e4b4b57c7104c86e29d18629e258e0a40f7503.
// The checksums include every source object, including exact Chinese descriptions.
test('latest NET keeps all source coordinates, elevations, descriptions, endpoints and pipe attributes',()=>{
  const s=C.snapshot();
  assert.equal(s.nodes.length,96);assert.equal(s.pipes.length,94);
  assert.equal(new Set([...s.nodes,...s.pipes,...s.zones].map(x=>x.id)).size,s.nodes.length+s.pipes.length+s.zones.length);
  assert.equal(digest(s.nodes.map(n=>[n.sourceId,n.sourceX,n.sourceY,n.sourceDescription,n.sourceTag,Number(n.epanetElevation)])),'0269d33def9316a5852eb7e4368f50509a67021bba4b7a58843b483187ae4aa2');
  assert.equal(digest(s.pipes.map(p=>[p.sourceId,p.start,p.end,p.length,p.diameter,Number(p.roughness),p.sourceDescription,p.sourceTag,p.sourceGeometry])),'26c4bb8164d2951e9e4e8e1675ec60b9bb025d27a6df446a1fdda737e6acbf9c');
  assert.ok(Math.abs(s.pipes.reduce((sum,p)=>sum+p.length,0)-1905.820928635)<1e-8);
  assert.deepEqual(s.pipes.reduce((counts,p)=>(counts[p.diameter]=(counts[p.diameter]||0)+1,counts),{}),{100:21,200:73});
  assert.deepEqual(editor(s).validate(s),s);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname,'../data/campus-topology.json'),'utf8')),s);
});

test('latest source removes obsolete nodes and keeps both components without fabricated hydraulic sources',()=>{
  const s=C.snapshot(),groups=components(s);
  assert.deepEqual(groups.map(g=>g.size).sort((a,b)=>a-b),[45,51]);
  assert.deepEqual(groups.map(g=>s.pipes.filter(p=>g.has(p.start)&&g.has(p.end)).length).sort((a,b)=>a-b),[44,50]);
  for(const id of ['JS38','JS37','JS62','JS61','JS67','JS65','JS212','JS202','JS71','JS72','JS73'])assert.ok(!s.nodes.some(n=>n.id===id),id);
  for(const id of ['7','25','26','27','28'])assert.ok(s.nodes.some(n=>n.id===id),id);
  assert.equal(s.nodes.filter(n=>n.type==='plant'||n.nodeKind==='RESERVOIR'||n.nodeKind==='TANK').length,0);
  assert.ok(s.nodes.every(n=>n.nodeKind==='JUNCTION'));
});

test('all nine node notes and the pipe 40 installation note remain visible in object details',()=>{
  const s=C.snapshot(),model=window.TopologyMapData.build(s,editor(s));
  const notes={JS643:'开挖二级表，北侧入口',JS258:'开挖二级表-北侧入口待选',JS54:'二级表-南测入口',JS238:'二级表-北侧泵房入口',JS70:'二级表-食堂直供','19':'二级表-北侧楼顶楼','21':'北侧泵房-to宿舍 二级表','7':'二级表-幼儿园','27':'南教 二级表'};
  assert.deepEqual(s.nodes.filter(n=>n.sourceDescription.includes('二级表')).map(n=>n.id).sort(),Object.keys(notes).sort());
  for(const [id,description] of Object.entries(notes)){
    assert.equal(model.objects.get(id).sourceDescription,description);
    assert.ok(window.TopologyMapData.detail(model,'asset',id).includes(description),id);
  }
  const pipe=s.pipes.find(p=>p.sourceId==='40');
  assert.deepEqual([pipe.start,pipe.end,pipe.diameter,pipe.length],['JS641','28',200,5.783926796]);
  assert.match(pipe.sourceDescription,/二级表-垃圾房\+体育管\+花房/);
  assert.ok(window.TopologyMapData.detail(model,'pipe',pipe.id).includes('二级表-垃圾房+体育管+花房'));
});

test('display uses the original metre coordinates with one scale and never guesses a CRS',()=>{
  const s=C.snapshot(),t=s.metadata.displayTransform,nodes=new Map(s.nodes.map(n=>[n.id,n]));
  assert.equal(s.metadata.coordinateSystem.crs,null);assert.equal(s.metadata.coordinateSystem.basemapAllowed,false);
  const display=([x,y])=>({x:t.width/2+(x-t.centerX)*t.scale,y:t.height/2-(y-t.centerY)*t.scale});
  for(const n of s.nodes){const q=display([n.sourceX,n.sourceY]);assert.ok(Math.abs(n.x-q.x)<=.000001,n.id);assert.ok(Math.abs(n.y-q.y)<=.000001,n.id);}
  for(const p of s.pipes){
    assert.deepEqual(p.a,{x:nodes.get(p.start).x,y:nodes.get(p.start).y});assert.deepEqual(p.b,{x:nodes.get(p.end).x,y:nodes.get(p.end).y});
    assert.equal(p.geometry.length,p.sourceGeometry.length);
    p.sourceGeometry.forEach((xy,i)=>{const q=display(xy);assert.ok(Math.abs(p.geometry[i].x-q.x)<=.000001,p.id);assert.ok(Math.abs(p.geometry[i].y-q.y)<=.000001,p.id);});
  }
});

test('current DMA plans and monitor hosts cannot point to deleted source objects',()=>{
  const s=C.snapshot(),objects=new Set([...s.nodes,...s.pipes].map(o=>o.id));
  const allNodes=[],allPipes=[];
  for(const z of s.zones){
    for(const id of [...(z.nodeIds||[]),...(z.pipeIds||[]),...(z.inletPipeIds||[]),...(z.outletPipeIds||[]),...(z.buildingNodeIds||[])])assert.ok(objects.has(id),`${z.id}: ${id}`);
    allNodes.push(...z.nodeIds);allPipes.push(...z.pipeIds);
    assert.equal(z.hypothetical,true);assert.equal(z.boundaryMetersInstalled,false);
  }
  assert.equal(new Set(allNodes).size,allNodes.length);assert.equal(new Set(allPipes).size,allPipes.length);
  assert.deepEqual(G.validateZones(s),[]);
  const model=window.TopologyMapData.build(s,editor(s));window.DMADemo.monitors(model);
  for(const m of model.monitors){assert.ok(objects.has(m.hostId),m.id);assert.deepEqual([m.x,m.y],model.position(m.hostId));}
  for(const m of s.metadata.boundaryMeterPlans||[]){assert.ok(objects.has(m.pipeId||m.hostId),m.id);assert.notEqual(m.installed,true);}
});

test('fresh latest import stays repeatable, keeps user edits and creates no real device or solver result',()=>{
  const st=storage();st.setItem('water-editor:OTHER:T9','keep other project');
  assert.equal(C.initialize(st),true);assert.equal(C.initialize(st),false);
  const key='water-editor:'+D.projectId+':'+D.topologyId,data=JSON.parse(st.getItem(key));data.nodes[0].name='用户本版本改名';st.setItem(key,JSON.stringify(data));
  assert.equal(C.initialize(st),false);assert.equal(JSON.parse(st.getItem(key)).nodes[0].name,'用户本版本改名');
  assert.equal(st.getItem('water-editor:OTHER:T9'),'keep other project');
  assert.deepEqual(JSON.parse(st.getItem('water-devices:'+D.projectId)),[]);
  assert.deepEqual(global.WaterV2.timeSeries(D.topologyId,data,'2026-10-26'),[]);
  assert.throws(()=>global.WaterHydraulics.simulate(data,global.WaterHydraulics.defaults(data)),/待补充|待配置|未配置/);
});

test('installation inventory separates the two excavation notes from the other eight annotations',()=>{
  const s=C.snapshot(),points=s.metadata.installationPoints;
  assert.equal(points.length,10);
  assert.deepEqual(points.filter(p=>p.excavationCandidate).map(p=>p.sourceId).sort(),['JS258','JS643']);
  assert.equal(points.find(p=>p.sourceId==='JS643').selectionPending,false);
  assert.equal(points.find(p=>p.sourceId==='JS258').selectionPending,true);
  assert.equal(points.filter(p=>p.objectType==='pipe').length,1);
  assert.ok(points.every(p=>p.installed!==true));
  for(const point of points){
    const object=[...s.nodes,...s.pipes].find(o=>o.id===point.objectId);
    assert.ok(object,point.objectId);assert.equal(point.sourceDescription,object.sourceDescription);
    if(point.sourceId==='JS258')assert.match(point.status,/待选|候选/);
  }
});

function oldSavedProject(){
  const st=storage(),old=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/archives/campus-before-20261026/campus-topology.json'),'utf8'));
  old.nodes[0].name='更新前用户修改名称';old.userMemo='现场手工备注';
  const catalog=C.store();catalog.versions[0].name='更新前自定义版本名';catalog.versions[0].published='2026-10-13';
  catalog.dmaPlans[D.topologyId].items[0].zones=clone(old.zones);catalog.dmaPlans[D.topologyId].items[0].name='更新前自定义DMA方案';
  catalog.bindings=[{key:D.topologyId+'|JS38|flow',devices:['REAL-1'],rule:'sum'},{key:D.topologyId+'|JS54|flow',devices:['REAL-2'],rule:'sum'},{key:'USER-VERSION|JS54|pressure',devices:['REAL-3'],rule:'average'}];
  catalog.bindingHistory=[{key:D.topologyId+'|JS54|flow',revision:1,devices:['REAL-2']}];
  catalog.epochs=[{topology:D.topologyId,start:'2026-10-13',end:null}];
  const devices=[{id:'REAL-1',name:'原有表档案',type:'flow'}],operations={...global.WaterOperations.empty(),orders:[{id:'USER-WORK-1',name:'原有工单'}],seeded:true};
  st.setItem('water-editor:'+D.projectId+':'+D.topologyId,JSON.stringify(old));
  st.setItem('water-topology-store:'+D.projectId,JSON.stringify(catalog));
  st.setItem('water-devices:'+D.projectId,JSON.stringify(devices));
  st.setItem('water-operations:v1:'+D.projectId,JSON.stringify(operations));
  st.setItem('water-editor:'+D.projectId+':USER-VERSION','untouched user topology');
  st.setItem('water-editor:OTHER:V1','untouched other project');
  return {st,old,catalog,devices,operations};
}

test('old browser cache is backed up completely and replaced; old bindings and DMA plans stay with the archived topology',()=>{
  const {st,old,catalog,devices,operations}=oldSavedProject(),revision=D.snapshot.metadata.topologyRevision;
  const archiveId=D.topologyId+'-before-'+revision,backupKey='water-campus-backup:'+D.projectId+':before-'+revision;
  assert.equal(C.initialize(st),true);
  assert.deepEqual(JSON.parse(st.getItem('water-editor:'+D.projectId+':'+D.topologyId)),D.snapshot);
  const backup=JSON.parse(st.getItem(backupKey));
  assert.deepEqual(backup.snapshot,old);assert.deepEqual(backup.catalog,catalog);assert.deepEqual(backup.devices,devices);assert.deepEqual(backup.operations,operations);
  assert.deepEqual(JSON.parse(st.getItem('water-editor:'+D.projectId+':'+archiveId)),old);
  const current=JSON.parse(st.getItem('water-topology-store:'+D.projectId));
  assert.equal(current.versions.find(v=>v.id===D.topologyId).status,'使用中');assert.equal(current.versions.find(v=>v.id===archiveId).status,'已归档');
  assert.deepEqual(current.dmaPlans[archiveId],catalog.dmaPlans[D.topologyId]);assert.deepEqual(current.dmaPlans[D.topologyId].items[0].zones,[]);
  assert.equal(current.bindings.filter(b=>b.key.startsWith(D.topologyId+'|')).length,0);
  assert.equal(current.bindings.filter(b=>b.key.startsWith(archiveId+'|')).length,2);
  assert.deepEqual(current.bindings.find(b=>b.key.startsWith('USER-VERSION|')),catalog.bindings[2]);
  assert.equal(current.bindingHistory[0].key,archiveId+'|JS54|flow');
  assert.deepEqual(current.epochs,[{topology:archiveId,start:'2026-10-13',end:'2026-10-26'},{topology:D.topologyId,start:'2026-10-26',end:null}]);
  assert.deepEqual(JSON.parse(st.getItem('water-devices:'+D.projectId)),devices);assert.deepEqual(JSON.parse(st.getItem('water-operations:v1:'+D.projectId)),operations);
  assert.equal(st.getItem('water-editor:'+D.projectId+':USER-VERSION'),'untouched user topology');assert.equal(st.getItem('water-editor:OTHER:V1'),'untouched other project');
  const before=[...st.entries];assert.equal(C.initialize(st),false);assert.deepEqual([...st.entries],before);
});

test('a failed replacement rolls back topology and backup writes and succeeds on retry',()=>{
  const {st}=oldSavedProject(),before=[...st.entries],write=st.setItem;let calls=0;
  st.setItem=(k,v)=>{if(++calls===4)throw Error('quota full');write(k,v);};
  assert.throws(()=>C.initialize(st),/quota full/);assert.deepEqual([...st.entries],before);
  st.setItem=write;assert.equal(C.initialize(st),true);assert.equal(C.initialize(st),false);
});

function archiveDatabase(failCommit=false){
  const records=new Map();
  const db={createObjectStore(){},close(){},transaction(name,mode){
    const tx={},pending=[];
    const objects={
      getAll(){const r={};queueMicrotask(()=>{r.result=[...records.values()].map(clone);r.onsuccess?.();});return r;},
      get(id){const r={};queueMicrotask(()=>{r.result=records.has(id)?clone(records.get(id)):undefined;r.onsuccess?.();if(mode==='readwrite')queueMicrotask(()=>{if(failCommit){tx.error=Error('disk full before commit');tx.onabort?.();}else{for(const value of pending)records.set(value.id,clone(value));tx.oncomplete?.();}});});return r;},
      add(value){pending.push(clone(value));return {};}
    };
    tx.objectStore=()=>objects;return tx;
  }};
  return {records,open(){const r={};queueMicrotask(()=>{r.result=db;r.onsuccess?.();});return r;}};
}
function isolatedCampus(st,idb){
  const context={CampusDataset:D,WaterOperations:global.WaterOperations,WaterHydraulics:{simulate(){},liveRun(){},defaults(){return {};}},WaterV2:{timeSeries(){},seed(){}},localStorage:st,indexedDB:idb};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../campus-project.js'),'utf8'),context);
  return context.CampusProject;
}

test('durable migration works with only 60k characters free and archive references survive a fresh page context',async()=>{
  const {st,old,catalog}=oldSavedProject(),idb=archiveDatabase(),limit=5242880;
  const size=()=>[...st.entries].reduce((sum,[k,v])=>sum+k.length+v.length,0);
  st.setItem('unrelated-existing-data','x'.repeat(limit-size()-60000-'unrelated-existing-data'.length));
  const original=[...st.entries],write=st.setItem;
  st.setItem=(k,v)=>{if(size()+k.length+v.length-(st.entries.has(k)?k.length+st.getItem(k).length:0)>limit)throw Error('quota full');write(k,v);};
  const project=isolatedCampus(st,idb);await project.prepareStorage(st,idb);
  assert.deepEqual([...st.entries],original,'preparation must not touch localStorage');
  assert.equal(idb.records.size,1);const record=[...idb.records.values()][0];
  assert.deepEqual(record.snapshot,old);assert.deepEqual(record.catalog,catalog);
  assert.equal(project.initialize(st),true);assert.ok(size()<limit);
  const archiveId=D.topologyId+'-before-'+D.snapshot.metadata.topologyRevision;
  const raw=st.getItem('water-editor:'+D.projectId+':'+archiveId);
  assert.ok(raw.length<400);assert.deepEqual(clone(project.decodeSnapshot(raw)),old);
  assert.equal(st.getItem('unrelated-existing-data'),original.find(([k])=>k==='unrelated-existing-data')[1]);
  const reloaded=isolatedCampus(st,idb);await reloaded.prepareStorage(st,idb);
  assert.deepEqual(clone(reloaded.decodeSnapshot(raw)),old);assert.equal(reloaded.initialize(st),false);
});

test('a durable backup transaction abort leaves all existing localStorage unchanged',async()=>{
  const {st}=oldSavedProject(),before=[...st.entries],idb=archiveDatabase(true),project=isolatedCampus(st,idb);
  await assert.rejects(project.prepareStorage(st,idb),/disk full before commit/);
  assert.equal(idb.records.size,0);assert.equal(project.initialize(st),false);assert.deepEqual([...st.entries],before);
});
