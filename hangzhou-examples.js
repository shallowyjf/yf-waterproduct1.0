/* Additive, once-only Hangzhou product 1.0 review data. All readings are examples. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./standard-product.js'),require('./operations.js'));else root.HangzhouExamples=factory(root.WaterStandard,root.WaterOperations);})(typeof window==='object'?window:globalThis,function(S,O){
  'use strict';
  const revision='hangzhou-standard-20261009',projectId='PRJ-001';
  const local=time=>new Date(time+8*3600000).toISOString().slice(0,19).replace('T',' ');
  const date=time=>local(time).slice(0,10),num=v=>+v.toFixed(3);
  function build(input){
    const pack=S.copy(input),{data,store,devices,operations:db,standard}=pack;
    if(store.hangzhouExamples?.revision===revision)return {...pack,changed:false};
    const now=input.now||Date.now(),source=store.versions.find(v=>v.status==='使用中');
    if(!source)throw Error('杭州示例缺少在用拓扑');
    const version='T'+(Math.max(0,...store.versions.map(v=>Number(v.id.slice(1))||0))+1);
    const stamp=local(now),start=local(now-6*86400000).slice(0,10)+'T00:00',end=local(now).slice(0,10)+'T23:59';
    const occupied=new Set([...data.nodes,...data.pipes,...data.zones,...devices].map(o=>o.id));
    const claim=id=>{if(occupied.has(id))throw Error('示例编号与已有对象冲突：'+id);occupied.add(id);return id;};
    const candidates=data.nodes.filter(n=>n.type==='valve');if(candidates.length<3)throw Error('杭州示例至少需要三个阀门');
    const valves=['CITY-V-016','CITY-V-023','CITY-V-036'].map((id,i)=>data.nodes.find(n=>n.id===id&&n.type==='valve')||candidates[i]);
    const locations=['文教路学校东门','中心大道商贸路口','南城大道消防站'];
    const hydrants=valves.map((v,i)=>{
      const h={id:claim('HZ-HYDRANT-00'+(i+1)),type:'user',userSubtype:'FIRE_HYDRANT',name:locations[i]+'消火栓',x:v.x+14+i*4,y:v.y-30,elevation:v.elevation,diameter:100};
      const p={id:claim('HZ-HYDRANT-PIPE-00'+(i+1)),type:'pipe',name:locations[i]+'消防支管',start:v.id,end:h.id,a:{x:v.x,y:v.y},b:{x:h.x,y:h.y},diameter:100,length:48+i*12,material:'球墨铸铁',startElevation:v.elevation,endElevation:h.elevation};
      data.nodes.push(h);data.pipes.push(p);data.zones.filter(z=>z.nodeIds.includes(v.id)).forEach(z=>{z.nodeIds.push(h.id);z.pipeIds.push(p.id);});return h;
    });
    const parent=data.zones.find(z=>z.nodeIds.includes(valves[0].id));
    if(parent){
      const ids=[valves[0].id,hydrants[0].id,...parent.nodeIds.filter(id=>id!==valves[0].id&&id!==hydrants[0].id).slice(0,3)];
      const pipes=data.pipes.filter(p=>ids.includes(p.start)&&ids.includes(p.end)).map(p=>p.id);
      for(const [id,name,parentId] of [['HZ-DMA-WENJIAO','文教路片区',parent.id],['HZ-DMA-CAMPUS','文教路学校小区','HZ-DMA-WENJIAO']])data.zones.push({id:claim(id),name,type:'zone',parent:parentId,nodeIds:[...ids],pipeIds:[...pipes]});
    }
    const defs=[
      ['HZ-RTU-001','rtu','文教路 RTU','',null,'在线'],['HZ-RTU-002','rtu','南城 RTU','',null,'离线'],
      ['HZ-NOISE-001','noise','文教路阀门噪声仪',valves[0].id,38,'在线'],['HZ-NOISE-002','noise','商贸路阀门噪声仪',valves[1].id,69,'在线'],['HZ-NOISE-003','noise','南城阀门噪声仪',valves[2].id,null,'离线'],
      ['HZ-FIRE-001','hydrant',hydrants[0].name,hydrants[0].id,.32,'在线'],['HZ-FIRE-002','hydrant',hydrants[1].name,hydrants[1].id,.16,'在线'],['HZ-FIRE-003','hydrant',hydrants[2].name,hydrants[2].id,.29,'在线'],
      ['HZ-METER-001','valveMeter','学校进水阀控水表',data.pipes.find(p=>p.start===valves[0].id||p.end===valves[0].id).id,26,'在线'],
      ['HZ-METER-002','valveMeter','南城消防阀控水表',data.pipes.find(p=>p.start===valves[2].id||p.end===valves[2].id).id,null,'离线'],
      ['HZ-WATER-001','waterMeter','商贸片区计量水表',data.pipes.find(p=>p.start===valves[1].id||p.end===valves[1].id).id,83,'在线']
    ];
    const added=defs.map(([id,type,name,hostId,value,online],index)=>{
      claim(id);const [,metric,unit]=S.types[type],samples=[];
      for(let h=167;h>=0;h--){const time=local(now-h*3600000),missing=online==='离线'&&h<8,quality=missing?'MISSING':'GOOD';
        const base=value??(type==='noise'?42:type==='rtu'?0:18),v=type==='rtu'?(missing?'离线':'在线'):missing?null:num(base*(1+.07*Math.sin(h/3+index)));
        samples.push({time,metric,value:h===0&&type!=='rtu'?value:v,unit,quality});
        if(type==='hydrant')samples.push({time,metric:'outflow',value:id==='HZ-FIRE-003'&&h<5?'出水':h%24===10?'出水':'关闭',unit:'',quality});
        if(['valveMeter','waterMeter'].includes(type)){samples.push({time,metric:'volume',value:missing?null:num(12000+(167-h)*(base||18)),unit:'m³',quality});if(type==='valveMeter')samples.push({time,metric:'valve',value:missing?'未知':'开启',unit:'',quality});}
      }
      const d={id,type,name,hostId,metric,unit,value:type==='rtu'?online:value,online,status:'启用',quality:online==='离线'?'MISSING':'GOOD',location:locations[index%3],interval:300,sampleTime:stamp,lastCommunication:local(now-(online==='离线'?8*3600000:0)),samples,source:'杭州标准示例',alarmEnabled:type==='hydrant',outflow:type==='hydrant'?(id==='HZ-FIRE-003'?'出水':'关闭'):undefined,valvePosition:type==='valveMeter'?(online==='离线'?'未知':'开启'):undefined};
      if(type!=='rtu')d.rtuId=online==='离线'?'HZ-RTU-002':'HZ-RTU-001';return d;
    });devices.push(...added);
    const baseline=store.bindings.filter(b=>b.key.split('|')[0]===source.id).map(b=>({...S.copy(b),key:[version,...b.key.split('|').slice(1)].join('|'),inheritedFrom:source.id}));store.bindings.push(...baseline);
    added.filter(d=>d.hostId).forEach(d=>store.bindings.push({key:[version,d.hostId,d.metric].join('|'),devices:[d.id],rule:'average',revision:1,start:stamp}));
    const alarm=(device,event,ago)=>S.alarm(db,added.find(d=>d.id===device),added.find(d=>d.id===device).hostId,version,{id:'HZ-'+event,name:event,abnormal:true,value:event,time:new Date(now-ago).toISOString()});
    const low=alarm('HZ-FIRE-002','设备低压告警',3600000),flow=alarm('HZ-FIRE-003','设备持续出水告警',4*3600000),closed=alarm('HZ-FIRE-001','设备电量异常（已恢复）',2*86400000);
    const order=(name,hostId,extras={})=>O.createOrder(db,{name,hostId,topology:version,assignee:'管线巡检班',priority:'普通',instructions:'杭州标准示例：核查现场设备、计量与用水记录，并填写处理结果。',dueAt:new Date(now+2*86400000).toISOString(),sample:true,...extras},data);
    order('商贸路消火栓低压核查',hydrants[1].id,{alarmId:low.id,priority:'紧急'});
    O.alarmAction(db,flow.id,'ack');const inProgress=order('南城消火栓持续出水核查',hydrants[2].id,{alarmId:flow.id});O.transition(db,inProgress.id,'dispatch',{assignee:'城南运维班'});O.transition(db,inProgress.id,'accept');
    O.alarmAction(db,closed.id,'ack');const completed=order('学校消火栓电量维护',hydrants[0].id,{alarmId:closed.id});O.transition(db,completed.id,'dispatch',{assignee:'机电维护班'});O.transition(db,completed.id,'accept');O.transition(db,completed.id,'submit',{note:'示例：完成电池更换，设备通信恢复。'});O.transition(db,completed.id,'approve',{note:'示例：复核通过。'});O.alarmAction(db,closed.id,'recover','示例：设备恢复事件');O.alarmAction(db,closed.id,'close','示例：维护验收完成');
    O.saveTask(db,{name:'学校消火栓与阀门日巡检',stops:[valves[0].id,hydrants[0].id],frequency:'day',interval:1,hours:8,nextAt:new Date(now-3600000).toISOString(),assignee:'管线巡检班',instructions:'核对噪声仪通信、消火栓压力与出水状态，检查阀门及消防支管。',accessConfirmed:true,sample:true},data,version);
    standard.balances||=[];standard.reports||=[];standard.imports||=[];
    standard.rule||={lossRate:12,nightFlow:20,revision:1,source:'杭州标准示例'};
    const balances=[];data.zones.forEach((z,i)=>{for(let day=6;day>=0;day--){const r={id:`HZ-BAL-${i}-${day}`,topology:version,zoneId:z.id,zoneName:z.name,date:date(now-day*86400000),inlet:1200+i*100,outlet:200,storage:20,billed:925+i*92-day*4,unbilled:20,night:8+i*2,quality:'GOOD',source:'杭州标准示例'};
      if(i===1||z.id==='HZ-DMA-CAMPUS'){r.billed-=170+day*5;r.night=31+day;}
      if(i===2&&day===0){r.unbilled='';r.quality='MISSING';}
      if(i===3&&day===0)r.billed=r.inlet+100;
      balances.push(r);
    }});standard.balances.push(...balances);
    const finding=balances.find(r=>r.zoneId==='HZ-DMA-CAMPUS'&&r.date===date(now))||balances.find(r=>S.diagnose([r],standard.rule)[0].assessment==='疑似异常');
    if(finding){finding.review='已核对抄表周期，待现场复核夜间用水与噪声变化。';finding.orderId=order(finding.zoneName+'漏损复核',valves[0].id,{findingId:finding.id}).id;}
    const analysis=S.diagnose(balances,standard.rule),host=id=>data.nodes.find(n=>n.id===id)||data.pipes.find(p=>p.id===id);
    const reports={
      ledger:{heads:['设备编号','设备名称','类型','宿主','通信','来源'],rows:added.map(d=>[d.id,d.name,S.types[d.type][0],d.hostId||'—',d.online,d.source])},
      monitoring:{heads:['设备编号','时间','指标','值','单位','质量'],rows:added.flatMap(d=>d.samples.map(s=>[d.id,s.time,S.metrics[s.metric][0],s.value,s.unit,s.quality]))},
      balance:{heads:['日期','分区','供水基数 m³','统计差额 m³','漏损率 %','说明'],rows:analysis.map(r=>[r.date,r.zoneName,r.basis,r.loss,r.rate,r.reason||'有效'])},
      diagnosis:{heads:['日期','分区','结论','依据','核查','工单'],rows:analysis.map(r=>[r.date,r.zoneName,r.assessment,r.reasons.join('；'),r.review||'',r.orderId||''])},
      hydrant:{heads:['消火栓','拓扑对象','事件','状态','时间'],rows:[low,flow,closed].map(a=>[a.deviceId,host(a.hostId).name,a.name,a.status,a.createdAt])},
      communication:{heads:['设备','类型','通信','最后通信','质量','RTU'],rows:added.map(d=>[d.id,S.types[d.type][0],d.online,d.lastCommunication,d.quality,d.rtuId||''])}
    };
    Object.entries(reports).forEach(([type,r])=>standard.reports.push({id:'HZ-REPORT-'+type,name:S.reportTypes[type]+' · 杭州示例',time:stamp,start,end,topology:version,formula:'R1',rule:standard.rule.revision,source:'杭州标准示例',...r}));
    standard.fixtureRange={start,end};standard.hangzhouExamples={revision,generatedAt:stamp};
    source.status='已发布';store.versions.push({id:version,name:'杭州城区 · 设备与漏损完整示例',status:'使用中',published:stamp,source:source.id});store.epochs.filter(e=>!e.end).forEach(e=>e.end=stamp);store.epochs.push({topology:version,start:stamp,end:null});
    store.hangzhouExamples={revision,source:source.id,target:version,generatedAt:stamp};store.standardDeviceScenario=version;
    return {...pack,changed:true,version};
  }
  function importRows(devices,bad=false){const noise=devices.find(d=>d.id==='HZ-NOISE-001'),fire=devices.find(d=>d.id==='HZ-FIRE-001');return [
    {'设备编号':'HZ-IMPORT-NOISE-001','设备名称':'学校备用噪声仪','设备类型':'噪声仪','主指标':'噪声','单位':'dB','宿主编号':bad?fire?.hostId:noise?.hostId,'采集周期':300,'启用状态':'启用','RTU编号':'HZ-RTU-001'},
    {'设备编号':'HZ-IMPORT-FIRE-001','设备名称':'学校备用消火栓监测','设备类型':'消火栓','主指标':'压力','单位':'MPa','宿主编号':fire?.hostId,'采集周期':300,'启用状态':'启用'}
  ];}
  return {projectId,revision,build,importRows};
});
