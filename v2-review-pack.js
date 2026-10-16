(function(root,factory){const api=factory(root.WaterV2||(typeof require==='function'?require('./v2-scenarios.js'):null));root.WaterReviewPack=api;if(typeof module==='object'&&module.exports)module.exports=api;})(globalThis,function(V){
 'use strict';
 const ensure=(ok,message)=>{if(!ok)throw Error(message);};
 function create(db,version,data,samples,now=Date.now()){
  if(db.reviewPack)return db;
  const next=V.clone(db),source=JSON.stringify(data),users=data.nodes.filter(n=>n.type==='user');
  ensure(users.length,'发布拓扑中没有用户');
  const days=[...new Set(samples.map(s=>s.time.slice(0,10)))].sort().reverse();
  const day=days.find(day=>[8,14,20].every(h=>samples.some(s=>s.time.startsWith(day+'T'+String(h).padStart(2,'0')+':'))));
  ensure(day,'标准场景需要同一天 08:00、14:00、20:00 的有效时序数据');
  const times=[8,14,20].map(h=>samples.find(s=>s.time.startsWith(day+'T'+String(h).padStart(2,'0')+':'))),base=times[0];
  const candidates=data.pipes.map(p=>{const valves=V.boundaryValves(data,p.id),seen=V.reachable(data,valves);return {pipe:p,valves,users:users.filter(u=>!seen.has(u.id)),isolated:!seen.has(p.start)&&!seen.has(p.end)};}).filter(c=>c.isolated&&c.valves.length&&c.users.length).sort((a,b)=>a.users.length-b.users.length||a.valves.length-b.valves.length||a.pipe.id.localeCompare(b.pipe.id));
  ensure(candidates.length,'当前拓扑没有可用的阀门隔离片区');
  const target=candidates[0],records=[];
  function scene(code,name,kind,edit,multi=false){
   const s=V.createScenario(next,kind,version,data,base);s.name=`标准${code} · ${name}`;s.reviewCode=code;s.calculationSamples=V.clone(multi?times:[base]);
   if(edit)edit(s);
   const saved=V.saveScene(next,s),jobs=V.submitBatch(next,saved,now);
   for(const job of jobs){const run=V.compute(job);next.runs.unshift(run);Object.assign(job,{status:'已完成',progress:100,runId:run.id,finishedAt:now});job.logs.push({time:now,text:'标准场景演示计算完成'});delete job.snapshot;}
   const record={code,name,sceneId:saved.id,kind,runIds:jobs.map(j=>j.runId)};records.push(record);return record;
  }
  scene('01','日常供水','hydraulic',null,true);
  scene('02','高峰需水调参','hydraulic',s=>{s.params.demand=Math.round(s.params.demand*1.35);for(const id in s.params.sources)s.params.sources[id]-=5;},true);
  let added;
  scene('03','水厂与用户扩建','hydraulic',s=>{const anchor=data.nodes.find(n=>n.id===target.pipe.start),plant=V.addNode(s,'plant',anchor.x+40,anchor.y-35),user=V.addNode(s,'user',anchor.x+65,anchor.y+30);plant.name='标准新增水厂';user.name='标准新增工业用户';V.addPipe(s,plant.id,anchor.id,400).name='标准水厂接入管';V.addPipe(s,anchor.id,user.id,200).name='标准用户支管';s.params.demand+=200;s.params.nodeDemands[user.id]=200;added={plant:plant.id,user:user.id};});
  scene('04','阀门隔离','valveAnalysis',s=>target.valves.forEach(id=>V.operation(s,'close',id)));
  scene('05','片区爆管','valveAnalysis',s=>V.operation(s,'burst',target.pipe.id,260));
  scene('06','持续泄漏','valveAnalysis',s=>V.operation(s,'leak',target.pipe.id,100));
  scene('07','爆管应急关阀','emergency',s=>{V.operation(s,'burst',target.pipe.id,260);V.emergency(s);});
  scene('08','末梢低余氯','qualityScenes',s=>{s.settings.chlorine=.35;s.settings.decay=.08;});
  scene('09','余氯调参改善','qualityScenes',s=>{s.settings.chlorine=.9;s.settings.decay=.025;});
  const qualityTarget=users.slice().sort((a,b)=>users.filter(u=>Math.hypot(u.x-b.x,u.y-b.y)<90).length-users.filter(u=>Math.hypot(u.x-a.x,u.y-a.y)<90).length)[0];
  scene('10','水质异常影响','qualityEvent',s=>{s.settings.target=qualityTarget.id;});
  const run=next.runs.find(r=>r.id===records.find(r=>r.code==='08').runIds[0]);
  const plan=V.plan(next,{name:'标准 · 末梢余氯采样复核',kind:'采样复核',runId:run.id,topology:version.id,hostId:run.findings.find(f=>f.reason==='低余氯')?.id||users[0].id,assignee:'管线巡检班',dueAt:new Date(now+86400000).toISOString(),instructions:'复核出厂及末梢余氯，记录采样时间、余氯值和现场情况；对比标准08与标准09计算结果。'});
  next.reviewPack={version:1,name:'片区供水与异常处置',createdAt:new Date(now).toISOString(),topology:V.clone(version),day,samples:V.clone(times),target:{pipeId:target.pipe.id,name:target.pipe.name,valves:target.valves,users:target.users.map(u=>u.id),qualityUser:qualityTarget.id},added,records,planId:plan.id};
  ensure(JSON.stringify(data)===source,'标准场景不能修改发布拓扑');return next;
 }
 return {create};
});
