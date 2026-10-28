const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setup(file,extra={}){
 const tables=[],events={},window={WaterMapLayout:{escape,left:()=>'',issues:()=>'',toggle:()=>'',bottom:html=>html},WaterTable:{render(options){tables.push(options);return `<div class="water-table"><table><tbody>${options.rows.slice(0,options.pageSize).map(options.renderRow).join('')}</tbody></table></div>`;}},...extra};
 const document={addEventListener(name,fn){(events[name]||=[]).push(fn);},querySelector(){return null;}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{window,document,localStorage:{getItem(){return null;}},Date,Map,Set,console});
 return {window,document,tables,events};
}
const data=()=>({nodes:Array.from({length:31},(_,i)=>({id:'N'+i,name:'用户'+i,type:i?'user':'plant',x:i*10,y:20,elevation:10,diameter:null})),pipes:Array.from({length:30},(_,i)=>({id:'P'+i,name:'管道'+i,type:'pipe',start:'N'+i,end:'N'+(i+1),diameter:100+i,length:10.125+i})),zones:[]});

test('topology model supplies all matching records and raw numeric columns before paging',()=>{
 const {window,tables}=setup('topology-editor.js'),editor=new window.WaterTopologyEditor({}),snapshot=data();
 editor.key='PROJECT:T9';editor.s={data:snapshot,tableType:'pipe',selected:'P29',editing:true,query:'stale legacy query'};
 const html=editor.objectTable(false),table=tables.at(-1);
 assert.equal(table.rows.length,30);assert.equal(table.rows.at(-1).id,'P29');
 assert.equal(table.columns.find(c=>c.label==='管长 / m').value(table.rows[29]),39.125);
 assert.match(table.renderRow(table.rows[29]),/data-we="object" data-value="P29"/);
 assert.match(table.key,/PROJECT:T9.*pipe/);assert.doesNotMatch(html,/data-we-search|data-we-page-size/);
 editor.s.data.zones=[{id:'Z1',name:'测试分区',type:'zone',nodeIds:['N1'],pipeIds:['P29']}];editor.s.memberZone='Z1';editor.s.tableType='members';
 editor.objectTable(true);assert.deepEqual(Array.from(tables.at(-1).rows,o=>o.id),['N1','P29']);
 assert.match(tables.at(-1).renderRow(tables.at(-1).rows[1]),/remove-member/);
});

test('hydraulic result adapter filters object category but passes off-page values to common sorting',()=>{
 const H={empty:()=>({sandboxes:[]}),analysis:()=>[],metrics:{pressure:{name:'压力',unit:'MPa',scope:'nodes'},flow:{name:'流量',unit:'m³/h',scope:'pipes'}},intervals:()=>({edges:[0,1],colors:['blue']}),bandColor:()=> 'blue'};
 const {window,tables}=setup('hydraulics-ui.js',{WaterHydraulics:H}),snapshot=data(),frame={nodes:{},pipes:{}};
 snapshot.nodes.forEach((n,i)=>frame.nodes[n.id]={pressure:i/100,flow:i});snapshot.pipes.forEach((n,i)=>frame.pipes[n.id]={pressure:i/100,flow:1000-i});
 const run={id:'RUN-1',topology:'T9',date:'2026-10-28',snapshot,frames:Array(24).fill(frame),availableHours:[8],availableMetrics:['pressure','flow'],inputs:[{hostId:'P29',devices:['FLOW-29']}]};
 const ui=window.createHydraulicsUI(()=>({project:'PROJECT'})),html=ui.renderRun(run),table=tables.at(-1);
 assert.equal(table.rows.length,30);assert.equal(table.columns.find(c=>c.label==='流量 / m³/h').value(table.rows[29]),971);
 assert.match(table.renderRow(table.rows[29]),/FLOW-29/);assert.match(table.renderRow(table.rows[29]),/data-hy="locate" data-value="P29"/);
 assert.match(table.key,/PROJECT.*T9.*RUN-1.*pipe/);assert.doesNotMatch(html,/aria-label="查询水力对象"|data-hy-change="table-size"/);
 const next={...run,id:'RUN-2'};ui.renderRun(next);assert.notEqual(table.key,tables.at(-1).key);
});

test('scenario ledger delegates complete topology to header filters and keeps model controls',()=>{
 const snapshot=data(),sample={id:'SAMPLE',time:'2026-10-28T08:00:00+08:00',source:'示例'};
 const draft={id:'SCENE-1',kind:'hydraulic',name:'方案',topology:'T9',baseTopology:{published:'2026-10-01'},baseSnapshot:snapshot,snapshot,baseSample:sample,calculationSamples:[sample],operations:[],params:{sources:{},demand:100,roughness:100},settings:{}};
 const {window,tables}=setup('v2-scenario-workspace.js',{WaterV2:{timeSeries:()=>[],released:x=>x,quality:()=>false,clone:x=>structuredClone(x)},WaterHydraulics:{validate(){}}});
 const ui=window.createScenarioWorkspace(()=>({project:'PROJECT',draft,versions:[{id:'T9',name:'发布拓扑'}]})),html=ui.render(draft,''),table=tables.at(-1);
 assert.equal(table.rows.length,61);assert.equal(table.columns[2].value(table.rows.at(-1)),'管道');
 assert.match(table.key,/PROJECT.*SCENE-1.*T9/);assert.doesNotMatch(html,/name="ws-category"|name="ws-page-size"/);
 assert.match(html,/name="ws-topology"/);assert.match(html,/name="ws-base"/);assert.match(table.renderRow(table.rows.at(-1)),/data-v2="ws-select" data-id="P29"/);
});

test('result archive adapter supplies all archives without legacy topology and date controls',()=>{
 const records=Array.from({length:31},(_,i)=>({id:'ARCHIVE-'+i,name:'结果'+i,topology:'T'+(i%2),revision:i,count:i+1,start:'2026-10-27T08:00:00+08:00',end:'2026-10-28T08:00:00+08:00',source:'计算结果',points:[{time:'2026-10-27T08:00:00+08:00'}]}));
 const {window,document,tables}=setup('result-archives-ui.js',{WaterResultArchives:{list:()=>records,view:()=>({}),filter(){throw Error('legacy filters should not narrow the common table input');}}});
 const bottom={innerHTML:'',querySelectorAll:()=>[]},root={dataset:{},classList:{add(){}},querySelector:()=>bottom};
 document.createElement=()=>({querySelector:selector=>selector==='.hy-timeline'?{}:root,get outerHTML(){return bottom.innerHTML;}});
 const ui=window.createResultArchivesUI(()=>({project:'PROJECT',db:()=>({}),hydraulics:()=>({pause(){},renderRun:()=>''})})),html=ui.render('hydraulic'),table=tables.at(-1);
 assert.equal(table.rows.length,31);assert.equal(table.columns.find(c=>c.label==='时刻数').value(table.rows[30]),31);
 assert.match(table.key,/PROJECT.*hydraulic/);assert.doesNotMatch(html,/archiveTopology|id="ar-query"|ar-pagination/);
 assert.match(table.renderRow(table.rows[30]),/data-ar="select" data-id="ARCHIVE-30"/);
 for(const t of tables){const action=t.columns.at(-1);assert.equal(action.filterable,false);assert.equal(action.sortable,false);}
});
