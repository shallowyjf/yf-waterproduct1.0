const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../data/campus-dataset.js');
const originalDataset=JSON.stringify(D);
const C=require('../campus-metering.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const milli=value=>Math.round(value*1000);
const sum=values=>values.reduce((total,value)=>total+milli(value),0);
const keys={store:'water-topology-store:'+C.projectId,devices:'water-devices:'+C.projectId,standard:'water-standard:'+C.projectId,marker:'water-campus-metering:'+C.projectId};
// These expected locations were independently checked against the installation
// atlas (20261026), rather than copied from the module's exported site list.
const sites={K1:'JS643',K2:'JS258',M1:'JS54',M2:'JS238',M3:'19',M4:'21',M5:'JS70',M6:'7',M7:'27',M8:'28'};
const dormHosts=['22','JS625','JS42','JS615','JS608','JS612'];
const dormPipes=['CAMPUS-P-27','CAMPUS-P-L046','CAMPUS-P-L048','CAMPUS-P-L121','CAMPUS-P-L125','CAMPUS-P-L128'];
function storage(initial={}){
  const entries=new Map(Object.entries(initial));
  return {entries,getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key)};
}
function readyStorage(extra={}){
  return storage({[keys.store]:JSON.stringify({versions:[{id:C.topologyId,snapshot:clone(D.snapshot)}],bindings:[],bindingHistory:[{id:'existing-history'}]}),...extra});
}
function read(store,key){return JSON.parse(store.getItem(key));}

test('the plan contains 30 secondary instruments, 6 tertiary meters and 60 user meters with valid PDF hosts',()=>{
  const {devices}=C.seed();
  assert.equal(devices.length,96);
  assert.equal(new Set(devices.map(d=>d.id)).size,96);
  assert.equal(devices.filter(d=>d.id.startsWith('CAMPUS-L2-')).length,30);
  assert.equal(devices.filter(d=>d.id.startsWith('CAMPUS-L3-')).length,6);
  assert.equal(devices.filter(d=>d.businessUserId).length,60);
  assert.deepEqual(devices.reduce((counts,d)=>(counts[d.type]=(counts[d.type]||0)+1,counts),{}),{flow:16,pressure:10,noise:10,waterMeter:60});
  for(const [site,hostId]of Object.entries(sites))for(const [suffix,type]of [['F','flow'],['P','pressure'],['N','noise']]){
    const device=devices.find(d=>d.id===`CAMPUS-L2-${site}-${suffix}`);
    assert.equal(device.hostId,hostId,site);
    assert.equal(device.plannedHostId,hostId);
    assert.equal(device.type,type);
    assert.equal(device.topologyId,C.topologyId);
    assert.ok(D.snapshot.nodes.some(n=>n.id===hostId));
    assert.equal(device.installationStatus,'预设待安装');
    assert.equal(device.demo,true);
    assert.match(device.source,/非实测/);
  }
  for(const device of devices.filter(d=>d.installationPlanId==='M8')){
    assert.equal(device.plannedPipeId,'CAMPUS-P-40');
    assert.match(device.remark,/待确认/);
  }
  assert.match(devices.find(d=>d.id==='CAMPUS-L2-K2-F').remark,/待选/);
  const pipe=D.snapshot.pipes.find(p=>p.id==='CAMPUS-P-40');
  assert.deepEqual([pipe.start,pipe.end],['JS641','28']);
  assert.equal(D.snapshot.nodes.some(n=>n.id==='CAMPUS-P-40'),false);
  dormHosts.forEach((hostId,index)=>{
    assert.equal(D.snapshot.nodes.find(n=>n.id===hostId).name,'宿舍'+(index+1));
    const incoming=D.snapshot.pipes.filter(p=>p.start===hostId||p.end===hostId);
    assert.equal(incoming.length,1);
    assert.equal(incoming[0].id,dormPipes[index]);
    assert.equal(devices.find(d=>d.id===`CAMPUS-L3-D${index+1}-F`).hostId,hostId);
  });
});

test('36 unique topology bindings include only parent instruments, never the 60 business submeters',()=>{
  const {devices,bindings}=C.seed(),byId=new Map(devices.map(d=>[d.id,d]));
  assert.equal(bindings.length,36);
  assert.equal(new Set(bindings.map(b=>b.key)).size,36);
  const assigned=bindings.flatMap(b=>b.devices);
  assert.equal(new Set(assigned).size,36);
  for(const binding of bindings){
    assert.equal(binding.devices.length,1);
    const device=byId.get(binding.devices[0]);
    assert.ok(device);
    assert.equal(device.businessUserId,undefined);
    assert.equal(binding.key,[C.topologyId,device.hostId,device.metric].join('|'));
    assert.equal(binding.rule,device.metric==='flow'?'sum':'average');
  }
  for(const hostId of dormHosts){
    const flow=bindings.filter(b=>b.key===[C.topologyId,hostId,'flow'].join('|'));
    assert.equal(flow.length,1);
    assert.match(flow[0].devices[0],/^CAMPUS-L3-/);
  }
});

