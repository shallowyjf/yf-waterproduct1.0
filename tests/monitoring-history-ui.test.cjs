const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const H=require('../monitoring-history.js'),T=require('../table-component.js');
function setup(){
 const events={},tables=[],charts=[],downloads=[],monitor={id:'MONITOR',name:'压力点',hostId:'NODE',devices:['DEVICE'],type:'pressure',unit:'MPa'};
 const samples=Array.from({length:24},(_,i)=>({time:`2026-10-27 ${String(i).padStart(2,'0')}:00:00`,metric:'pressure',unit:'MPa',value:i+.12345,quality:'GOOD'}));
 samples.push({time:'2026-10-27 23:00:00',metric:'state',unit:'',value:'开启',quality:'GOOD'});
 const c={project:'MONITOR-UI-TEST',version:'T9',selected:monitor.id,model:{monitors:[monitor],objects:new Map([['NODE',{}]])},archive:{series:{}},devices:[{id:'DEVICE',name:'压力表',unit:'MPa',samples}],refresh(){},select(){},chart(config){charts.push(config);return '<div class="chart-fixture"></div>';}};
 const window={MonitoringHistory:H,WaterStandard:{metrics:{pressure:['压力'],state:['状态']}},WaterTable:{...T,render(options){tables.push(options);T.reset(options.key);return T.render(options);}}};
 const XLSX={utils:{book_new:()=>({}),aoa_to_sheet:rows=>rows,book_append_sheet(wb,sheet){wb.sheet=sheet;}},writeFile(wb,name){downloads.push({rows:wb.sheet,name});}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../monitoring-history-ui.js'),'utf8'),{window,XLSX,document:{addEventListener(name,fn){(events[name]||=[]).push(fn);}},Date,Map,Set,console});
 const ui=window.createMonitoringHistoryUI(()=>c);
 return {ui,c,tables,charts,downloads,window,change(id,value){events.change[0]({target:{id,value}});},export(){events.click[0]({preventDefault(){},target:{closest:()=>({dataset:{mh:'export'}})}});}};
}

test('monitoring detail exports all filtered and sorted model rows independently of its page',()=>{
 const f=setup(),html=f.ui.render(),table=f.tables.at(-1);
 assert.equal(table.rows.length,24);assert.equal(table.columns[2].value(table.rows[23]),23.12345);assert.match(table.renderRow(table.rows[23]),/23\.123/);
 assert.match(table.key,/MONITOR-UI-TEST.*T9.*MONITOR.*DEVICE.*pressure/);
 assert.match(html,/id="monitorHistoryQuery"/);assert.match(html,/id="currentTrendMonitor"/);assert.match(html,/id="historyMetric"/);
 const state=T.getState(table.key);state.filters={2:{min:'10',kind:'number'}};state.sort={column:2,direction:'desc'};state.page=2;state.size=10;
 f.export();const rows=f.downloads.at(-1).rows;
 assert.equal(rows.length,15,'header plus all fourteen matching records, including off-page matches');
 assert.equal(rows[1][4],23.12345);assert.equal(rows.at(-1)[4],10.12345);
 assert.equal(f.charts.at(-1).times.length,24,'table filters do not remove chart samples');
 state.query='not present';f.export();assert.equal(f.downloads.at(-1).rows.length,1,'zero matches export no stale unfiltered records');
});

test('monitoring table keys isolate device, aggregate and metric selections while preserving state strings',()=>{
 const f=setup();f.ui.render();const first=f.tables.at(-1);
 f.change('historyMetric','state');f.ui.render();const state=f.tables.at(-1);
 assert.notEqual(first.key,state.key);assert.equal(state.rows.length,1);assert.equal(state.columns[2].value(state.rows[0]),'开启');f.export();assert.equal(f.downloads.at(-1).rows[1][4],'开启');
 f.change('historyDevice','');f.ui.render();const aggregate=f.tables.at(-1);
 assert.notEqual(aggregate.key,first.key);assert.match(aggregate.key,/aggregate\|pressure$/);assert.equal(aggregate.rows.length,24);
 assert.equal(f.charts.at(-1).times.length,24);
});

test('monitoring history keeps its prior export behavior when the shared component is unavailable',()=>{
 const f=setup();delete f.window.WaterTable;const html=f.ui.render();f.export();assert.match(html,/mh-table/);assert.equal(f.downloads.at(-1).rows.length,25);
});
