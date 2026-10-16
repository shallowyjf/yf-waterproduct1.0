const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function section(from,to){return source.slice(source.indexOf('  function '+from+'('),source.indexOf('  function '+to+'('));}
function routing(){
  const state={authenticated:true,activeProjectId:'PRJ-001',selectedTopology:'T0',page:'p03',p02Drawer:'old',p02SelectedObjects:['old']};
  const ctx={state,isSchoolAccount:()=>false,activeTopology:()=>({id:'T9'}),topologyStore:()=>({versions:[{id:'T3'},{id:'T9'}]}),isP02Page:()=>false,deviceBindingUI:{object:'old',draft:{}},location:{},render:()=>{}};
  vm.createContext(ctx);vm.runInContext(section('navigate','showToast'),ctx);return ctx;
}
test('sidebar entry uses the active version, not the largest or hardcoded T3',()=>{const c=routing();c.navigate('p04',true);assert.equal(c.state.selectedTopology,'T9');assert.equal(c.state.p02Drawer,null);assert.equal(c.deviceBindingUI.object,null);});
test('explicit version entry retains its requested context',()=>{const c=routing();c.state.selectedTopology='T4';c.navigate('p12');assert.equal(c.state.selectedTopology,'T4');});
test('topology navigation order is version, editor, devices',()=>{const line=source.split('\n').find(l=>l.includes('id: "topology",'));assert.ok(line.indexOf('拓扑版本管理')<line.indexOf('拓扑编辑器'));assert.ok(line.indexOf('拓扑编辑器')<line.indexOf('拓扑设备管理'));assert.match(source,/data-action="topology-devices" data-value="\$\{t.id\}"/);});
function comparison(before,after,bindings=[],selected=null){
 const c={state:{selectedTopology:'T9',compareBaseline:'T3',p08Selected:selected},topologyStore:()=>({versions:[{id:'T3',name:'基准'},{id:'T9',name:'当前'}],bindings}),compareSnapshot:()=>before,topologyReadRenderer:{s:{data:after}},escapeHtml:x=>String(x??''),pageHeader:()=>''};
 vm.createContext(c);vm.runInContext(section('renderVersionComparison','renderP08'),c);return c.renderVersionComparison(true);
}
test('comparison has zero differences for identical saved data',()=>{const d={nodes:[{id:'N1',x:1}],pipes:[],zones:[]};assert.match(comparison(d,d),/对象差异 · 0/);});
test('comparison identifies real additions, deletions and changed fields',()=>{const a={nodes:[{id:'N1',x:1},{id:'OLD'}],pipes:[],zones:[]},b={nodes:[{id:'N1',x:2},{id:'NEW'}],pipes:[],zones:[]};const html=comparison(a,b);assert.match(html,/对象差异 · 3/);for(const text of ['N1','OLD','NEW','新增','删除','修改'])assert.ok(html.includes(text));});
test('equal group counts still detect device and aggregation rule changes',()=>{const data={nodes:[],pipes:[],zones:[]},bindings=[{key:'T3|N1|flow',devices:['D1'],rule:'sum'},{key:'T9|N1|flow',devices:['D2'],rule:'average'}];const html=comparison(data,data,bindings,'binding:N1|flow');for(const text of ['挂接差异 · 1','设备集合','处理规则','加和','平均','D1','D2'])assert.ok(html.includes(text),text);});
test('device set ordering and revision metadata do not produce false differences',()=>{const data={nodes:[],pipes:[],zones:[]};assert.match(comparison(data,data,[{key:'T3|N1|flow',devices:['D1','D2'],rule:'sum',revision:1},{key:'T9|N1|flow',devices:['D2','D1'],rule:'sum',revision:4}]),/挂接差异 · 0/);});
test('unchanged objects expose translated attributes',()=>{const data={nodes:[{id:'N1',type:'cap',x:10,y:20}],pipes:[],zones:[]};const html=comparison(data,data,[],'N1');assert.match(html,/未变化 · 属性对照/);assert.match(html,/对象类型/);assert.match(html,/堵头/);});
