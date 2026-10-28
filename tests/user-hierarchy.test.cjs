const {test}=require('node:test');
const assert=require('node:assert/strict');
const U=require('../user-hierarchy.js');
const D=require('../data/campus-dataset.js');
test('six floor business users do not change the imported topology',()=>{const before=JSON.stringify(D.snapshot);const d=U.seed(D.id,'22');assert.equal(d.children.length,6);assert.equal(new Set(d.children.map(c=>c.meterId)).size,6);assert.equal(JSON.stringify(D.snapshot),before);assert.equal(U.seed('other-city','22').children.length,0);});
test('water volume is additive by day, total and submeters stay separate',()=>{const d=U.seed(D.id,'22'),m=d.meters[1];assert.equal(U.volume(m,'2026-10-01','2026-10-02'),+(U.volume(m,'2026-10-01','2026-10-01')+U.volume(m,'2026-10-02','2026-10-02')).toFixed(3));assert.equal(U.volume(null,'2026-10-01','2026-10-02'),null);assert.throws(()=>U.days('2026-10-07','2026-10-01'));assert.throws(()=>U.days('2026-01-01','2026-12-31'));});
test('new floor remains unbound and duplicate meter assignment is rejected',()=>{const d=U.seed(D.id,'22');U.addChild(d,'7层',7);assert.equal(d.children[6].meterId,null);assert.throws(()=>U.addChild(d,'重复7层',7));assert.throws(()=>U.bind(d,d.children[6].id,d.totalMeterId));assert.throws(()=>U.bind(d,d.children[6].id,d.children[0].meterId));const m=d.children[0].meterId;U.bind(d,d.children[0].id,'');U.bind(d,d.children[6].id,m);assert.equal(d.children[6].meterId,m);});

test('each floor has separate meter and pressure readings; cumulative deltas match period usage',()=>{const d=U.enrich(U.seed(D.id,'22')),c=d.children[0],v=U.readings(d,c,'2026-10-01','2026-10-07');assert.ok(v.flow>0);assert.ok(v.pressure>0);assert.ok(v.total>v.volume);assert.equal(+(v.total-U.cumulative(d.meters[1],'2026-09-30')).toFixed(3),v.volume);U.bindPressure(d,c.id,'');assert.equal(U.readings(d,c,'2026-10-01','2026-10-07').pressure,null);assert.throws(()=>U.bindPressure(d,c.id,d.children[1].pressureId));});
test('asset management and monitoring have separate responsibilities',()=>{const data={businessProjectId:'floor-test',sourceDataset:D.id,nodes:[{id:'22',type:'user',name:'宿舍1'}]};const a=U.render(data,'22','assets'),m=U.render(data,'22','monitor');assert.match(a,/直属子用户/);assert.match(a,/6个子用户/);assert.match(a,/新增楼层子用户/);assert.doesNotMatch(a,/累计量示值/);assert.match(m,/累计量示值/);assert.match(m,/压力 \/ MPa/);assert.match(m,/开始日期/);assert.doesNotMatch(m,/新增楼层子用户|保存设备挂接/);});
test('hydrants never gain floor management and user data is project scoped',()=>{assert.equal(U.render({nodes:[{id:'H',type:'user',userSubtype:'fire_hydrant'}]},'H'),'');const a={businessProjectId:'A',nodes:[{id:'22',type:'user'}]},b={...a,businessProjectId:'B'};assert.match(U.render(a,'22'),/data-floor-source="A\|standard"/);assert.match(U.render(b,'22'),/data-floor-source="B\|standard"/);});

