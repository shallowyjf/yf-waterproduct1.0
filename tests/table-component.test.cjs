const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../table-component.js');
const columns=[{label:'名称',value:r=>r.name},{label:'流量',value:r=>r.flow},{label:'状态',value:r=>r.status},{label:'时间',value:r=>r.time},{label:'操作',value:()=> '查看',filterable:false,sortable:false,searchable:false}];
const records=Array.from({length:27},(_,i)=>({name:'设备'+(i+1),flow:i===25?2:i===26?10:100+i,status:i%2?'正常':'离线',time:'2026-10-'+String(i+1).padStart(2,'0')+' 08:00:00'}));
test('query and sort operate on all records before pagination without changing source order',()=>{
 const before=records.map(r=>r.name),result=T.select(records,columns,{query:'设备2',sort:{column:1,direction:'asc'}});
 assert.equal(result[0].name,'设备26');assert.equal(result[1].name,'设备27');assert.equal(result.length,9);assert.deepEqual(records.map(r=>r.name),before);
 assert.equal(T.select(records,columns,{query:'查看'}).length,0);
});
test('column filters combine selected values, numeric range and text with global search',()=>{
 const result=T.select(records,columns,{query:'设备',filters:{0:{text:'设备2'},1:{kind:'number',min:100,max:130},2:{values:['正常']}}});
 assert.deepEqual(result.map(r=>r.name),['设备2','设备20','设备22','设备24']);
 assert.equal(T.select(records,columns,{filters:{2:{values:[]}}}).length,0);
});
test('numeric and date sorting is stable and missing readings remain last',()=>{
 const rows=[{flow:'10 m³/h'},{flow:'2 m³/h'},{flow:'—'},{flow:2},{flow:null}];
 assert.deepEqual(T.select(rows,columns,{sort:{column:1,direction:'asc'}}),[rows[1],rows[3],rows[0],rows[2],rows[4]]);
 assert.deepEqual(T.select(rows,columns,{sort:{column:1,direction:'desc'}}),[rows[0],rows[1],rows[3],rows[2],rows[4]]);
 assert.equal(T.number('DN100'),100);assert.equal(T.number('1,250.5 m'),1250.5);
 assert.equal(T.select(records,columns,{sort:{column:3,direction:'desc'}})[0].name,'设备27');
});
test('date range includes the entire final day and excludes missing readings',()=>{
 const data=[...records,{name:'missing',time:'—'},{name:'late',time:'2026-10-21 23:59:59'},{name:'next',time:'2026-10-22 00:00:00'}];
 const result=T.select(data,columns,{filters:{3:{kind:'date',min:'2026-10-20',max:'2026-10-21'}}});
 assert.deepEqual(result.map(r=>r.name),['设备20','设备21','late']);
});
test('model export and renderer share filters and sort while reset clears both',()=>{
 const key='export-test',state=T.getState(key);state.query='设备2';state.sort={column:1,direction:'asc'};state.page=2;
 const all=T.query(key,records,columns);assert.equal(all.length,9);assert.equal(all[0].name,'设备26');
 const html=T.render({key,columns,rows:records,pageSize:5,renderRow:r=>'<tr><td>'+r.name+'</td></tr>'});
 assert.match(html,/data-water-table-model/);assert.match(html,/设备26/);
 T.reset(key);assert.equal(T.query(key,records,columns).length,27);assert.equal(state.page,1);assert.equal(state.sort,null);
});
