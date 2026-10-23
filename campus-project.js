/* Imported campus topology and hypothetical DMA plan. No monitoring or solver samples. */
(function(root){
  'use strict';
  const D=root.CampusDataset;
  if(!D)return;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const is=data=>data?.sourceDataset===D.id;
  const pending='水源水头、节点需水量及真实监测数据待补充，当前仅建立拓扑与假定 DMA 分区，暂无水力或水质计算结果。';
  const date=D.project?.updated?.slice(0,10)||'2026-10-13';
  function store(){return {
    versions:[{id:D.topologyId,name:'上海技术学院 · 导入拓扑',status:'使用中',published:date}],
    bindings:[],bindingHistory:[],epochs:[{topology:D.topologyId,start:date,end:null}],
    dmaPlans:{[D.topologyId]:{activeId:'CAMPUS-DMA-PLAN-1',items:[{id:'CAMPUS-DMA-PLAN-1',name:'校园 DMA 五分区方案',zones:clone(D.snapshot.zones),created:date,updated:date,source:null,hypothetical:true}]}},
    sourceDataset:D.id,connectionRepair20260914:true,terminalRepair20260914:true,
    logisticsRepair20260914:true,northwestUsers20260914:true,versionCleanupT8:true,interiorUsers20260914:true
  };}
  function initialize(storage=root.localStorage){
    const values=[
      ['water-editor:'+D.projectId+':'+D.topologyId,D.snapshot],
      ['water-topology-store:'+D.projectId,store()],
      ['water-devices:'+D.projectId,[]],
      ['water-operations:v1:'+D.projectId,{...root.WaterOperations.empty(),seeded:true}]
    ];
    const changes=new Map(values.filter(([key])=>storage.getItem(key)===null).map(([key,value])=>[key,JSON.stringify(value)]));
    const read=key=>JSON.parse(changes.get(key)||storage.getItem(key));
    const geometry=root.DMAGeometry;
    if(geometry?.boundarySignature){
      const dataKey=values[0][0],storeKey=values[1][0],data=read(dataKey),catalog=read(storeKey);
      const revision=D.snapshot.metadata?.dmaLayoutRevision;
      if(revision&&data.metadata?.dmaLayoutRevision!==revision){
        const previous=D.snapshot.metadata.previousDMAMembership;
        const sameIds=(a,b)=>JSON.stringify([...(a||[])].sort())===JSON.stringify([...(b||[])].sort());
        const legacy=zones=>zones?.length===Object.keys(previous).length&&zones.every(z=>previous[z.id]&&sameIds(z.nodeIds,previous[z.id].nodeIds)&&sameIds(z.pipeIds,previous[z.id].pipeIds));
        const originalGeometry=D.snapshot.zones.every(z=>geometry.boundarySignature(data,z)===geometry.boundarySignature(D.snapshot,z));
        const upgrade=zones=>D.snapshot.zones.map(source=>{
          const saved=zones.find(z=>z.id===source.id);
          return saved?{...saved,...clone(source),name:saved.name,color:saved.color}:clone(source);
        });
        const bucket=catalog.dmaPlans?.[D.topologyId],active=bucket?.items.find(p=>p.id===bucket.activeId);
        if(originalGeometry&&legacy(data.zones)&&(!active||legacy(active.zones))){
          if(active){
            bucket.items.push({...clone(active),id:active.id+'-before-20261023',name:active.name+'（范围调整前）',layoutBackup:true});
            active.zones=upgrade(active.zones);
            if(active.name==='假定 DMA 四分区方案')active.name='校园 DMA 五分区方案';
            active.updated='2026-10-23';
          }
          data.zones=upgrade(data.zones);
          data.metadata={...data.metadata,...clone(D.snapshot.metadata)};
        }
      }
      const addBoundaries=zones=>{
        for(const zone of zones||[]){
          const source=D.snapshot.zones.find(z=>z.id===zone.id);
          // Only upgrade the unchanged imported membership/geometry. User edits stay intact.
          if(!source?.boundary||geometry.boundarySignature(data,zone)!==geometry.boundarySignature(D.snapshot,source))continue;
          const previous=D.snapshot.metadata?.previousBoundaryByZone?.[zone.id];
          const previousGenerated=previous&&JSON.stringify(zone.boundary)===JSON.stringify(previous);
          if(zone.boundary&&zone.boundarySignature===geometry.boundarySignature(data,zone)&&!previousGenerated)continue;
          for(const field of ['boundary','boundarySignature','boundaryMode','boundaryWidthM','boundaryRevision','boundaryAreaM2','boundaryPreviousAreaM2','boundaryAreaReductionPercent','boundaryWidthException','boundaryNote']){
            if(source[field]!==undefined)zone[field]=clone(source[field]);
          }
        }
      };
      addBoundaries(data.zones);
      for(const plan of catalog.dmaPlans?.[D.topologyId]?.items||[])if(!plan.layoutBackup)addBoundaries(plan.zones);
      if(data.zones.length===D.snapshot.zones.length&&data.zones.every(zone=>JSON.stringify(zone.boundary)===JSON.stringify(D.snapshot.zones.find(z=>z.id===zone.id)?.boundary))){
        data.metadata ||= {};
        for(const field of ['boundaryValidation','boundaryGeneration','previousBoundaryByZone']){
          if(D.snapshot.metadata[field])data.metadata[field]=clone(D.snapshot.metadata[field]);
        }
      }
      for(const [key,value] of [[dataKey,data],[storeKey,catalog]]){
        const json=JSON.stringify(value);if(json!==(changes.get(key)||storage.getItem(key)))changes.set(key,json);
      }
    }
    const written=[],original=new Map([...changes.keys()].map(key=>[key,storage.getItem(key)]));
    try{for(const [key,value] of changes){storage.setItem(key,value);written.push(key);}}
    catch(error){for(const key of written){const value=original.get(key);value===null?storage.removeItem(key):storage.setItem(key,value);}throw error;}
    return changes.size>0;
  }
  // The prototype's generic adapters fabricate examples; imported campus data must stay empty.
  const H=root.WaterHydraulics,V=root.WaterV2;
  for(const name of ['simulate','liveRun']){
    const original=H[name];
    H[name]=function(data,...args){if(is(data))throw Error(pending);return original.call(this,data,...args);};
  }
  const defaults=H.defaults,timeSeries=V.timeSeries,seed=V.seed;
  H.defaults=function(data){const params=defaults(data);return is(data)?{...params,demand:null,sources:Object.fromEntries(data.nodes.filter(n=>n.type==='plant').map(n=>[n.id,null])),nodeDemands:{},pattern:[]}:params;};
  V.timeSeries=function(topology,data,...args){return is(data)?[]:timeSeries.call(this,topology,data,...args);};
  V.seed=function(db,topology,data){if(!is(data))return seed.call(this,db,topology,data);};
  root.CampusProject={projectId:D.projectId,topologyId:D.topologyId,is,store,initialize,pending,snapshot:()=>clone(D.snapshot)};
})(globalThis);
