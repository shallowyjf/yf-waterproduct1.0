const {test}=require('node:test'),assert=require('node:assert/strict'),S=require('../standard-product.js');
const model={objects:new Map([['V',{id:'V',type:'valve'}],['N',{id:'N',type:'node'}],['H',{id:'H',type:'user',userSubtype:'FIRE_HYDRANT'}],['U',{id:'U',type:'user'}]])};
test('hydrants reuse user topology but retain independent business type',()=>{assert.equal(S.kind(model.objects.get('H')),'hydrant');assert.equal(S.label(model.objects.get('H')),'消火栓');assert.equal(S.kind(model.objects.get('U')),'user');assert.equal(model.objects.get('H').type,'user');});
test('noise binding accepts only valves, hydrants only hydrant user subtype',()=>{assert.equal(S.hostError({type:'noise'},model.objects.get('V')),'');for(const id of ['N','H','U'])assert.match(S.hostError({type:'noise'},model.objects.get(id)),/阀门/);assert.equal(S.hostError({type:'hydrant'},model.objects.get('H')),'');assert.match(S.hostError({type:'hydrant'},model.objects.get('U')),/消火栓/);});
test('new hydrant defaults to alarm notification without fabricated samples',()=>{const d=S.validateDevice({id:'HY-1',type:'hydrant',name:'消火栓',hostId:'H'},[],model);assert.equal(d.alarmEnabled,true);assert.equal(d.value,null);assert.equal(d.online,'未知');assert.deepEqual(d.samples,[]);});
test('batch preflight validates host type and rejects whole invalid batch',()=>{const rows=[{'设备编号':'NO-1','设备名称':'噪声仪','设备类型':'噪声仪','宿主编号':'V'},{'设备编号':'NO-2','设备名称':'错误噪声仪','设备类型':'噪声仪','宿主编号':'N'}];const p=S.previewImport(rows,[],model);assert.equal(p.valid,false);assert.match(p.items[1].error,/阀门/);assert.throws(()=>S.commitImport(p,[],model));rows[1]['宿主编号']='V';const p2=S.previewImport(rows,[],model);assert.equal(S.commitImport(p2,[],model).length,2);assert.throws(()=>S.commitImport(p2,[{id:'OTHER'}],model),/变化/);});
test('duplicate import and unknown metric never commit',()=>{const r={'设备编号':'D-1','设备名称':'噪声仪','设备类型':'noise'};assert.equal(S.previewImport([r,r],[],model).valid,false);assert.equal(S.previewImport([{...r,'主指标':'arbitrary'}],[],model).valid,false);});
test('water balance preserves missing, negative and zero denominator cases',()=>{const valid={inlet:1200,outlet:200,storage:50,billed:850,unbilled:20};const r=S.balance(valid);assert.equal(r.basis,950);assert.equal(r.loss,80);assert.equal(+r.rate.toFixed(4),8.4211);assert.equal(S.balance({...valid,unbilled:''}).rate,null);assert.equal(S.balance({...valid,inlet:250}).rate,null);assert.equal(S.balance({...valid,billed:1000}).status,'不可判断');});
test('diagnosis requires valid quality, configured rule and night flow',()=>{const row={inlet:1200,outlet:200,storage:50,billed:850,unbilled:20,night:30};assert.equal(S.diagnose([row],null)[0].assessment,'待配置');assert.equal(S.diagnose([row],{lossRate:12,nightFlow:20,revision:1})[0].assessment,'疑似异常');assert.equal(S.diagnose([{...row,night:''}],{lossRate:12,nightFlow:20})[0].assessment,'不可判断');});
test('hydrant alarms deduplicate and normal outflow is not illegal use',()=>{const db={alarms:[]},device={id:'H1',type:'hydrant',name:'消火栓',alarmEnabled:true};assert.equal(S.alarm(db,device,'H','T1',{id:'1',abnormal:false}),null);const event={id:'2',abnormal:true,name:'故障'};S.alarm(db,device,'H','T1',event);S.alarm(db,device,'H','T1',event);assert.equal(db.alarms.length,1);assert.equal(db.alarms[0].status,'待确认');assert.equal(db.alarms[0].notifyEnabled,true);});
test('sample queries keep states and time boundaries, CSV escapes formula text',()=>{const d={samples:[{metric:'outflow',time:'2026-10-08T01:00',value:'出水'},{metric:'pressure',time:'2026-10-08T02:00',value:.3}]};assert.equal(S.samples(d,'outflow','2026-10-08T00:00','2026-10-08T01:00')[0].value,'出水');assert.match(S.csv([['=1+1',3]]),/'=1\+1/);});

test('measurement type cannot bypass noise host rules and RTU has no aggregate binding',()=>{assert.throws(()=>S.validateDevice({id:'NO-3',name:'错误类型',type:'flow',metric:'noise',unit:'dB',hostId:'N'},[],model),/类型与主指标/);assert.throws(()=>S.validateDevice({id:'RT-1',name:'RTU',type:'rtu',hostId:'N'},[],model),/下挂设备/);});

test('a preset noise instrument permits only its explicitly planned physical point',()=>{
  const d={id:'PLAN-NO',name:'规划噪声仪',type:'noise',preset:true,demo:true,installationPlanId:'K1',plannedHostId:'N',hostId:'N',topologyId:'T-CAMPUS'};
  assert.equal(S.hostError(d,model.objects.get('N')),'');
  assert.equal(S.validateDevice(d,[],model).hostId,'N');
  assert.match(S.hostError(d,model.objects.get('U')),/规划安装点/);
  for(const changed of [{preset:false},{demo:false},{installationPlanId:''},{topologyId:''},{plannedHostId:'U'}])assert.match(S.hostError({...d,...changed},model.objects.get('N')),/阀门/);
  for(const type of ['pipe','zone'])assert.match(S.hostError(d,{id:'N',type}),/阀门/);
  const p=S.previewImport([{'设备编号':d.id,'设备名称':'修改名称','设备类型':'噪声仪','宿主编号':'N'}],[d],model,'更新');
  assert.equal(p.valid,true);assert.equal(S.commitImport(p,[d],model)[0].plannedHostId,'N');
});

test('minute precision end times include the final sample seconds of that minute',()=>{
  const d={samples:[{time:'2026-10-26 23:59:59',metric:'volume',value:124},{time:'2026-10-27 00:00:00',metric:'volume',value:125}]};
  assert.deepEqual(S.samples(d,'volume','2026-10-26T00:00','2026-10-26T23:59').map(x=>x.value),[124]);
});
