/* Standard 1.0 domain rules shared by forms, imports, maps and reports. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WaterStandard=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const types={flow:['流量计','flow','m³/h'],waterMeter:['水表','flow','m³/h'],pressure:['压力监测仪','pressure','MPa'],quality:['水质监测仪','quality','mg/L'],level:['水位监测仪','level','m'],noise:['噪声仪','noise','dB'],hydrant:['消火栓','pressure','MPa'],valveMeter:['阀控水表','flow','m³/h'],rtu:['RTU','state','']};
  const metrics={flow:['流量','m³/h'],pressure:['压力','MPa'],quality:['余氯','mg/L'],level:['水位','m'],noise:['噪声','dB'],volume:['累计水量','m³'],outflow:['出水状态',''],valve:['阀位',''],state:['通信状态','']};
  const reportTypes={ledger:'设备台账与挂接',monitoring:'监测数据',balance:'DMA 水量与漏损',diagnosis:'漏损辅助分析',hydrant:'消火栓状态与报警',communication:'设备通信与数据质量'};
  const columns=['设备编号','设备名称','设备类型','主指标','单位','安装位置','宿主编号','采集周期','启用状态','RTU编号'];
  const copy=x=>JSON.parse(JSON.stringify(x));
  const kind=o=>o?.type==='user'&&o.userSubtype==='FIRE_HYDRANT'?'hydrant':o?.type;
  const label=o=>({node:'连接点',valve:'阀门',plant:'水厂',pump:'泵站',user:'用户端',hydrant:'消火栓',cap:'堵头',pipe:'管线',zone:'DMA 分区'})[kind(o)]||'—';
  const metric=d=>d.metric||types[d.type]?.[1]||d.type;
  function hostError(d,host){if(!host)return '挂接对象不存在';if(d.type==='rtu')return 'RTU 请通过下挂设备关联拓扑';if(d.type==='noise'&&host.type!=='valve')return '噪声仪只能挂接阀门';if(d.type==='hydrant'&&kind(host)!=='hydrant')return '消火栓设备请选择消火栓对象';return '';}
  function validateDevice(input,devices,model,old){
    const d={...old,...input};d.id=String(old?.id||d.id||'').trim();d.name=String(d.name||'').trim();
    if(!/^[A-Za-z0-9_-]{2,64}$/.test(d.id)||!d.name)throw Error('编号须为 2–64 位字母、数字、下划线或连字符，名称不能为空');
    if(!types[d.type])throw Error('未知设备类型');if(!old&&devices.some(x=>x.id===d.id))throw Error('设备编号重复：'+d.id);
    d.metric=d.metric||types[d.type][1];if(!metrics[d.metric])throw Error('未知主指标');
    if(d.metric!==types[d.type][1])throw Error('设备类型与主指标不匹配');
    d.unit=String(d.unit??types[d.type][2]);if(d.metric!=='noise'&&d.unit!==metrics[d.metric][1])throw Error('指标与单位不匹配');if(d.metric==='noise'&&!d.unit.trim())throw Error('噪声参数须填写设备提供的单位');
    d.interval=Number(d.interval||300);if(!Number.isInteger(d.interval)||d.interval<1||d.interval>86400)throw Error('采集周期须为 1–86400 秒');
    d.status=d.status||'启用';if(!['启用','停用'].includes(d.status))throw Error('启用状态无效');
    if(d.hostId){const e=hostError(d,model.objects.get(d.hostId));if(e)throw Error(e);}
    if(d.rtuId){if(d.rtuId===d.id||devices.find(x=>x.id===d.rtuId)?.type!=='rtu')throw Error('RTU 编号不存在或不合法');}
    return {...d,online:old?.online||'未知',quality:old?.quality||'MISSING',value:old&&metric(old)===d.metric&&old.unit===d.unit?old.value:null,sampleTime:old?.sampleTime||'',samples:old?.samples||[],alarmEnabled:d.type==='hydrant'?d.alarmEnabled!==false:false};
  }
  function previewImport(rows,devices,model,mode='新增'){
    const seen=new Set(),items=[];for(const [index,row] of rows.entries()){
      const raw={id:String(row['设备编号']||'').trim(),name:row['设备名称'],type:row['设备类型'],metric:row['主指标'],unit:row['单位'],location:row['安装位置'],hostId:row['宿主编号'],interval:row['采集周期'],status:row['启用状态'],rtuId:row['RTU编号']};
      raw.type=Object.keys(types).find(k=>k===raw.type||types[k][0]===raw.type)||raw.type;
      raw.metric=Object.keys(metrics).find(k=>k===raw.metric||metrics[k][0]===raw.metric)||raw.metric;
      const old=devices.find(d=>d.id===raw.id);let error='',device=null;
      try{if(seen.has(raw.id))throw Error('文件内编号重复');seen.add(raw.id);if(mode==='更新'&&!old)throw Error('更新对象不存在');
        const input=Object.fromEntries(Object.entries(raw).filter(([,v])=>v!==''&&v!=null));device=validateDevice(input,devices,model,mode==='更新'?old:null);
        if(old&&mode==='更新'&&(old.type!==device.type||metric(old)!==device.metric))throw Error('导入更新不能改变设备类型或主指标，请解除挂接后编辑');
      }catch(e){error=e.message;}
      items.push({row:index+2,id:raw.id,name:raw.name,device,error,action:old?'更新':'新增'});
    }
    return {items,valid:items.length>0&&items.every(i=>!i.error),base:JSON.stringify(devices),mode};
  }
  function commitImport(preview,devices,model){if(!preview?.valid)throw Error('请修正全部预检问题');if(JSON.stringify(devices)!==preview.base)throw Error('台账已变化，请重新预检');const next=copy(devices);for(const item of preview.items){const old=preview.mode==='更新'?next.find(d=>d.id===item.id):null;const d=validateDevice(item.device,next,model,old);if(old)next.splice(next.indexOf(old),1,d);else next.push(d);}return next;}
  function balance(r){
    const keys=['inlet','outlet','storage','billed','unbilled'];const complete=keys.every(k=>r[k]!==''&&r[k]!=null&&Number.isFinite(Number(r[k])));
    if(!complete||r.quality==='BAD')return {...r,basis:null,difference:null,loss:null,rate:null,status:'不可判断',reason:'缺少同期水量或质量不合格'};
    const basis=+r.inlet-+r.outlet-+r.storage,loss=basis-+r.billed-+r.unbilled;
    return {...r,basis,difference:basis-+r.billed,loss,rate:basis>0?loss/basis*100:null,status:basis<=0||loss<0?'不可判断':'有效',reason:basis<=0?'供水基数非正':loss<0?'负差额，需核对计量和口径':''};
  }
  function diagnose(rows,rule){return rows.map(r=>{const b=balance(r),configured=rule&&Number.isFinite(rule.lossRate)&&Number.isFinite(rule.nightFlow);const nightValid=r.night!==''&&r.night!=null&&Number.isFinite(+r.night);const reasons=[];
    if(!configured)return {...b,assessment:'待配置',reasons:['请配置分析阈值']};if(b.status!=='有效'||!nightValid)return {...b,assessment:'不可判断',reasons:[b.reason||'缺少有效夜间流量']};
    if(b.rate>rule.lossRate)reasons.push(`漏损率 ${b.rate.toFixed(2)}% > ${rule.lossRate}%`);if(+r.night>rule.nightFlow)reasons.push(`夜间最小流量 ${r.night} m³/h > ${rule.nightFlow} m³/h`);
    return {...b,assessment:reasons.length?'疑似异常':'规则内',reasons:reasons.length?reasons:['未触发已配置规则'],ruleRevision:rule.revision};});}
  function csv(rows){return '\ufeff'+rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s)&&typeof v!=='number')s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');}
  function alarm(db,device,hostId,topology,event){
    if(device.type!=='hydrant'||!event?.id||!event.abnormal)return null;
    const key=`HYD:${device.id}:${event.id}`,old=db.alarms.find(a=>a.sourceKey===key);if(old)return old;
    const a={id:key,sourceKey:key,deviceId:device.id,name:device.name+' · '+event.name,hostId,topology,type:'alarm',status:'待确认',createdAt:event.time||new Date().toISOString(),level:'重要',triggerValue:event.value||'设备异常',triggerQuality:'GOOD',threshold:'设备平台异常事件',source:'消火栓设备',sample:true,notifyEnabled:device.alarmEnabled!==false,logs:[]};db.alarms.push(a);return a;
  }
  function samples(device,metricKey,start,end){const from=Date.parse(start),to=Date.parse(end);return (device.samples||[]).filter(s=>(!metricKey||s.metric===metricKey)&&(!Number.isFinite(from)||Date.parse(s.time)>=from)&&(!Number.isFinite(to)||Date.parse(s.time)<=to));}
  return {types,metrics,reportTypes,columns,kind,label,metric,hostError,validateDevice,previewImport,commitImport,balance,diagnose,csv,alarm,samples,copy};
});