test('each dorm has one tertiary parent and 10 distinct user meters without changing topology nodes',()=>{
  const {devices}=C.seed(),allUsers=[];
  dormHosts.forEach((hostId,index)=>{
    const hierarchy=C.hierarchy(hostId),parentId=`CAMPUS-L3-D${index+1}-F`;
    assert.equal(hierarchy.totalMeterId,parentId);
    assert.equal(hierarchy.children.length,10);
    assert.equal(hierarchy.meters.length,11);
    assert.equal(new Set(hierarchy.meters.map(m=>m.id)).size,11);
    assert.equal(hierarchy.seedRevision,C.revision);
    for(const child of hierarchy.children){
      const meter=devices.find(d=>d.id===child.meterId);
      assert.equal(meter.businessUserId,child.id);
      assert.equal(meter.hostId,hostId);
      assert.equal(meter.parentDeviceId,parentId);
      assert.ok(hierarchy.meters.some(m=>m.id===child.meterId));
      allUsers.push(child.id);
    }
    const total=devices.find(d=>d.id===parentId);
    for(let day=0;day<total.daily.length;day++){
      const children=devices.filter(d=>d.parentDeviceId===parentId);
      assert.ok(milli(total.daily[day].volume)>sum(children.map(d=>d.daily[day].volume)));
    }
    hierarchy.children[0].name='用户自行编辑';
    hierarchy.meters[0].daily[0].volume=-1;
    assert.notEqual(C.hierarchy(hostId).children[0].name,'用户自行编辑');
    assert.ok(C.hierarchy(hostId).meters[0].daily[0].volume>0);
  });
  assert.equal(new Set(allUsers).size,60);
  assert.equal(C.hierarchy('JS643'),null);
  assert.equal(JSON.stringify(D),originalDataset);
});

test('daily totals reconcile with cumulative meter readings and the final live sample',()=>{
  const {devices}=C.seed();
  for(const device of devices.filter(d=>d.metric==='flow')){
    assert.equal(device.daily.length,118);
    assert.equal(device.daily[0].date,'2026-07-01');
    assert.equal(device.daily.at(-1).date,'2026-10-26');
    assert.equal(new Set(device.daily.map(r=>r.date)).size,118);
    for(let i=1;i<device.daily.length;i++)assert.equal(milli(device.daily[i].total)-milli(device.daily[i-1].total),milli(device.daily[i].volume),device.id);
    for(const sample of device.samples.filter(s=>s.metric==='volume'&&s.time.endsWith('00:00:00'))){
      const day=device.daily.find(d=>d.date===sample.time.slice(0,10));
      assert.equal(milli(sample.value),milli(day.total)-milli(day.volume));
    }
    const last=device.samples.filter(s=>s.metric==='volume').at(-1);
    assert.equal(last.time,'2026-10-26 23:59:59');
    assert.equal(last.value,device.daily.at(-1).total);
    assert.equal(device.sampleTime,'2026-10-26 23:59:59');
    assert.ok(device.samples.every(s=>Number.isFinite(s.value)&&s.quality==='GOOD'));
  }
});