const fs=require('node:fs'),vm=require('node:vm'),C=require('../campus-metering.js');
const source=fs.readFileSync(require.resolve('../user-hierarchy.js'),'utf8');
const hostIds=['22','JS625','JS42','JS615','JS608','JS612'];
const project={businessProjectId:'PRJ-SH-CAMPUS',sourceDataset:D.id,nodes:hostIds.map((id,i)=>({id,type:'user',name:'宿舍'+(i+1)}))};
const configKey='water-user-hierarchy:v1:PRJ-SH-CAMPUS|sh-campus-20261013:22';
function harness(initial={},options={}){
  const saved=new Map(Object.entries(initial)),handlers={};
  const storage={getItem:k=>saved.get(k)??null,setItem(k,v){if(options.failWrites)throw Error('QuotaExceededError');saved.set(k,String(v));}};
  const context={module:{exports:{}},CampusMetering:C,localStorage:storage,document:{addEventListener:(type,fn)=>{handlers[type]=fn;}},FormData:class{constructor(form){this.values=form.values;}get(name){return this.values[name]??null;}}};
  if(options.WaterTable)context.WaterTable=options.WaterTable;
  vm.runInNewContext(source,context);
  const api=context.module.exports;
  const el={dataset:{floorSource:'PRJ-SH-CAMPUS|sh-campus-20261013',floorRoot:'22',floorName:'宿舍1',floorMode:'monitor'},outerHTML:''};
  function click(action,id){const button={dataset:{floorAction:action,id},closest:()=>el};handlers.click({target:{closest:()=>button},preventDefault(){}});return el.outerHTML;}
  function range(start,end){const form={dataset:{floorForm:'range'},values:{start,end},closest:()=>el};handlers.submit({target:{closest:()=>form},preventDefault(){}});return el.outerHTML;}
  return {api,saved,el,click,range};
}
test('six dorm presets provide sixty business user meters with no invented pressures',()=>{
  const {api}=harness(),users=new Set(),meters=new Set();
  for(const [i,host]of hostIds.entries()){
    const db=api.enrich(api.seed('PRJ-SH-CAMPUS|'+D.id,host));
    assert.equal(db.children.length,10);assert.equal(db.meters.length,11);assert.equal(db.pressures.length,0);assert.equal(db.totalPressureId,null);
    assert.equal(db.totalMeterId,`CAMPUS-L3-D${i+1}-F`);
    db.children.forEach(c=>{users.add(c.id);meters.add(c.meterId);assert.match(c.name,/用户\d{2}/);assert.equal(c.pressureId??null,null);});
  }
  assert.equal(users.size,60);assert.equal(meters.size,60);
  assert.equal(api.seed('another-project|'+D.id,'22').children.length,0);
  assert.equal(api.seed('PRJ-SH-CAMPUS|other-source','22').children.length,0);
  assert.equal(api.seed(D.id,'unknown').children.length,0);
  const a=api.seed(D.id,'22');a.children[0].name='edited';assert.equal(api.seed(D.id,'22').children[0].name,'用户01');
});
test('daily meter readings share source data and never extrapolate outside the sample window',()=>{
  const {api}=harness(),db=api.seed(D.id,'22'),user=db.children[0],meter=db.meters.find(m=>m.id===user.meterId);
  const reading=api.readings(db,user,'2026-10-20','2026-10-26');
  assert.equal(reading.volume,+meter.daily.filter(d=>d.date>='2026-10-20').reduce((sum,d)=>sum+d.volume,0).toFixed(3));
  assert.equal(reading.total,meter.daily.at(-1).total);assert.equal(reading.flow,meter.daily.at(-1).flow);assert.equal(reading.pressure,null);
  assert.equal(+(reading.total-api.cumulative(meter,'2026-10-19')).toFixed(3),reading.volume);
  assert.equal(api.volume(meter,'2026-10-26','2026-10-27'),null);
  assert.equal(api.cumulative(meter,'2026-10-27'),null);
  assert.equal(api.readings(db,user,'2026-10-27','2026-10-27').flow,null);
  assert.equal(api.volume({daily:[]},'2026-10-20','2026-10-26'),null);
  assert.throws(()=>api.days('2026-02-30','2026-03-01'));
});
test('total and user meter analysis does not double count and handles missing readings',()=>{
  const {api}=harness(),db=api.seed(D.id,'JS42'),a=api.analysis(db,'2026-10-20','2026-10-26');
  const expected=+db.children.reduce((sum,c)=>sum+api.volume(db.meters.find(m=>m.id===c.meterId),'2026-10-20','2026-10-26'),0).toFixed(3);
  assert.equal(a.subTotal,expected);assert.equal(a.total,api.volume(db.meters.find(m=>m.id===db.totalMeterId),'2026-10-20','2026-10-26'));
  assert.equal(a.difference,+(a.total-expected).toFixed(3));assert.equal(a.covered,10);assert.ok(a.rate>15);assert.ok(a.notices.some(n=>n.kind==='attention'));assert.equal(a.daily.length,7);
  db.children[1].meterId=db.children[0].meterId;
  const duplicate=api.analysis(db,'2026-10-20','2026-10-26');assert.equal(duplicate.subTotal,null);assert.equal(duplicate.difference,null);assert.equal(duplicate.covered,9);
  assert.equal(api.analysis(db,'2026-10-27','2026-10-27').total,null);
});
test('preset monitor opens latest week, analysis and pagination drill into every user',()=>{
  const h=harness(),html=h.api.render(project,'22','monitor');
  assert.match(html,/value="2026-10-20"/);assert.match(html,/value="2026-10-26"/);assert.match(html,/预设设备 · 示例数据/);assert.match(html,/非实测/);assert.match(html,/10个子用户/);
  assert.doesNotMatch(html,/压力 \/ MPa|新增子用户|保存设备挂接/);
  const a=h.click('analysis');assert.match(a,/总分表差量/);assert.match(a,/每日总分表明细/);assert.match(a,/floor-trend-subTotal/);assert.match(a,/覆盖 10 \/ 10/);
  const next=h.click('next');assert.match(next,/用户10/);assert.doesNotMatch(next,/data-id="CAMPUS-D1-USER01"/);
  const detail=h.click('select','CAMPUS-D1-USER10');assert.match(detail,/用户10 · 每日用水/);assert.match(detail,/返回楼栋总表/);
  const missing=h.range('2026-10-27','2026-10-28');assert.match(missing,/缺失读数/);assert.match(missing,/暂无日用水量数据/);
  const recent=h.click('recent');assert.match(recent,/value="2026-10-20"/);assert.match(recent,/value="2026-10-26"/);
  const assets=h.api.render(project,'22','assets');assert.match(assets,/用户序号不代表楼层/);assert.match(assets,/预设10个用户水表/);assert.doesNotMatch(assets,/总分表差率|累计量示值|压力设备/);
});
test('only unchanged legacy seed is backed up and upgraded; edits and failed backups survive',()=>{
  const old=U.enrich(U.seed(D.id,'22')),raw=JSON.stringify(old);
  const h=harness({[configKey]:raw});assert.match(h.api.render(project,'22','assets'),/10个子用户/);
  assert.equal(h.saved.get(configKey+':before-campus-metering-20261027'),raw);
  assert.equal(JSON.parse(h.saved.get(configKey)).children.length,10);
  assert.equal(JSON.parse(h.saved.get(configKey)).seedRevision,'campus-metering-20261027');
  assert.ok(JSON.parse(h.saved.get(configKey)).meters.every(m=>!m.daily&&!m.samples));
  const manual=JSON.parse(raw);manual.children[0].name='人工维护用户';
  const modifiedRaw=JSON.stringify(manual),manualHarness=harness({[configKey]:modifiedRaw});
  assert.match(manualHarness.api.render(project,'22'),/人工维护用户/);assert.equal(manualHarness.saved.get(configKey),modifiedRaw);assert.equal(manualHarness.saved.size,1);
  const failed=harness({[configKey]:raw},{failWrites:true});assert.match(failed.api.render(project,'22'),/原示例配置保留/);assert.equal(failed.saved.get(configKey),raw);
  assert.equal(h.api.canUpgrade(old,'another-project|'+D.id,'22'),false);
});
test('live registry edits update usage while disabled and removed meters never regain seed readings',()=>{
  const seed=C.hierarchy('22'),devices=seed.meters.map(m=>C.device(m.id)),deviceKey='water-devices:PRJ-SH-CAMPUS';
  const h=harness({[deviceKey]:JSON.stringify(devices)}),db=h.api.seed(D.id,'22'),child=db.children[0];
  const target=devices.find(d=>d.id===child.meterId),last=target.daily.at(-1);
  last.volume=7.25;last.total=8888;last.flow=.302;
  h.saved.set(deviceKey,JSON.stringify(devices));
  const edited=h.api.readings(db,child,'2026-10-26','2026-10-26');
  assert.equal(edited.volume,7.25);assert.equal(edited.total,8888);assert.equal(edited.flow,.302);
  target.status='停用';h.saved.set(deviceKey,JSON.stringify(devices));
  const disabled=h.api.readings(db,child,'2026-10-26','2026-10-26');
  assert.equal(disabled.volume,null);assert.equal(disabled.total,null);assert.equal(disabled.status,'设备停用');
  h.saved.set(deviceKey,JSON.stringify(devices.filter(d=>d.id!==child.meterId)));
  const removed=h.api.readings(db,child,'2026-10-26','2026-10-26');
  assert.equal(removed.volume,null);assert.equal(removed.status,'设备缺失');
  const a=h.api.analysis(db,'2026-10-20','2026-10-26');assert.equal(a.covered,9);assert.equal(a.subTotal,null);assert.equal(a.difference,null);
  assert.match(h.api.render(project,'22','assets'),/设备缺失/);
  const compact=JSON.parse(JSON.stringify(seed));compact.meters.forEach(m=>{delete m.daily;});
  h.saved.set(configKey,JSON.stringify(compact));
  const reloaded=harness(Object.fromEntries(h.saved));
  assert.match(reloaded.api.render(project,'22','monitor'),/10个子用户/);
  assert.equal(reloaded.api.readings(compact,child,'2026-10-26','2026-10-26').volume,null);
});
test('unbinding a preset user meter removes usage and marks total-versus-user analysis incomplete',()=>{
  const {api}=harness(),db=api.seed(D.id,'22'),child=db.children[0];
  assert.ok(api.readings(db,child,'2026-10-20','2026-10-26').volume>0);
  api.bind(db,child.id,'');
  const reading=api.readings(db,child,'2026-10-20','2026-10-26');
  assert.equal(reading.volume,null);assert.equal(reading.total,null);assert.equal(reading.status,'未挂接');
  const a=api.analysis(db,'2026-10-20','2026-10-26');assert.equal(a.covered,9);assert.equal(a.subTotal,null);assert.equal(a.difference,null);assert.equal(a.rate,null);
});

