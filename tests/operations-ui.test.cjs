const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const O=require('../operations.js');
function setup(raw,fail=false){
 const writes=[],storage=new Map();if(raw!==undefined)storage.set('water-operations:v1:P1',raw);
 const c={project:'P1',topology:'T1',activeTopology:'T1',model:{data:{nodes:[],pipes:[]},objects:new Map(),events:[{id:'A1',type:'alarm',name:'测试报警',hostId:'N1'}]},refresh(){},navigate(){}};
 const scope={window:{WaterOperations:O},document:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem(k,v){if(fail)throw Error('quota');writes.push(k);storage.set(k,v);}},Date,Map,JSON};
 vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(__dirname,'../map-layout.js'),'utf8'),scope);vm.runInContext(fs.readFileSync(path.join(__dirname,'../operations-ui.js'),'utf8'),scope);
 return {ui:scope.window.createOperationsUI(()=>c),c,storage,writes};
}
test('seed records persist once, maintain occurrence time and isolate project keys',()=>{const {ui,c,writes}=setup();const first=ui.load();assert.equal(first.alarms.length,1);assert.equal(writes.length,1);assert.equal(ui.load().alarms[0].createdAt,first.alarms[0].createdAt);assert.equal(writes.length,1);c.project='P2';ui.load();assert.deepEqual(writes,['water-operations:v1:P1','water-operations:v1:P2']);});
test('corrupt storage is not overwritten and displays a blocking error',()=>{const {ui,writes}=setup('{bad');assert.match(ui.render('p16'),/本地业务记录读取失败/);assert.equal(writes.length,0);});
test('storage quota error cannot display a false save success',()=>{const {ui,writes}=setup(undefined,true);assert.match(ui.render('p16'),/已停止写入/);assert.equal(writes.length,0);});
test('archive renderer uses persisted closed records and no mock historical dates',()=>{const db=O.empty();db.seeded=true;db.orders.push({id:'W1',name:'实测闭环',hostId:'N1',status:'已完成',closedAt:'2026-09-15T02:00:00Z',dueAt:'2026-09-15T04:00:00Z',assignee:'管线巡检班',priority:'普通'});const {ui}=setup(JSON.stringify(db));assert.match(ui.render('p15h'),/实测闭环/);assert.doesNotMatch(ui.render('p15'),/实测闭环/);});
test('app wires records to map and avoids legacy history enhancer for ledger archives',()=>{const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');assert.match(source,/topologyReadModel\.events\.splice/);assert.match(source,/if\(!\['p13h','p15h'\]\.includes\(state\.page\)\) enhanceHistoryMap/);assert.match(source,/p16: \(\) => operations\(\)\.render\("p16"\)/);});

test('inspection page contains task management only, without alarm or order content',()=>{const {ui}=setup();const html=ui.render('p16');assert.match(html,/巡检管理/);assert.match(html,/ops-task-list/);assert.doesNotMatch(html,/报警|工单|ops-summary|task-issue|ops-map-page/);});
test('map and record list share the same active or archived record set',()=>{const db=O.empty();db.seeded=true;db.orders=[{id:'active',name:'待处理记录',status:'待接单',hostId:'N1',createdAt:'2026-09-15T00:00:00Z'},{id:'closed',name:'已归档记录',status:'已完成',hostId:'N1',closedAt:'2026-09-15T01:00:00Z'}];const {ui,c}=setup(JSON.stringify(db));let events=[];c.drawMap=e=>{events=e;return '<svg aria-label="地图" />';};assert.match(ui.renderMap('p15'),/ops-map-canvas/);assert.equal(events.map(e=>e.id).join(','),'active');ui.renderMap('p15h');assert.equal(events.map(e=>e.id).join(','),'closed');});
