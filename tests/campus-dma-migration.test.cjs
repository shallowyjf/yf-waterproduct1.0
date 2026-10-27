const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const D=require('../data/campus-dataset.js');
const script=fs.readFileSync(path.join(__dirname,'../campus-project.js'),'utf8');
const clone=v=>JSON.parse(JSON.stringify(v));
const dataKey='water-editor:'+D.projectId+':'+D.topologyId;
const catalogKey='water-topology-store:'+D.projectId;
const dmaBackupKey='water-campus-dma-backup:'+D.projectId+':'+D.topologyId+':before-'+D.snapshot.metadata.dmaLayoutRevision;

function storage(){
  const entries=new Map();
  return {entries,getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
}
function database(failCommit=false){
  const records=new Map();
  const db={createObjectStore(){},close(){},transaction(name,mode){
    const tx={},pending=[];
    const objects={
      getAll(){const r={};queueMicrotask(()=>{r.result=[...records.values()].map(clone);r.onsuccess?.();});return r;},
      get(id){const r={};queueMicrotask(()=>{
        r.result=records.has(id)?clone(records.get(id)):undefined;r.onsuccess?.();
        if(mode==='readwrite')queueMicrotask(()=>{
          if(failCommit){tx.error=Error('archive commit failed');tx.onabort?.();}
          else{for(const record of pending)records.set(record.id,clone(record));tx.oncomplete?.();}
        });
      });return r;},
      add(record){pending.push(clone(record));return {};}
    };
    tx.objectStore=()=>objects;return tx;
  }};
  return {records,open(){const r={};queueMicrotask(()=>{r.result=db;r.onsuccess?.();});return r;}};
}
function project(st,idb){
  const context={CampusDataset:D,localStorage:st,indexedDB:idb,
    WaterOperations:{empty:()=>({orders:[],alarms:[]})},
    WaterHydraulics:{simulate(){},liveRun(){},defaults(){return {};}},
    WaterV2:{timeSeries(){},seed(){}}};
  vm.runInNewContext(script,context);return context.CampusProject;
}
function latestBeforeDMA(){
  const st=storage(),p=project(st),snapshot=clone(D.snapshot);
  snapshot.zones=[];
  for(const key of Object.keys(snapshot.metadata))if(key.startsWith('dma')||key.startsWith('boundary'))delete snapshot.metadata[key];
  Object.assign(snapshot.metadata,{dmaStatus:'最新拓扑的DMA分区待复核',sharedNodeIds:snapshot.nodes.map(n=>n.id),sharedPipeIds:snapshot.pipes.map(n=>n.id),boundaryMeterPlans:[],monitoringPlan:[],userField:'保留现场备注'});
  snapshot.nodes[0].name='用户现场改名';snapshot.pipes[0].roughness=111;
  const catalog=clone(p.store());
  catalog.dmaPlans[D.topologyId]={activeId:'USER-ACTIVE',items:[
    {id:'CAMPUS-DMA-PLAN-1',name:'更新前空分区',zones:[],created:'2026-10-26'},
    {id:'USER-ACTIVE',name:'现场自定义方案',zones:[],userNote:'不能覆盖',created:'2026-10-26'},
    {id:'USER-DRAFT',name:'另一份草案',zones:[],userNote:'保留草案',created:'2026-10-26'}
  ]};
  catalog.bindings=[{key:D.topologyId+'|JS54|flow',devices:['REAL-1']}];
  catalog.dmaPlans['OTHER-VERSION']={activeId:'OTHER',items:[{id:'OTHER',name:'另一个拓扑的方案',zones:[]}]};
  st.setItem(dataKey,JSON.stringify(snapshot));st.setItem(catalogKey,JSON.stringify(catalog));
  st.setItem('water-devices:'+D.projectId,JSON.stringify([{id:'REAL-1',name:'现场设备'}]));
  st.setItem('water-operations:v1:'+D.projectId,JSON.stringify({orders:[{id:'ORDER-1'}],seeded:true}));
  st.setItem('other-project','untouched');
  return {st,snapshot,catalog,p};
}

test('DMA revision updates only the layout and metadata, preserving edited topology and all existing plans',()=>{
  assert.equal(D.snapshot.zones.length,4,'this migration ships with the four-DMA dataset');
  const {st,snapshot,catalog,p}=latestBeforeDMA();
  const other=[...st.entries].filter(([key])=>key!==dataKey&&key!==catalogKey);
  assert.equal(p.initialize(st),true);
  const next=JSON.parse(st.getItem(dataKey)),current=JSON.parse(st.getItem(catalogKey));
  assert.deepEqual(next.nodes,snapshot.nodes);assert.deepEqual(next.pipes,snapshot.pipes);
  assert.deepEqual(next.provenance,snapshot.provenance);assert.equal(next.sampleRevision,snapshot.sampleRevision);
  assert.equal(next.metadata.topologyRevision,snapshot.metadata.topologyRevision);
  assert.equal(next.metadata.userField,'保留现场备注');assert.deepEqual(next.zones,D.snapshot.zones);
  assert.equal(next.metadata.dmaLayoutRevision,D.snapshot.metadata.dmaLayoutRevision);
  assert.deepEqual(next.metadata.monitoringPlan,[]);assert.deepEqual(next.metadata.boundaryMeterPlans,[]);
  const bucket=current.dmaPlans[D.topologyId];
  for(const plan of catalog.dmaPlans[D.topologyId].items)assert.deepEqual(bucket.items.find(item=>item.id===plan.id),plan);
  assert.equal(bucket.items.length,4);assert.deepEqual(bucket.items.find(item=>item.id===bucket.activeId).zones,D.snapshot.zones);
  assert.deepEqual(current.bindings,catalog.bindings);assert.deepEqual(current.epochs,catalog.epochs);
  assert.deepEqual(current.versions,catalog.versions);assert.deepEqual(current.dmaPlans['OTHER-VERSION'],catalog.dmaPlans['OTHER-VERSION']);
  for(const [key,value] of other)assert.equal(st.getItem(key),value,key);
  const backup=JSON.parse(st.getItem(dmaBackupKey));
  assert.equal(backup.kind,'dma-layout');assert.deepEqual(backup.zones,snapshot.zones);
  assert.deepEqual(backup.metadata,snapshot.metadata);assert.deepEqual(backup.planBucket,catalog.dmaPlans[D.topologyId]);
  assert.equal(backup.snapshot,undefined,'DMA-only backup must not duplicate the topology');
  assert.equal([...st.entries.keys()].some(k=>k.startsWith('water-campus-backup:')),false);
});

test('layout migration is idempotent and leaves later user layout changes intact',()=>{
  const {st,p}=latestBeforeDMA();p.initialize(st);
  const data=JSON.parse(st.getItem(dataKey)),catalog=JSON.parse(st.getItem(catalogKey));
  data.zones[0].name='用户后续修改区名';data.metadata.userField='后续备注';
  catalog.dmaPlans[D.topologyId].items.find(item=>item.id===catalog.dmaPlans[D.topologyId].activeId).name='用户后续方案名';
  st.setItem(dataKey,JSON.stringify(data));st.setItem(catalogKey,JSON.stringify(catalog));
  const before=[...st.entries];assert.equal(p.initialize(st),false);assert.deepEqual([...st.entries],before);
});

test('DMA backup uses IndexedDB with 150k characters free and survives a fresh page context',async()=>{
  const {st,snapshot,catalog}=latestBeforeDMA(),idb=database(),limit=5242880;
  const size=()=>[...st.entries].reduce((n,[k,v])=>n+k.length+v.length,0);
  st.setItem('existing-unrelated-data','x'.repeat(limit-size()-150000-'existing-unrelated-data'.length));
  const original=[...st.entries],write=st.setItem;
  st.setItem=(k,v)=>{if(size()+k.length+v.length-(st.entries.has(k)?k.length+st.getItem(k).length:0)>limit)throw Error('quota full');write(k,v);};
  const p=project(st,idb);await p.prepareStorage(st,idb);
  assert.deepEqual([...st.entries],original);assert.equal(idb.records.size,1);
  const backup=idb.records.get(dmaBackupKey);
  assert.deepEqual(backup.zones,snapshot.zones);assert.deepEqual(backup.metadata,snapshot.metadata);
  assert.deepEqual(backup.planBucket,catalog.dmaPlans[D.topologyId]);assert.equal(backup.snapshot,undefined);
  assert.equal(p.initialize(st),true);assert.ok(size()<limit);
  assert.ok(st.getItem(dmaBackupKey).length<400);
  assert.equal(st.getItem('existing-unrelated-data'),original.find(([k])=>k==='existing-unrelated-data')[1]);
  const after=[...st.entries],reloaded=project(st,idb);await reloaded.prepareStorage(st,idb);
  assert.equal(reloaded.initialize(st),false);assert.deepEqual([...st.entries],after);assert.equal(idb.records.size,1);
});

test('failed DMA archive commit leaves the old layout and all localStorage values untouched',async()=>{
  const {st}=latestBeforeDMA(),before=[...st.entries],idb=database(true),p=project(st,idb);
  await assert.rejects(p.prepareStorage(st,idb),/archive commit failed/);
  assert.equal(p.initialize(st),false);assert.equal(idb.records.size,0);assert.deepEqual([...st.entries],before);
});

test('failed layout activation rolls back without losing its committed backup and can retry',async()=>{
  const {st}=latestBeforeDMA(),idb=database(),p=project(st,idb);await p.prepareStorage(st,idb);
  const before=[...st.entries],write=st.setItem;let calls=0;
  st.setItem=(k,v)=>{if(++calls===2)throw Error('quota full');write(k,v);};
  assert.throws(()=>p.initialize(st),/quota full/);assert.deepEqual([...st.entries],before);
  assert.equal(idb.records.size,1);const backup=clone(idb.records.get(dmaBackupKey));
  st.setItem=write;assert.equal(p.initialize(st),true);assert.deepEqual(idb.records.get(dmaBackupKey),backup);
});

test('a pre-NET historical topology is backed up once and receives the current four-DMA snapshot',async()=>{
  const {st,catalog}=latestBeforeDMA();
  const old=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/archives/campus-before-20261026/campus-topology.json'),'utf8'));
  catalog.dmaPlans[D.topologyId].items[1].zones=clone(old.zones);
  st.setItem(dataKey,JSON.stringify(old));st.setItem(catalogKey,JSON.stringify(catalog));
  const idb=database(),p=project(st,idb);await p.prepareStorage(st,idb);assert.equal(p.initialize(st),true);
  assert.deepEqual(JSON.parse(st.getItem(dataKey)),D.snapshot);
  assert.equal(idb.records.size,1);assert.deepEqual([...idb.records.values()][0].snapshot,old);
  assert.equal(st.getItem(dmaBackupKey),null,'full replacement already contains the old layout backup');
  const current=JSON.parse(st.getItem(catalogKey)),bucket=current.dmaPlans[D.topologyId];
  assert.deepEqual(bucket.items.find(item=>item.id===bucket.activeId).zones,D.snapshot.zones);
  const archiveId=D.topologyId+'-before-'+D.snapshot.metadata.topologyRevision;
  assert.deepEqual(current.dmaPlans[archiveId],catalog.dmaPlans[D.topologyId]);
  assert.equal(p.initialize(st),false);
});

test('the DMA map overview renders the actual user scope and inlet/outlet boundary fields',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
  const start=app.indexOf('  function p02DmaDrawerContent(dma) {');
  const end=app.indexOf('\n  function p02ObjectDrawerContent',start);
  assert.ok(start>=0&&end>start);
  const context={window:{DMAStatistics:{days:()=>31}},state:{p02DrawerTab:'basic'},
    dmaMetadataEditable:()=>false,dmaSelectedMonth:()=> '2026-10',
    dmaQuantity:value=>value==null?'—':String(value),
    dmaDeviceSummary:()=>({count:0,pressureCount:0,pressureTotal:0}),
    escapeHtml:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    findDma:id=>D.snapshot.zones.find(z=>z.id===id),dmaDemoEnabled:()=>false};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../topology-map-data.js'),'utf8'),context);
  const render=vm.runInNewContext('('+app.slice(start,end).trim()+')',context);
  const renderedField=(label,value)=>`<div class="app-description-label">${label}</div><div class="app-description-value">${value}</div>`;
  for(const zone of D.snapshot.zones){
    const html=render(zone);
    assert.ok(html.includes(renderedField('范围说明',zone.note)),zone.id+' scope');
    assert.ok(html.includes(renderedField('起点节点',zone.inletNodeIds.join('、'))),zone.id+' inlet');
    assert.ok(html.indexOf('范围说明')<html.indexOf('product-dma-kpis'),'scope is visible before monitoring values');
  }
  assert.ok(render(D.snapshot.zones.find(z=>z.id==='DMA-03')).includes(renderedField('出口交界节点','1')));
  assert.ok(render(D.snapshot.zones.find(z=>z.id==='DMA-04')).includes(renderedField('共用边界节点','1')));
  assert.ok(!render({...D.snapshot.zones[0],definitionSource:undefined}).includes('范围说明'),'legacy zones keep their existing overview');
  context.state.p02DrawerTab='metrics';
  assert.ok(!render(D.snapshot.zones[0]).includes('范围说明'),'metering detail retains its separate content');
});
