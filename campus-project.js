/* Imported campus topology and hypothetical DMA plan. No monitoring or solver samples. */
(function(root){
  'use strict';
  const D=root.CampusDataset;
  if(!D)return;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const is=data=>data?.sourceDataset===D.id;
  const pending='水源边界、水源水头、节点需水量及真实监测数据待补充，当前仅建立拓扑，暂无水力或水质计算结果。';
  const date=D.project?.updated?.slice(0,10)||'2026-10-13';
  const revision=D.snapshot.metadata?.topologyRevision;
  const dmaRevision=revision?D.snapshot.metadata?.dmaLayoutRevision:null;
  const planName=dmaRevision?(D.snapshot.metadata.dmaPlanName||'校园 DMA 四分区方案（2026-10-27）'):revision?'最新拓扑 · DMA分区待复核':'校园 DMA 五分区方案';
  const planId=dmaRevision?'CAMPUS-DMA-PLAN-'+dmaRevision:'CAMPUS-DMA-PLAN-1';
  const dmaFields=['dmaLayoutRevision','dmaLayoutUpdatedAt','dmaPlanName','dmaPartitionDefinition','dmaBoundaryNodeOwnership','sharedNodeIds','sharedPipeIds','sharedSourcePipeIds','sharedNote','dmaStatus','boundaryGeneration','boundaryValidation','boundaryMeterPlans','monitoringPlan'];
  const dmaBackupKey=()=> 'water-campus-dma-backup:'+D.projectId+':'+D.topologyId+':before-'+dmaRevision;
  const dmaBackup=(snapshot,catalog)=>({id:dmaBackupKey(),kind:'dma-layout',created:date,replacedBy:dmaRevision,topologyId:D.topologyId,
    zones:clone(snapshot.zones||[]),metadata:clone(snapshot.metadata||{}),planBucket:clone(catalog.dmaPlans?.[D.topologyId]||null)});
  const durableBackups=new Map();
  let preparationError=null;
  function decodeSnapshot(raw){
    const value=typeof raw==='string'?JSON.parse(raw):raw;
    if(!value?.campusBackupId)return value;
    const backup=durableBackups.get(value.campusBackupId);
    if(!backup)throw Error('更新前拓扑备份尚未读取，请刷新页面后重试');
    return clone(backup.snapshot);
  }
  async function prepareStorage(storage=root.localStorage,indexedDB=root.indexedDB){
    if(!revision||!indexedDB)return;
    let db;
    try{
      db=await new Promise((resolve,reject)=>{
        const request=indexedDB.open('water-campus-archives-v1',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('backups',{keyPath:'id'});
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error||Error('无法打开拓扑备份库'));
        request.onblocked=()=>reject(Error('拓扑备份库被其他窗口占用，请关闭旧窗口后重试'));
      });
      const records=await new Promise((resolve,reject)=>{
        const request=db.transaction('backups','readonly').objectStore('backups').getAll();
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });
      for(const record of records)durableBackups.set(record.id,record);
      preparationError=null;
      const raw=storage.getItem('water-editor:'+D.projectId+':'+D.topologyId);
      if(!raw)return;
      const snapshot=decodeSnapshot(raw);
      const read=(key,fallback)=>{const value=storage.getItem(key);return value===null?fallback:JSON.parse(value);};
      const catalog=read('water-topology-store:'+D.projectId,store());
      const sameTopology=snapshot.metadata?.topologyRevision===revision;
      if(sameTopology&&(!dmaRevision||snapshot.metadata?.dmaLayoutRevision===dmaRevision))return;
      const id=sameTopology?dmaBackupKey():'water-campus-backup:'+D.projectId+':before-'+revision;
      if(durableBackups.has(id))return;
      const record=sameTopology?dmaBackup(snapshot,catalog):{id,created:date,replacedBy:revision,snapshot,
        catalog,
        devices:read('water-devices:'+D.projectId,[]),
        operations:read('water-operations:v1:'+D.projectId,{...root.WaterOperations.empty(),seeded:true})};
      // Wait for the transaction commit, not merely the add request. A failed
      // persistent backup must leave every existing localStorage value intact.
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('backups','readwrite'),objects=tx.objectStore('backups'),existing=objects.get(id);
        existing.onsuccess=()=>{if(existing.result)durableBackups.set(id,existing.result);else objects.add(record);};
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('拓扑备份写入失败'));tx.onabort=()=>reject(tx.error||Error('拓扑备份事务已取消'));
      });
      if(!durableBackups.has(id))durableBackups.set(id,record);
      preparationError=null;
    }catch(error){preparationError=error;throw error;}
    finally{db?.close();}
  }
  function store(){return {
    versions:[{id:D.topologyId,name:revision?'上海技术学院 · 2026-10-26最新拓扑':'上海技术学院 · 导入拓扑',status:'使用中',published:date}],
    bindings:[],bindingHistory:[],epochs:[{topology:D.topologyId,start:date,end:null}],
    dmaPlans:{[D.topologyId]:{activeId:planId,items:[{id:planId,name:planName,zones:clone(D.snapshot.zones),created:date,updated:date,source:null,hypothetical:true,...(dmaRevision?{dmaLayoutRevision:dmaRevision,definitionSource:D.snapshot.metadata.dmaPartitionDefinition?.definitionSource||'user'}:{})}]}},
    sourceDataset:D.id,connectionRepair20260914:true,terminalRepair20260914:true,
    logisticsRepair20260914:true,northwestUsers20260914:true,versionCleanupT8:true,interiorUsers20260914:true
  };}
  function initialize(storage=root.localStorage){
    if(preparationError)return false;
    const values=[
      ['water-editor:'+D.projectId+':'+D.topologyId,D.snapshot],
      ['water-topology-store:'+D.projectId,store()],
      ['water-devices:'+D.projectId,[]],
      ['water-operations:v1:'+D.projectId,{...root.WaterOperations.empty(),seeded:true}]
    ];
    const changes=new Map(values.filter(([key])=>storage.getItem(key)===null).map(([key,value])=>[key,JSON.stringify(value)]));
    const read=key=>JSON.parse(changes.get(key)||storage.getItem(key));
    if(revision){
      const dataKey=values[0][0],storeKey=values[1][0],data=read(dataKey),catalog=read(storeKey);
      if(data.metadata?.topologyRevision!==revision){
        // This user-authorized replacement keeps an exact recoverable copy of
        // the previous local topology and every plan/binding before activating it.
        const archiveId=D.topologyId+'-before-'+revision;
        const archiveKey='water-editor:'+D.projectId+':'+archiveId;
        const backupKey='water-campus-backup:'+D.projectId+':before-'+revision;
        const durable=durableBackups.get(backupKey);
        const reference={campusBackupId:backupKey,storage:'indexeddb:water-campus-archives-v1',archiveId};
        if(storage.getItem(archiveKey)===null)changes.set(archiveKey,JSON.stringify(durable?reference:data));
        if(storage.getItem(backupKey)===null)changes.set(backupKey,JSON.stringify(durable?reference:{
          created:date,replacedBy:revision,snapshot:data,catalog,
          devices:read(values[2][0]),operations:read(values[3][0])
        }));
        const next=clone(catalog),fresh=store();
        next.versions ||= [];
        if(!next.versions.some(v=>v.id===archiveId))next.versions.push({id:archiveId,name:'上海技术学院 · 更新前拓扑备份',status:'已归档',published:date,sourceRevision:data.metadata?.topologyRevision||data.sampleRevision});
        next.versions=next.versions.map(v=>v.id===D.topologyId?{...v,...fresh.versions[0]}:v);
        if(!next.versions.some(v=>v.id===D.topologyId))next.versions.unshift(fresh.versions[0]);
        next.dmaPlans ||= {};
        if(next.dmaPlans[D.topologyId]&&!next.dmaPlans[archiveId])next.dmaPlans[archiveId]=clone(next.dmaPlans[D.topologyId]);
        next.dmaPlans[D.topologyId]=fresh.dmaPlans[D.topologyId];
        // Even unchanged IDs can have changed meaning. Old bindings belong to
        // the archived version until users explicitly bind the new topology.
        next.bindings=(next.bindings||[]).map(b=>b.key?.split('|')[0]===D.topologyId?{...b,key:[archiveId,...b.key.split('|').slice(1)].join('|'),archivedForReplacement:revision}:b);
        next.bindingHistory=(next.bindingHistory||[]).map(b=>b.key?.split('|')[0]===D.topologyId?{...b,key:[archiveId,...b.key.split('|').slice(1)].join('|'),archivedForReplacement:revision}:b);
        next.epochs=(next.epochs||[]).map(e=>e.topology===D.topologyId?{...e,topology:archiveId,end:e.end||date}:e);
        next.epochs.push({topology:D.topologyId,start:date,end:null});
        next.sourceDataset=D.id;
        next.topologyRevision=revision;
        changes.set(dataKey,JSON.stringify(D.snapshot));
        changes.set(storeKey,JSON.stringify(next));
      }
    }
    if(revision&&dmaRevision){
      const dataKey=values[0][0],storeKey=values[1][0],data=read(dataKey),catalog=read(storeKey);
      if(data.metadata?.topologyRevision===revision&&data.metadata?.dmaLayoutRevision!==dmaRevision){
        // A layout update must never replace edited nodes/pipes, device bindings,
        // other topology versions or custom DMA plans. Save the previous layout
        // separately from the much larger original topology backup.
        const backupKey=dmaBackupKey(),durable=durableBackups.get(backupKey);
        if(storage.getItem(backupKey)===null)changes.set(backupKey,JSON.stringify(durable?
          {campusDMABackupId:backupKey,storage:'indexeddb:water-campus-archives-v1',topologyId:D.topologyId}:
          dmaBackup(data,catalog)));
        data.zones=clone(D.snapshot.zones);
        data.metadata ||= {};
        for(const key of dmaFields){
          if(Object.hasOwn(D.snapshot.metadata,key))data.metadata[key]=clone(D.snapshot.metadata[key]);
        }
        data.metadata.dmaLayoutBackup={key:backupKey,storage:durable?'indexeddb:water-campus-archives-v1':'localStorage'};
        catalog.dmaPlans ||= {};
        const bucket=catalog.dmaPlans[D.topologyId] ||= {activeId:null,items:[]};
        bucket.items ||= [];
        const fresh=clone(store().dmaPlans[D.topologyId].items[0]);
        // Retain every existing plan, including a formerly active custom plan.
        // Avoid overwriting an existing ID if a user happened to create it.
        const baseId=fresh.id;let suffix=2;
        while(bucket.items.some(item=>item.id===fresh.id))fresh.id=baseId+'-'+suffix++;
        bucket.items.push(fresh);bucket.activeId=fresh.id;
        changes.set(dataKey,JSON.stringify(data));
        changes.set(storeKey,JSON.stringify(catalog));
      }
    }
    const geometry=root.DMAGeometry;
    if(geometry?.boundarySignature&&!revision){
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
    // Shrinking the current snapshot first frees room on nearly full sites.
    // The durable backup is already committed before any browser write occurs.
    const ordered=[...changes].sort(([a,av],[b,bv])=>(av.length-(original.get(a)?.length||0))-(bv.length-(original.get(b)?.length||0)));
    try{for(const [key,value] of ordered){storage.setItem(key,value);written.push(key);}}
    catch(error){
      for(const key of written)if(original.get(key)===null)storage.removeItem(key);
      const restore=written.filter(key=>original.get(key)!==null).sort((a,b)=>(original.get(a).length-(storage.getItem(a)?.length||0))-(original.get(b).length-(storage.getItem(b)?.length||0)));
      for(const key of restore)storage.setItem(key,original.get(key));
      throw error;
    }
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
  root.CampusProject={projectId:D.projectId,topologyId:D.topologyId,is,store,initialize,prepareStorage,decodeSnapshot,pending,snapshot:()=>clone(D.snapshot)};
})(globalThis);
