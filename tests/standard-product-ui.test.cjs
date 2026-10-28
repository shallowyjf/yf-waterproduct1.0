const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const S=require('../standard-product.js'),D=require('../dma-statistics.js');
const source='校园预设示例（非实测）',project='PRJ-SH-CAMPUS';
function setup({devices=[],bindings=[],db={imports:[],reports:[],balances:[],revenueRecords:[],fixtureRange:{start:'2026-07-01',end:'2026-10-26'}},history=false}={}){
  const data=new Map([['water-standard:'+project,JSON.stringify(db)]]),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
  let enriched=0;const exports=[];const XLSX={utils:{book_new:()=>({}),aoa_to_sheet:rows=>{exports.push(rows);return {};},book_append_sheet(){}},writeFile(){}};
  const window={WaterStandard:S,DMAStatistics:D,CampusMetering:{projectId:project,range:{start:'2026-07-01',end:'2026-10-26'},note:id=>id==='DMA-04'?'三个三级总表合计估算':id==='DMA-02'?'仅30个宿舍用户；差额不能全部认定为漏损':'营收水量待抄表',enrichDb(db){enriched++;db.hourlyBalances||=[];db.hourlyBalances.push({source,time:'2026-07-01 00:00:00',inlet:10,outlet:0,topology:'T1',zoneId:'DMA-02'});}},DMADemo:{seed(){throw Error('generic demo must remain off');}}};
  const context={project,version:'T1',monthlyExamples:false,model:{history,objects:new Map([['N',{id:'N',type:'user',name:'宿舍1'}],['OTHER',{id:'OTHER',type:'node',name:'其他节点'}],['V',{id:'V',type:'valve',name:'阀门'}]]),data:{zones:[{id:'DMA-02',name:'北侧宿舍'},{id:'DMA-04',name:'南侧宿舍'}]}},binding:{devices,store:{bindings,bindingHistory:[]},persist(){}},render(){},operations(){return {alarms:[]};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../standard-product-ui.js'),'utf8'),{window,localStorage:storage,document:{addEventListener(){}},XLSX,Date,Map,Set,console});
  const ui=new window.StandardProductUI(()=>context);ui.c();return {ui,context,data,storage,window,exports,enriched:()=>enriched};
}
const main={id:'MAIN',type:'flow',metric:'flow',name:'楼栋三级表',hostId:'N',unit:'m³/h',value:12,status:'启用',quality:'GOOD'};
const child={id:'CHILD',type:'waterMeter',metric:'flow',name:'用户水表',hostId:'N',businessUserId:'USER01',businessUserName:'宿舍1 / 用户01',parentDeviceId:'MAIN',unit:'m³/h',value:2,status:'启用',quality:'GOOD',preset:true,demo:true,daily:[{date:'2026-07-01',volume:3,total:103},{date:'2026-07-02',volume:5,total:108}]};
test('editing a business submeter preserves its physical location and never joins node flow aggregation',async()=>{
  const {ui,context}=setup({devices:[structuredClone(main),structuredClone(child)],bindings:[{key:'T1|N|flow',devices:['MAIN'],rule:'sum',revision:1}]});
  await ui.action('edit','CHILD');assert.equal(ui.form.hostId,'N');
  const changed={...context.binding.devices[1],name:'改名后的用户表'};ui.applyDevices([main,changed],[changed]);
  assert.deepEqual(context.binding.store.bindings[0].devices,['MAIN']);assert.equal(context.binding.store.bindings.length,1);
  assert.equal(ui.host(changed).id,'USER01');assert.equal(ui.physicalHost(changed).id,'N');
  const ledger=ui.reportData('ledger'),row=ledger.rows.find(r=>r[0]==='CHILD');assert.equal(row[7],'USER01');assert.equal(row[8],'宿舍1 / 用户01');assert.equal(row[9],'N');assert.equal(row[10],'MAIN');
  assert.match(ui.devices(),/预设待安装/);assert.match(ui.devices(),/示例非实测/);assert.match(ui.devices(),/用户01/);
});
test('editing a previously misbound submeter removes the duplicate and archives the old group',()=>{
  const {ui,context}=setup({devices:[structuredClone(main),structuredClone(child)],bindings:[{key:'T1|N|flow',devices:['MAIN','CHILD'],rule:'sum',revision:2}]});
  ui.applyDevices([main,child],[child]);
  assert.deepEqual(context.binding.store.bindings[0].devices,['MAIN']);assert.equal(context.binding.store.bindings[0].revision,3);assert.equal(context.binding.store.bindingHistory.length,1);
  assert.equal(context.binding.store.bindingHistory[0].devices.length,2);
});
test('ordinary water meters still bind and newly created flow groups use sum',()=>{
  const ordinary={...child,id:'ORDINARY',businessUserId:undefined,parentDeviceId:undefined};const {ui,context}=setup();ui.applyDevices([ordinary],[ordinary]);
  assert.equal(context.binding.store.bindings.length,1);assert.equal(context.binding.store.bindings[0].rule,'sum');assert.equal(context.binding.store.bindings[0].devices[0],'ORDINARY');
});
test('planned noise edit exposes its designated point and valves but no arbitrary point',()=>{
  const d={id:'NOISE',type:'noise',name:'规划噪声仪',preset:true,demo:true,plannedHostId:'N',hostId:'N',installationPlanId:'K1',topologyId:'T1'};const {ui}=setup({devices:[d]});ui.form=d;
  const html=ui.deviceForm();assert.match(html,/<option value="N"/);assert.match(html,/<option value="V"/);assert.doesNotMatch(html,/<option value="OTHER"/);assert.match(html,/挂接安装点/);
});
test('campus hourly fixtures enrich reads but are not persisted with edits or reports',()=>{
  const daily={source,inlet:20},revenue={source,volume:10};const {ui,data,enriched}=setup({db:{imports:[],reports:[],balances:[daily],revenueRecords:[revenue],hourlyBalances:[{source:'人工录入',inlet:8}]}});
  const db=ui.db();assert.equal(enriched(),1);assert.equal(db.hourlyBalances.length,2);ui.save(db);
  const saved=JSON.parse(data.get('water-standard:'+project));assert.equal(saved.hourlyBalances.length,1);assert.equal(saved.hourlyBalances[0].source,'人工录入');assert.deepEqual(saved.balances,[daily]);assert.deepEqual(saved.revenueRecords,[revenue]);
});
test('fixture dates default to full available readings and only completed calendar months',()=>{
  const {ui,context}=setup();assert.equal(ui.start,'2026-07-01T00:00');assert.equal(ui.end,'2026-10-26T23:59');assert.equal(ui.analysisStart,'2026-07');assert.equal(ui.analysisEnd,'2026-09');
  assert.equal(ui.hourStart,'2026-07-01');ui.zone='DMA-04';assert.match(ui.campusNote(),/三级总表合计估算/);ui.zone='DMA-02';assert.match(ui.campusNote(),/不能全部认定为漏损/);
  context.project='OTHER';ui.c();assert.equal(ui.analysisEnd,'');assert.equal(ui.campusNote(),'');
});
test('device usage shows period sum from daily volumes without counting another meter',()=>{
  const {ui}=setup({devices:[{...main,daily:[{date:'2026-07-01',volume:99,total:199}]},child]});ui.selected='CHILD';ui.start='2026-07-01T00:00';ui.end='2026-07-02T23:59';ui.tab='usage';
  const html=ui.dataDrawer();assert.match(html,/所选时段用水量<strong>8 m³/);assert.match(html,/当前用户分表用量/);assert.match(html,/日末累计水量 m³/);assert.match(html,/示例非实测/);assert.doesNotMatch(html,/199/);
  ui.start='2026-07-02T00:00';assert.equal(ui.currentUsage().length,1);assert.match(ui.usagePanel(child),/用水量<strong>5 m³/);
});
test('history topology rejects device binding mutations',()=>{
  const {ui,context}=setup({devices:[main],history:true});assert.throws(()=>ui.applyDevices([main,child],[child]),/历史版本只读/);assert.equal(context.binding.devices.length,1);assert.equal(context.binding.store.bindings.length,0);
});
test('unbound physical instruments do not regain stale host bindings when edited',async()=>{
  const {ui}=setup({devices:[main]});assert.equal(ui.host(main),undefined);await ui.action('edit','MAIN');assert.equal(ui.form.hostId,'');
});
test('device usage does not present an incomplete period sum as a complete total',()=>{
  const {ui}=setup({devices:[child]});ui.selected='CHILD';ui.start='2026-06-30T00:00';ui.end='2026-07-02T23:59';const html=ui.usagePanel(child);assert.match(html,/存在缺数/);assert.match(html,/所选时段用水量<strong>— m³/);assert.match(html,/2 \/ 3 天/);
});

test('business meter ledger reflects saved user unbinding and reassignment instead of its original preset user',()=>{
  const {ui,storage,window}=setup({devices:[main,child]});window.CampusMetering.topologyId='T1';
  const key='water-user-hierarchy:v1:'+project+'|sh-campus-20261013:N';
  storage.setItem(key,JSON.stringify({children:[{id:'USER01',name:'用户01',meterId:null}]}));
  assert.equal(ui.host(child),undefined);assert.equal(ui.hostText(child),'待挂接');
  storage.setItem(key,JSON.stringify({children:[{id:'USER02',name:'用户02',meterId:'CHILD'}]}));
  assert.equal(ui.host(child).id,'USER02');assert.match(ui.hostText(child),/用户02/);assert.doesNotMatch(ui.hostText(child),/用户01/);
});

const W=require('../table-component.js');
test('device header filters and sorting drive all matching export rows before pagination',async()=>{
  const devices=Array.from({length:13},(_,i)=>({...child,id:'METER-'+String(i+1).padStart(2,'0'),name:'用户水表'+(i+1),value:13-i}));
  const {ui,window,exports}=setup({devices:[main,...devices]});window.WaterTable=W;
  const key=ui.tableKey('devices');W.reset(key);const state=W.getState(key);state.size=5;state.page=2;
  state.filters={2:{values:[S.types.waterMeter[0]]}};state.sort={column:5,direction:'asc'};
  ui.query='旧查询不应隐藏设备';ui.type='pressure';
  const html=ui.devices();assert.doesNotMatch(html,/data-sp-form="query"|name="type"/);
  assert.equal((html.match(/data-device-id=/g)||[]).length,5);
  assert.deepEqual(Array.from(ui.filteredDevices(),d=>d.id),devices.slice().reverse().map(d=>d.id));
  await ui.action('ledger-export');assert.equal(exports[0].length,14);assert.equal(exports[0][1][0],'METER-13');assert.equal(exports[0].at(-1)[0],'METER-01');
  ui.checked=new Set(['METER-02','METER-12','MAIN']);await ui.action('selected-export');assert.deepEqual(Array.from(exports[1].slice(1),r=>r[0]),['METER-12','METER-02']);W.reset(key);
});
test('usage export follows the displayed header values and exports every matching day',async()=>{
  const daily=Array.from({length:20},(_,i)=>({date:'2026-07-'+String(i+1).padStart(2,'0'),volume:i+0.12345,total:100+i}));
  const {ui,window,exports}=setup({devices:[{...child,daily}]});window.WaterTable=W;ui.selected='CHILD';ui.start='2026-07-01T00:00';ui.end='2026-07-20T23:59';
  const key=ui.tableKey('usage:CHILD');W.reset(key);const state=W.getState(key);state.size=5;state.page=2;state.filters={1:{min:'5',max:'15',kind:'number'}};state.sort={column:0,direction:'desc'};
  ui.usagePanel(ui.rows()[0]);await ui.action('usage-export');assert.equal(exports[0].length,11);assert.equal(exports[0][1][0],'2026-07-15');assert.equal(exports[0].at(-1)[0],'2026-07-06');assert.equal(exports[0][1][1],14.12345);W.reset(key);
});