test('unified user and daily tables query the full dataset before pagination',()=>{
  const W=require('../table-component.js'),models=[];const h=harness({}, {WaterTable:{...W,render:model=>{models.push(model);return W.render(model);}}});
  const childKey='PRJ-SH-CAMPUS|sh-campus-20261013|22|monitor|children';W.reset(childKey);
  let html=h.api.render(project,'22','monitor');let children=models.find(m=>m.key===childKey);assert.equal(children.rows.length,10);assert.equal(children.pageSize,5);assert.doesNotMatch(html,/data-floor-action="(?:next|prev|day-next|day-prev)"/);
  W.getState(childKey).query='用户10';html=h.api.render(project,'22','monitor');assert.match(html,/data-id="CAMPUS-D1-USER10"/);assert.doesNotMatch(html,/data-id="CAMPUS-D1-USER01"/);
  h.click('select','CAMPUS-D1-USER10');h.range('2026-10-01','2026-10-26');const daily=models.filter(m=>m.key.endsWith('|daily|CAMPUS-D1-USER10')).at(-1);assert.equal(daily.rows.length,26);assert.equal(daily.pageSize,7);
  W.getState(daily.key).query='2026-10-26';html=h.api.render(project,'22','monitor');assert.match(html,/<td>2026-10-26<\/td>/);assert.equal(W.query(daily.key,daily.rows,daily.columns).length,1);
  W.reset(childKey);W.reset(daily.key);
});