test('DMA daily and monthly billed volumes equal their 30 user meters, and upper meters preserve daily conservation',()=>{
  const {devices,standard}=C.seed(),byId=new Map(devices.map(d=>[d.id,d]));
  assert.equal(standard.balances.length,4*118);
  assert.equal(standard.revenueRecords.length,6);
  const volume=(id,date)=>milli(byId.get(id).daily.find(r=>r.date===date).volume);
  for(const row of standard.balances){
    if(['DMA-02','DMA-04'].includes(row.zoneId)){
      const hosts=row.zoneId==='DMA-02'?dormHosts.slice(0,3):dormHosts.slice(3);
      const users=devices.filter(d=>d.businessUserId&&hosts.includes(d.hostId));
      assert.equal(users.length,30);
      assert.equal(milli(row.billed),users.reduce((total,d)=>total+volume(d.id,row.date),0));
    }else assert.equal(row.billed,null);
    assert.ok(row.inlet-row.outlet>=0);
  }
  for(const row of standard.revenueRecords){
    const hosts=row.zoneId==='DMA-02'?dormHosts.slice(0,3):dormHosts.slice(3);
    const users=devices.filter(d=>d.businessUserId&&hosts.includes(d.hostId));
    assert.equal(milli(row.volume),users.reduce((total,d)=>total+sum(d.daily.filter(r=>r.date.startsWith(row.month)).map(r=>r.volume)),0));
    assert.equal(row.meterCount,30);
    assert.equal(row.expectedMeterCount,30);
  }
  for(const {date}of byId.get('CAMPUS-L2-K1-F').daily){
    assert.equal(volume('CAMPUS-L2-K1-F',date),volume('CAMPUS-L2-K2-F',date)+volume('CAMPUS-L2-M8-F',date)+4000);
    assert.equal(volume('CAMPUS-L2-M2-F',date),volume('CAMPUS-L2-M4-F',date)+volume('CAMPUS-L2-M3-F',date)+1000);
    assert.equal(volume('CAMPUS-L2-M4-F',date),[1,2,3].reduce((total,n)=>total+volume(`CAMPUS-L3-D${n}-F`,date),1000));
    const dma4=standard.balances.find(r=>r.date===date&&r.zoneId==='DMA-04');
    const dma3=standard.balances.find(r=>r.date===date&&r.zoneId==='DMA-03');
    assert.equal(milli(dma4.inlet),[4,5,6].reduce((total,n)=>total+volume(`CAMPUS-L3-D${n}-F`,date),0));
    assert.equal(dma3.outlet,dma4.inlet);
  }
});

test('hourly observations sum exactly to daily inlets and outlets and enrich only once',()=>{
  const db=C.seed().standard;
  assert.equal(C.enrichDb(db),db);
  assert.equal(db.hourlyBalances.length,4*118*24);
  const byDay=new Map();
  for(const row of db.hourlyBalances){
    const key=[row.zoneId,row.time.slice(0,10)].join('|');
    if(!byDay.has(key))byDay.set(key,[]);
    byDay.get(key).push(row);
  }
  for(const row of db.balances){
    const hours=byDay.get([row.zoneId,row.date].join('|'));
    assert.equal(hours.length,24);
    assert.equal(new Set(hours.map(h=>h.time)).size,24);
    assert.equal(sum(hours.map(h=>h.inlet)),milli(row.inlet));
    assert.equal(sum(hours.map(h=>h.outlet)),milli(row.outlet));
    for(const sample of row.nightSamples){
      const hour=hours.find(h=>h.time===sample.time);
      assert.equal(milli(sample.value),milli(hour.inlet)-milli(hour.outlet));
    }
  }
  const once=JSON.stringify(db);
  C.enrichDb(db);
  assert.equal(JSON.stringify(db),once);
  assert.deepEqual(C.enrichDb({balances:[]}),{balances:[]});
});

test('hourly enrichment preserves user observations and does not recreate fabricated hours for changed daily totals',()=>{
  const db=C.seed().standard;
  C.enrichDb(db);
  const edited=db.balances[0];edited.inlet+=1;
  const customDay=db.balances[1];
  const custom={topology:C.topologyId,zoneId:customDay.zoneId,time:customDay.date+' 00:00:00',inlet:123,outlet:2,source:'现场导入',quality:'GOOD'};
  db.hourlyBalances.push(custom);
  C.enrichDb(db);
  assert.equal(db.hourlyBalances.filter(h=>h.zoneId===edited.zoneId&&h.time.startsWith(edited.date)).length,0);
  assert.deepEqual(db.hourlyBalances.filter(h=>h.zoneId===customDay.zoneId&&h.time.startsWith(customDay.date)),[custom]);
  const again=JSON.stringify(db);C.enrichDb(db);assert.equal(JSON.stringify(db),again);
});

test('initialization requires the current topology and is byte-for-byte idempotent after user edits',()=>{
  for(const store of [storage(),storage({[keys.store]:JSON.stringify({versions:[{id:'unrelated-topology'}]})})]){
    const before=[...store.entries];assert.equal(C.initialize(store),false);assert.deepEqual([...store.entries],before);
  }
  const store=readyStorage();
  const before=read(store,keys.store);
  store.setItem('water-topology:'+C.projectId,JSON.stringify(D.snapshot));
  const originalTopology=store.getItem('water-topology:'+C.projectId);
  assert.equal(C.initialize(store),true);
  assert.equal(read(store,keys.devices).length,96);
  assert.equal(read(store,keys.store).bindings.length,36);
  assert.deepEqual(read(store,keys.store).versions,before.versions);
  assert.deepEqual(read(store,keys.store).bindingHistory,before.bindingHistory);
  assert.equal(store.getItem('water-topology:'+C.projectId),originalTopology);
  const devices=read(store,keys.devices);devices[0].name='现场自定义名称';devices[0].value=9.876;
  store.setItem(keys.devices,JSON.stringify(devices));
  const after=[...store.entries];
  assert.equal(C.initialize(store),false);
  assert.deepEqual([...store.entries],after);
  assert.equal(C.device(devices[0].id,store).name,'现场自定义名称');
  assert.equal(JSON.stringify(D),originalDataset);
});

