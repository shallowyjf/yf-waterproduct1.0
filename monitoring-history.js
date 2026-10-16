(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MonitoringHistory=factory();})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const local=t=>new Date(t+8*3600000).toISOString().slice(0,19).replace('T',' ');
  const parse=t=>Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(t||'')?t:String(t||'').replace(' ','T')+'+08:00');
  const key=(version,m)=>[version,m.id,m.hostId,m.type].join('|');
  const numeric=s=>typeof s.value==='number'&&Number.isFinite(s.value)&&['GOOD','PARTIAL'].includes(s.quality);
  function fixture(id,metric,unit,value,now){const seed=[...id].reduce((n,c)=>n+c.charCodeAt(0),0);return Array.from({length:168},(_,i)=>{const h=167-i,missing=h===23||h===22;return {time:local(now-h*3600000),metric,unit,value:missing?null:h===0?value:+(value*(1+.08*Math.sin(h/3+seed)+.025*Math.sin(h/13))).toFixed(3),quality:missing?'MISSING':'GOOD',source:'内置监测示例'};});}
  function supplement(archive,version,monitors,devices,now=Date.now(),allowExamples=true){
    const result=JSON.parse(JSON.stringify({archive:archive||{version:1,series:{}},devices}));let changed=false,devicesChanged=false;
    if(result.archive.version!==1||!result.archive.series)throw Error('监测历史数据格式无效');
    if(allowExamples){
      for(const m of monitors)if(!m.devices?.length&&Number.isFinite(m.numeric)&&!result.archive.series[key(version,m)]){result.archive.series[key(version,m)]=fixture(m.id,m.type,m.unit,m.numeric,now);changed=true;}
      for(const d of result.devices)if(d.manufacturer==='示例仪表厂'&&!Array.isArray(d.samples)&&Number.isFinite(d.value)){d.samples=fixture(d.id,d.metric||d.type,d.unit,d.value,now);d.source=d.source||'内置监测示例';devicesChanged=true;}
    }
    return {...result,changed,devicesChanged};
  }
  function records(archive,version,monitor,devices,deviceId='',metric=monitor.type){
    if(!monitor.devices?.length)return (archive.series[key(version,monitor)]||[]).filter(s=>s.metric===metric);
    const linked=monitor.devices.map(id=>devices.find(d=>d.id===id)).filter(Boolean);
    if(deviceId){const d=linked.find(d=>d.id===deviceId);return (d?.samples||[]).filter(s=>s.metric===metric).map(s=>({...s,deviceCount:1,validCount:numeric(s)?1:0,source:d.source||'设备历史'}));}
    if(metric!==monitor.type)return [];
    const points=new Map();for(const d of linked)for(const s of d.samples||[])if(s.metric===metric&&Number.isFinite(parse(s.time))){const time=parse(s.time);if(!points.has(time))points.set(time,new Map());points.get(time).set(d.id,s);}
    return [...points.entries()].sort((a,b)=>a[0]-b[0]).map(([time,byDevice])=>{const samples=[...byDevice.values()],valid=samples.filter(s=>numeric(s)&&s.unit===monitor.unit),value=valid.length?+(valid.reduce((n,s)=>n+s.value,0)/(monitor.rule==='sum'?1:valid.length)).toFixed(3):null;return {time:local(time),metric,unit:monitor.unit,value,quality:valid.length===linked.length?'GOOD':valid.length?'PARTIAL':'MISSING',validCount:valid.length,deviceCount:linked.length,source:'设备历史聚合'};});
  }
  function query(rows,start,end){const from=parse(start),to=parse(end)+(String(end).length===16?59999:0);if(!Number.isFinite(from)||!Number.isFinite(to)||from>to)throw Error('请选择有效的起止时间，开始时间不能晚于结束时间');return rows.filter(s=>parse(s.time)>=from&&parse(s.time)<=to).sort((a,b)=>parse(a.time)-parse(b.time));}
  function range(rows,hours=24){const dates=rows.map(s=>parse(s.time)).filter(Number.isFinite),to=dates.length?Math.max(...dates):Date.now();return {start:local(to-hours*3600000).slice(0,16).replace(' ','T'),end:local(to).slice(0,16).replace(' ','T')};}
  function stats(rows){const values=rows.filter(numeric).map(s=>s.value);return {count:rows.length,valid:values.length,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null,average:values.length?values.reduce((a,b)=>a+b,0)/values.length:null};}
  return {local,parse,key,numeric,fixture,supplement,records,query,range,stats};
});
