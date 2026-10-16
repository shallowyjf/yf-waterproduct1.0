/* Suizhou imported steady-result adapter. Never fabricates time series or reruns. */
(function(root){
 'use strict';
 const D=root.SuizhouDataset,H=root.WaterHydraulics,V=root.WaterV2,clone=v=>JSON.parse(JSON.stringify(v));
 const is=data=>data?.sourceDataset===D.id;
 const time=new Date(Date.parse(D.completedAt)+8*3600000).toISOString().slice(0,19)+'+08:00';
 const originalDefaults=H.defaults,originalLive=H.liveRun,originalComplete=H.complete,originalSeries=V.timeSeries;
 function params(data=D.snapshot){const p=originalDefaults(data);p.demand=D.demand;p.pattern=Array(24).fill(1);p.sources=Object.fromEntries(data.nodes.filter(n=>n.type==='plant').map(n=>[n.id,D.frame.nodes[n.id]?.head??n.elevation+50]));return p;}
 function sample(){return {id:D.topologyId+'@'+time,topology:D.topologyId,time,source:'随州计算 12152 · 完成时间',quality:'GOOD',demand:D.demand,sources:params().sources};}
 function baseline(){const frames=Array(10).fill(null);frames[9]=clone(D.frame);return {id:'SZ-RUN-12152',name:'随州管网 · 12152 稳态结果',sceneId:'SZ-BASELINE',domain:'hydraulic',kind:'hydraulic',revision:1,topology:D.topologyId,baseTopology:{id:D.topologyId,name:'随州管网 · 20260921',published:'2026-09-21'},snapshot:clone(D.snapshot),frames,availableHours:[9],availableMetrics:['pressure','flow','loss','velocity','age','head'],params:params(),inputs:[sample()],date:time.slice(0,10),calculationTime:time,createdAt:D.completedAt,engine:'EPANET 2.2 · 导入结果',solver:{name:'EPANET',version:'2.2'},importedDataset:D.id,provenance:clone(D.provenance),ports:clone(D.ports),sourceBoundaries:clone(D.sourceBoundaries),archiveSource:'导入结果',warnings:['迎宾大道泵站存在内部循环流','多个水源压力未同时约束'],settings:{startHour:9,duration:1},findings:H.analysis({snapshot:D.snapshot,frames},9,'pressure').map(r=>({...r,unit:'MPa',reason:'最不利点'}))};}
 function store(){return {versions:[{id:D.topologyId,name:'随州管网 · 20260921',status:'使用中',published:'2026-09-21'}],bindings:[],bindingHistory:[],epochs:[{topology:D.topologyId,start:'2026-09-21',end:null}],connectionRepair20260914:true,terminalRepair20260914:true,logisticsRepair20260914:true,northwestUsers20260914:true,versionCleanupT8:true,interiorUsers20260914:true};}
 function install(db){if(db.suizhouDataset===D.id)return false;const s=V.createScenario(db,'hydraulic',store().versions[0],D.snapshot,sample());Object.assign(s,{id:'SZ-BASELINE',name:'随州管网 · 基准方案',revision:1,params:params(),updatedAt:D.completedAt});if(!db.scenes.some(x=>x.id===s.id))db.scenes.push(s);if(!db.runs.some(x=>x.id==='SZ-RUN-12152'))db.runs.push(baseline());for(const [kind,name] of [['valveAnalysis','随州管网 · 操作分析'],['emergency','随州管网 · 应急预案']]){const sc=V.createScenario(db,kind,store().versions[0],D.snapshot,sample());Object.assign(sc,{id:'SZ-'+kind,name,revision:1,params:params(),updatedAt:D.completedAt});if(!db.scenes.some(x=>x.id===sc.id))db.scenes.push(sc);}db.jobs.push({id:'SZ-IMPORT-12152',sceneId:s.id,name:s.name,kind:'hydraulic',revision:1,calculationTime:time,status:'已完成',progress:100,submittedAt:Date.parse(D.completedAt),finishedAt:Date.parse(D.completedAt),runId:'SZ-RUN-12152',model:{name:'EPANET',version:'2.2'},checks:preflight(s),logs:[{time:Date.parse(D.completedAt),text:'导入计算 12152；5603 条管道全部匹配；有警告'}]});db.suizhouDataset=D.id;return true;}
 function preflight(s){
  if(V.quality(s.kind))throw Error('这套随州数据未包含水质计算结果');
  if(JSON.stringify(s.snapshot)!==JSON.stringify(D.snapshot)||JSON.stringify(s.params)!==JSON.stringify(params())||(s.operations||[]).length)throw Error('方案已变更，编辑可保存；当前仅有 12152 基准结果，尚无变更方案的计算结果');
  if(!s.calculationSamples?.length||s.calculationSamples.some(x=>x.time!==time))throw Error('仅有 '+time.slice(0,19).replace('T',' ')+' 的稳态结果');
  return [{name:'随州拓扑',status:'通过',value:'5539 点 / 5603 线'},{name:'结果匹配',status:'通过',value:'计算 12152 · 5603 / 5603 条管道'},{name:'结果状态',status:'有警告',value:'单次稳态 · 导入回放'}];
 }
 function compute(job){preflight(job.snapshot);return {...baseline(),id:V.id('SZ-REPLAY'),sceneId:job.snapshot.id,name:job.snapshot.name,revision:job.snapshot.revision,jobId:job.id,archiveSource:'基准结果回放'};}
 H.defaults=data=>is(data)?params(data):originalDefaults(data);
 H.liveRun=(data,topology,inputs,date)=>{if(!is(data))return originalLive(data,topology,inputs,date);if(JSON.stringify(data)!==JSON.stringify(D.snapshot))throw Error('拓扑已变更，暂无对应计算结果');return baseline();};
 H.complete=run=>run.importedDataset?run:originalComplete(run);
 V.timeSeries=(topology,data,published,now)=>is(data)?[{...sample(),topology}]:originalSeries(topology,data,published,now);
 root.SuizhouProject={is,baseline,params,sample,store,install,preflight,compute,projectId:D.projectId,topologyId:D.topologyId,snapshot:()=>clone(D.snapshot)};
})(globalThis);
