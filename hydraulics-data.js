(function(root,factory){const api=factory();root.WaterHydraulics=api;if(typeof module==='object'&&module.exports)module.exports=api;})(globalThis,function(){
  'use strict';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const check=(ok,msg)=>{if(!ok)throw Error(msg);};
  const metrics={pressure:{name:'压力',unit:'MPa',scope:'nodes'},flow:{name:'流量',unit:'m³/h',scope:'pipes'},loss:{name:'管损',unit:'m',scope:'pipes'},velocity:{name:'流速',unit:'m/s',scope:'pipes'},age:{name:'水龄',unit:'h',scope:'nodes'},head:{name:'水头',unit:'m',scope:'nodes'}};
  Object.defineProperties(metrics,{chlorine:{value:{name:'余氯',unit:'mg/L',scope:'nodes'}},source:{value:{name:'水源占比',unit:'%',scope:'nodes'}},tracer:{value:{name:'异常示踪',unit:'%',scope:'nodes'}}});
  const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  function defaults(data){return {demand:2400,roughness:120,initialAge:0,warmup:48,pattern:[.65,.55,.5,.5,.6,.8,1.2,1.5,1.35,1.1,1,.95,1.1,1,.95,1,1.15,1.4,1.5,1.35,1.1,.95,.8,.7],sources:Object.fromEntries(data.nodes.filter(n=>n.type==='plant').map(n=>[n.id,+(+n.elevation+50).toFixed(2)])),nodeDemands:{},pipeSettings:{}};}
  function validate(data,p){
    check(data?.nodes?.length&&data?.pipes?.length,'拓扑须包含节点和管线');
    const ns=new Map(data.nodes.map(n=>[n.id,n]));check(ns.size===data.nodes.length,'节点编号重复');
    check(new Set(data.pipes.map(n=>n.id)).size===data.pipes.length,'管线编号重复');
    for(const n of data.nodes)check([n.elevation,n.x,n.y].every(v=>Number.isFinite(+v)),`${n.id} 缺少有效高程或坐标`);
    check(Number.isFinite(+p.demand)&&+p.demand>0&&+p.demand<=100000,'基准总需水量须大于 0 且不超过 100000 m³/h');
    check(+p.roughness>=20&&+p.roughness<=200,'Hazen–Williams C 值须为 20–200');
    check(+p.initialAge>=0&&+p.initialAge<=720,'初始水龄须为 0–720 小时');
    check([0,24,48,72,168].includes(+p.warmup),'请选择有效预热时长');
    check(p.pattern?.length===24&&p.pattern.every(v=>Number.isFinite(+v)&&+v>=0&&+v<=5)&&p.pattern.some(v=>+v>0),'需水曲线必须包含 24 个 0–5 倍率，且不能全为 0');
    const sources=Object.keys(p.sources||{});check(sources.length,'至少配置一个定水头水源');
    for(const id of sources){check(ns.has(id)&&ns.get(id).type==='plant',`水源 ${id} 不存在或不是水厂`);check(Number.isFinite(+p.sources[id])&&+p.sources[id]>+ns.get(id).elevation&&+p.sources[id]<1000,`${id} 水源总水头应高于高程且小于 1000 m`);}
    const users=data.nodes.filter(n=>n.type==='user');check(users.length,'拓扑没有用户节点，不能分配需水量');
    for(const [id,v] of Object.entries(p.nodeDemands||{})){check(users.some(n=>n.id===id),`需水节点 ${id} 不存在`);check(Number.isFinite(+v)&&+v>=0,`${id} 需水量须为非负数`);}
    const overrides=Object.values(p.nodeDemands||{}).reduce((a,b)=>a+(+b),0);check(overrides<=+p.demand,'单点需水量合计不能超过基准总需水量');
    const rest=users.filter(n=>!(n.id in (p.nodeDemands||{})));check(rest.length||Math.abs(overrides-p.demand)<1e-6,'所有用户均指定需水时，其合计须等于总需水量');
    for(const id of Object.keys(p.pipeSettings||{}))check(data.pipes.some(p=>p.id===id),`参数中的管线 ${id} 已不存在`);
    const graph=new Map(data.nodes.map(n=>[n.id,[]]));
    for(const pipe of data.pipes){
      const s=p.pipeSettings?.[pipe.id]||{};
      check(ns.has(pipe.start)&&ns.has(pipe.end)&&pipe.start!==pipe.end,`${pipe.id} 的起终点无效`);
      check(Number.isFinite(+pipe.length)&&+pipe.length>0,`${pipe.id} 缺少有效管长`);
      check(+(s.diameter??pipe.diameter)>0&&+(s.diameter??pipe.diameter)<=5000,`${pipe.id} 管径须为 0–5000 mm`);
      check(+(s.roughness??p.roughness)>=20&&+(s.roughness??p.roughness)<=200,`${pipe.id} C 值须为 20–200`);
      if(!s.closed){graph.get(pipe.start).push(pipe.end);graph.get(pipe.end).push(pipe.start);}
    }
    const seen=new Set(sources),queue=[...sources];for(let i=0;i<queue.length;i++)for(const n of graph.get(queue[i]))if(!seen.has(n)){seen.add(n);queue.push(n);}
    const isolated=data.nodes.filter(n=>!seen.has(n.id));check(!isolated.length,`存在 ${isolated.length} 个无法连接水源的节点：${isolated.slice(0,5).map(n=>n.id).join('、')}。请检查拓扑或关管设置。`);
    return true;
  }
  // Deterministic visual demo, deliberately not a hydraulic solver.
  function simulate(data,p,date=today()){
    validate(data,p);
    const source=Object.values(p.sources).reduce((a,b)=>a+Number(b),0)/Object.keys(p.sources).length;
    const frames=Array.from({length:24},(_,hour)=>{
      const factor=+p.pattern[hour]*(+p.demand/2400),nodes={},pipes={};
      data.nodes.forEach((n,i)=>{const distance=(Number(n.x)+Number(n.y)) / 1500;
        const head=source-3-distance*14*factor*(120/+p.roughness);
        nodes[n.id]={head,pressure:Math.max(0,(head-Number(n.elevation))*.00980665),age:n.type==='plant'?0:+p.initialAge+distance*18/(.3+factor)};
      });
      data.pipes.forEach((n,i)=>{const diameter=+(p.pipeSettings?.[n.id]?.diameter??n.diameter),flow=p.pipeSettings?.[n.id]?.closed?0:factor*(80+(i*37)%450),velocity=flow/3600/(Math.PI*(diameter/2000)**2);
        pipes[n.id]={flow,velocity,loss:flow?Math.abs(nodes[n.start].head-nodes[n.end].head)+velocity*.35:0};
      });return {hour,nodes,pipes};
    });return {date,createdAt:new Date().toISOString(),engine:'交互演示 · 模拟数据',frames,warnings:['模拟结果仅用于产品功能展示，不作为调度依据。']};
  }
  function empty(){return {version:1,sandboxes:[],live:null};}
  function save(db,input,data){
    check(input.name?.trim(),'请输入沙箱名称');check(!db.sandboxes.some(s=>s.id!==input.id&&s.name===input.name.trim()),'沙箱名称已存在');validate(data,input.params);
    const old=db.sandboxes.find(s=>s.id===input.id);check(!input.id||old,'沙箱不存在');
    const sandbox={id:old?.id||`HYD-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name:input.name.trim(),topology:input.topology,snapshot:clone(data),params:clone(input.params),revision:(old?.revision||0)+1,updatedAt:new Date().toISOString(),runs:old?.runs||[]};
    if(old)db.sandboxes[db.sandboxes.indexOf(old)]=sandbox;else db.sandboxes.push(sandbox);return sandbox;
  }
  function saveRun(db,sandboxId,result,revision){const s=db.sandboxes.find(s=>s.id===sandboxId);check(s&&s.revision===revision,'计算期间沙箱已被修改，结果未覆盖，请重新计算');const run={...clone(result),id:`RUN-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,revision,topology:s.topology,snapshot:clone(s.snapshot),params:clone(s.params)};s.runs.unshift(run);return run;}
  function range(run,metric){const scope=metrics[metric].scope,values=run.frames.filter(f=>f&&(!run.availableHours||run.availableHours.includes(f.hour))).flatMap(f=>Object.values(f[scope]).map(v=>v[metric])).filter(Number.isFinite);return values.length?[Math.min(...values),Math.max(...values)]:[0,1];}
  function color(value,min,max){if(!Number.isFinite(value))return '#b4bdc9';const t=max===min?.5:Math.max(0,Math.min(1,(value-min)/(max-min)));return `hsl(${240*(1-t)} 100% 50%)`;}
  function complete(run){
    // Derived fields also support results saved before the object ledger existed.
    for(const f of run.frames){
      for(const p of run.snapshot.pipes){const a=f.nodes[p.start],b=f.nodes[p.end],r=f.pipes[p.id];if(r&&a&&b)r.age=(a.age+b.age)/2;}
      for(const n of run.snapshot.nodes){const incident=run.snapshot.pipes.filter(p=>p.start===n.id||p.end===n.id);const incoming=incident.reduce((v,p)=>{const q=f.pipes[p.id]?.flow||0;return v+Math.max(0,p.end===n.id?q:-q);},0),outgoing=incident.reduce((v,p)=>{const q=f.pipes[p.id]?.flow||0;return v+Math.max(0,p.start===n.id?q:-q);},0);if(f.nodes[n.id])f.nodes[n.id].flow=Math.max(incoming,outgoing);}
    }return run;
  }
  function liveRun(snapshot,topology,inputs,date=today()){
    const params=defaults(snapshot),valid=inputs.filter(m=>Number.isFinite(m.numeric)&&['GOOD','PARTIAL'].includes(m.quality)&&snapshot.nodes.concat(snapshot.pipes).some(n=>n.id===m.hostId));
    const sourceFlows=valid.filter(m=>m.type==='flow'&&snapshot.pipes.some(p=>p.id===m.hostId&&snapshot.nodes.some(n=>n.id===p.start&&n.type==='plant')));
    if(sourceFlows.length)params.demand=Math.max(1,Math.min(100000,sourceFlows.reduce((a,m)=>a+Math.abs(m.numeric),0)));
    valid.filter(m=>m.type==='pressure').forEach(m=>{const n=snapshot.nodes.find(n=>n.id===m.hostId&&n.type==='plant');if(n)params.sources[n.id]=+n.elevation+m.numeric/.00980665;});
    const run={...simulate(snapshot,params,date),id:'LIVE-'+date,topology,snapshot:clone(snapshot),params,inputs:clone(inputs)};
    for(const f of run.frames)for(const m of valid){const n=snapshot.nodes.find(n=>n.id===m.hostId),p=snapshot.pipes.find(p=>p.id===m.hostId);if(m.type==='pressure'&&n){f.nodes[n.id].pressure=m.numeric;f.nodes[n.id].head=+n.elevation+m.numeric/.00980665;}if(m.type==='flow'&&p){f.pipes[p.id].flow=m.numeric*params.pattern[f.hour];f.pipes[p.id].velocity=Math.abs(f.pipes[p.id].flow)/3600/(Math.PI*(p.diameter/2000)**2);}}
    return complete(run);
  }
  const palette=['#244bff','#00bde8','#40d46a','#ffd43b','#f04438'];
  function intervals(run,metric,config){
    if(config){check(config.edges?.length===6&&config.colors?.length===5,'请配置 5 个连续区间');check(config.edges.every(Number.isFinite)&&config.edges.every((v,i)=>i===0||v>config.edges[i-1]),'区间边界必须为递增数值');check(config.colors.every(c=>/^#[0-9a-f]{6}$/i.test(c)),'颜色格式无效');return clone(config);}
    let [min,max]=range(run,metric);if(min===max)max=min+1;
    const step=(max-min)/5,precision=step>=.01?3:6;return {edges:Array.from({length:6},(_,i)=>+(min+step*i).toFixed(precision)),colors:[...palette]};
  }
  function bandColor(value,config){if(!Number.isFinite(value))return '#b4bdc9';let i=config.edges.slice(1).findIndex(v=>value<v);if(i<0)i=4;return config.colors[i];}
  function analysis(run,hour,metric,threshold,mode='top10'){
    const frame=run.frames[hour],users=run.snapshot.nodes.filter(n=>n.type==='user');
    const source=['loss','velocity'].includes(metric)?run.snapshot.pipes:users;
    let rows=source.map(n=>{let value=frame[metrics[metric].scope][n.id]?.[metric];
      if(metric==='flow'&&run.importedDataset)value=frame.nodes[n.id].flow;
      else if(metric==='flow')value=run.snapshot.pipes.filter(p=>p.start===n.id||p.end===n.id).reduce((a,p)=>a+Math.abs(frame.pipes[p.id]?.flow||0),0);
      return {id:n.id,name:n.name||n.id,value};
    }).filter(r=>Number.isFinite(r.value));
    const ascending=['pressure','head','chlorine'].includes(metric);rows.sort((a,b)=>(ascending?a.value-b.value:b.value-a.value)||a.id.localeCompare(b.id));
    if(['loss','velocity'].includes(metric)||(metric==='age'&&mode==='threshold'))return rows.filter(r=>r.value>threshold);
    if(metric==='chlorine')return rows.filter(r=>r.value<(threshold??.2));
    if(['source','tracer'].includes(metric))return rows.filter(r=>r.value>(threshold??0));
    if(metric==='head')return rows.filter(r=>r.value<threshold);
    return rows.slice(0,10);
  }
  return {complete,liveRun,intervals,bandColor,analysis,palette,clone,metrics,today,defaults,validate,simulate,empty,save,saveRun,range,color};
});