test('initialization merges missing fixtures while preserving existing devices, bindings and analysis rows',()=>{
  const seed=C.seed(),customDevice={...seed.devices[0],name:'用户改名',value:42};
  const customBinding={...seed.bindings[0],devices:['existing-sensor'],revision:6};
  const customBalance={...seed.standard.balances[0],inlet:999,source:'现场数据'};
  const customRevenue={...seed.standard.revenueRecords[0],volume:888,source:'现场营收'};
  const store=readyStorage({[keys.devices]:JSON.stringify([customDevice]),[keys.standard]:JSON.stringify({balances:[customBalance],revenueRecords:[customRevenue],reports:[{id:'saved-report'}],rule:{threshold:8}})});
  const topology=read(store,keys.store);topology.bindings=[customBinding];store.setItem(keys.store,JSON.stringify(topology));
  assert.equal(C.initialize(store),true);
  const devices=read(store,keys.devices),standard=read(store,keys.standard),actual=read(store,keys.store);
  assert.equal(devices.length,96);
  assert.deepEqual(devices[0],customDevice);
  assert.equal(actual.bindings.length,36);
  assert.deepEqual(actual.bindings[0],customBinding);
  assert.equal(standard.balances.length,472);
  assert.deepEqual(standard.balances[0],customBalance);
  assert.deepEqual(standard.revenueRecords[0],customRevenue);
  assert.deepEqual(standard.reports,[{id:'saved-report'}]);
  assert.deepEqual(standard.rule,{threshold:8});
  // A user-owned device without a binding must not be rebound implicitly.
  const unbound=readyStorage({[keys.devices]:JSON.stringify([customDevice])});
  C.initialize(unbound);
  assert.equal(read(unbound,keys.store).bindings.some(b=>b.key===customBinding.key),false);
});

test('failed writes roll back every prior write, including absent keys and the revision marker',()=>{
  for(const failAt of [1,2,3,4])for(const hasExisting of [false,true]){
    const store=readyStorage(hasExisting?{[keys.devices]:JSON.stringify([{id:'custom-device'}]),[keys.standard]:JSON.stringify({balances:[],revenueRecords:[],reports:[{id:'existing'}]})}:{});
    const before=[...store.entries],write=store.setItem;
    let writes=0;
    store.setItem=(key,value)=>{if(++writes===failAt)throw Object.assign(new Error('storage quota exceeded'),{name:'QuotaExceededError'});write(key,value);};
    assert.throws(()=>C.initialize(store),/storage quota exceeded/);
    assert.deepEqual([...store.entries],before,`failed write ${failAt}, prior data ${hasExisting}`);
    assert.equal(store.getItem(keys.marker),null);
  }
  const malformed=readyStorage({[keys.devices]:'not valid json'}),before=[...malformed.entries];
  assert.throws(()=>C.initialize(malformed));
  assert.deepEqual([...malformed.entries],before);
});

test('persisted seed data remains within a 3.2 MiB incremental UTF-16 budget and does not store generated hourly rows',t=>{
  const store=readyStorage(),before=new Map(store.entries);
  assert.equal(C.initialize(store),true);
  const utf16Size=entries=>[...entries].reduce((total,[key,value])=>total+2*(key.length+value.length),0);
  const incrementalBytes=utf16Size(store.entries)-utf16Size(before);
  assert.ok(incrementalBytes<3.2*1024*1024,`added ${incrementalBytes} UTF-16 bytes`);
  assert.equal(read(store,keys.standard).hourlyBalances,undefined);
  const persisted=store.getItem(keys.standard),db=read(store,keys.standard);
  C.enrichDb(db);
  assert.equal(store.getItem(keys.standard),persisted);
  t.diagnostic(`Incremental localStorage estimate: ${incrementalBytes.toLocaleString('en-US')} UTF-16 bytes (${(incrementalBytes/1024/1024).toFixed(2)} MiB); hourly rows are computed in memory.`);
});
