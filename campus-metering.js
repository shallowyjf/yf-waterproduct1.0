/* Planned school instruments and deterministic illustrative readings.
 * No source geometry or hydraulic calculation is changed. Upper-level meters
 * include their children; business submeters never enter a node's flow sum. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./data/campus-dataset.js'):root.CampusDataset,root);if(typeof module==='object'&&module.exports)module.exports=api;else root.CampusMetering=api;})(typeof window==='object'?window:globalThis,function(D,root){
  'use strict';
  const projectId=D.projectId,topologyId=D.topologyId,revision='campus-metering-20261027',source='校园预设示例（非实测）';
  const range={start:'2026-07-01',end:'2026-10-26'},copy=x=>JSON.parse(JSON.stringify(x)),round=x=>+x.toFixed(3),pad=n=>String(n).padStart(2,'0');
  const sites=[
    ['K1','JS643','北侧入口'],['K2','JS258','北侧入口候选点','待选点'],
    ['M1','JS54','南侧入口'],['M2','JS238','北侧泵房入口'],['M3','19','北侧楼顶楼'],
    ['M4','21','北侧泵房至宿舍'],['M5','JS70','食堂直供'],['M6','7','幼儿园'],['M7','27','南教学楼'],
    ['M8','28','垃圾房、体育馆、花房支路','位置待确认；暂挂 DMA-01 入口节点28，管40段内安装点待现场确定']
  ].map(([id,hostId,name,note])=>({id,hostId,name,note:note||'规划待安装',...(id==='M8'?{plannedPipeId:'CAMPUS-P-40'}:{})}));
  const dorms=['22','JS625','JS42','JS615','JS608','JS612'].map((hostId,i)=>({id:'D'+(i+1),number:i+1,hostId,name:'宿舍'+(i+1),zoneId:i<3?'DMA-02':'DMA-04'}));
  const dates=[];for(let t=Date.parse(range.start+'T00:00:00Z');t<=Date.parse(range.end+'T00:00:00Z');t+=86400000)dates.push(new Date(t).toISOString().slice(0,10));
  const weights=[.18,.13,.11,.11,.15,.4,1.2,1.7,1.1,.85,.8,.95,1.35,1.05,.8,.8,.95,1.4,1.8,1.6,1.4,1.1,.7,.37];
  function distribute(volume,nightExtra=0){const total=Math.round(volume*1000),extra=Math.min(total,Math.round(nightExtra*1000)),sum=weights.reduce((a,b)=>a+b,0),values=weights.map(w=>Math.floor((total-extra)*w/sum+extra/24));for(let left=total-values.reduce((a,b)=>a+b,0),i=0;left>0;left--,i++)values[i%24]++;return values.map(v=>v/1000);}
  let cached;
  function build(){
    if(cached)return cached;
    const devices=[],bindings=[],balances=[],revenueRecords=[],hours=new Map(),byId=new Map(),dayZones=[];
    function add(id,type,name,site,extra={}){
      const metric=type==='waterMeter'?'flow':type,unit={flow:'m³/h',pressure:'MPa',noise:'dB'}[metric];
      const d={id,type,metric,name,hostId:site.hostId,plannedHostId:site.hostId,topologyId,installationPlanId:site.id,installationStatus:'预设待安装',location:site.name,remark:site.note||'规划待安装',...('plannedPipeId'in site?{plannedPipeId:site.plannedPipeId}:{}),preset:true,demo:true,source,status:'启用',online:'在线',quality:'GOOD',unit,interval:14400,protocol:'模拟数据',samples:[],daily:[],...extra};
      devices.push(d);byId.set(id,d);hours.set(id,[]);
      if(!d.businessUserId)bindings.push({key:[topologyId,site.hostId,metric].join('|'),devices:[id],rule:metric==='flow'?'sum':'average',revision:1,start:'2026-10-27 00:00:00',preset:true,source});
      return d;
    }
    sites.forEach(s=>[['F','flow','二级流量表'],['P','pressure','压力监测表'],['N','noise','噪声监测仪']].forEach(([suffix,type,label])=>add(`CAMPUS-L2-${s.id}-${suffix}`,type,`${s.id} ${s.name} · ${label}`,s)));
    dorms.forEach(d=>{add(`CAMPUS-L3-${d.id}-F`,'flow',`${d.name}入口 · 三级流量表`,d);for(let u=1;u<=10;u++)add(`CAMPUS-${d.id}-U${pad(u)}`,'waterMeter',`${d.name} · 用户${pad(u)}水表`,d,{businessUserId:`CAMPUS-${d.id}-USER${pad(u)}`,businessUserName:`${d.name} / 用户${pad(u)}`,parentDeviceId:`CAMPUS-L3-${d.id}-F`});});
    const totals=new Map(devices.filter(d=>d.metric==='flow').map((d,i)=>[d.id,1000+i*137]));
    function daily(id,date,volume,nightExtra=0){
      volume=round(volume);const d=byId.get(id),h=distribute(volume,nightExtra),total=round(totals.get(id)+volume);totals.set(id,total);
      d.daily.push({date,volume,total,flow:round(volume/24)});hours.get(id).push(h);return h;
    }
    dates.forEach((date,index)=>{
      const season=1+.09*Math.sin(index/17),weekend=[0,6].includes(new Date(date+'T00:00:00Z').getUTCDay()),building=[],billed=[];
      dorms.forEach(d=>{
        let sum=0;for(let u=1;u<=10;u++){const v=round((1.25+d.number*.07+u*.035)*(weekend?1.1:1)*season*(1+.06*Math.sin(index*.7+u)));daily(`CAMPUS-${d.id}-U${pad(u)}`,date,v);sum+=v;}
        billed.push(round(sum));const anomaly=d.number===3&&date>='2026-10-20',shared=.75+d.number*.08,loss=anomaly?4.8:.35;
        building.push(round(sum+shared+loss));daily(`CAMPUS-L3-${d.id}-F`,date,building.at(-1),anomaly?4.8:0);
      });
      const north=round(18*season*(weekend?.65:1)),library=round(22*season),canteen=round(24*season),kindergarten=round(14*season*(weekend?.4:1)),south=round(19*season*(weekend?.65:1));
      const first=round(building.slice(0,3).reduce((a,b)=>a+b,0)),last=round(building.slice(3).reduce((a,b)=>a+b,0));
      const quantities={M8:round(26*season),M3:north,M4:round(first+1),M5:canteen,M6:kindergarten,M7:south};
      quantities.M2=round(quantities.M4+north+1);quantities.K2=round(quantities.M2+library+2);quantities.K1=round(quantities.K2+quantities.M8+4);quantities.M1=round(last+canteen+kindergarten+south+3);
      sites.forEach((s,i)=>{
        daily(`CAMPUS-L2-${s.id}-F`,date,quantities[s.id],s.id==='M4'&&date>='2026-10-20'?4.8:0);
        for(const [suffix,metric]of [['P','pressure'],['N','noise']]){const d=byId.get(`CAMPUS-L2-${s.id}-${suffix}`);if(index<dates.length-7)continue;for(let h=0;h<24;h+=4){const value=metric==='pressure'?round(.32-i*.005+.018*Math.cos(h*Math.PI/12)+.005*Math.sin(index)):round(29+i*.7+2*Math.sin(h/4)+(s.id==='M4'&&date>='2026-10-20'?9:0));d.samples.push({time:`${date} ${pad(h)}:00:00`,metric,unit:d.unit,value,quality:'GOOD'});}}
      });
      const rev2=round(billed.slice(0,3).reduce((a,b)=>a+b,0)),rev4=round(billed.slice(3).reduce((a,b)=>a+b,0));
      const day=[['DMA-01',quantities.M8,0,null,0],['DMA-02',quantities.K2,0,rev2,round(north+library+3.73)],['DMA-03',quantities.M1,last,null,0],['DMA-04',last,0,rev4,3.45]].map(([zoneId,inlet,outlet,billed,unbilled])=>({topology:topologyId,zoneId,date,inlet,outlet,storage:0,billed,unbilled,quality:'GOOD',source}));
      day.forEach(r=>{const incoming=r.zoneId==='DMA-01'?hours.get('CAMPUS-L2-M8-F')[index]:r.zoneId==='DMA-02'?hours.get('CAMPUS-L2-K2-F')[index]:r.zoneId==='DMA-03'?hours.get('CAMPUS-L2-M1-F')[index]:Array.from({length:24},(_,h)=>round(dorms.slice(3).reduce((sum,d)=>sum+hours.get(`CAMPUS-L3-${d.id}-F`)[index][h],0)));const outgoing=r.zoneId==='DMA-03'?Array.from({length:24},(_,h)=>round(dorms.slice(3).reduce((sum,d)=>sum+hours.get(`CAMPUS-L3-${d.id}-F`)[index][h],0))):Array(24).fill(0);r.nightSamples=[2,3,4].map(h=>({time:`${date} ${pad(h)}:00:00`,value:round(incoming[h]-outgoing[h]),quality:'GOOD'}));dayZones.push({record:r,incoming,outgoing});balances.push(r);});
    });
    devices.forEach(d=>{
      if(d.metric==='flow')for(let index=dates.length-7;index<dates.length;index++){
        const row=d.daily[index],h=hours.get(d.id)[index],start=round(row.total-row.volume);for(let hour=0;hour<24;hour+=4){const time=`${row.date} ${pad(hour)}:00:00`;d.samples.push({time,metric:'flow',unit:'m³/h',value:h[hour],quality:'GOOD'},{time,metric:'volume',unit:'m³',value:round(start+h.slice(0,hour).reduce((a,b)=>a+b,0)),quality:'GOOD'});}
        if(index===dates.length-1)d.samples.push({time:`${row.date} 23:59:59`,metric:'flow',unit:'m³/h',value:h[23],quality:'GOOD'},{time:`${row.date} 23:59:59`,metric:'volume',unit:'m³',value:row.total,quality:'GOOD'});
      }
      const last=d.samples.filter(s=>s.metric===d.metric).at(-1);d.value=last.value;d.sampleTime=last.time;if(!d.daily.length)delete d.daily;
    });
    for(const month of ['2026-07','2026-08','2026-09'])for(const zoneId of ['DMA-02','DMA-04']){const meters=devices.filter(d=>d.businessUserId&&dorms.find(x=>x.hostId===d.hostId).zoneId===zoneId);revenueRecords.push({topology:topologyId,zoneId,month,volume:round(meters.reduce((sum,d)=>sum+d.daily.filter(r=>r.date.startsWith(month)).reduce((a,b)=>a+b.volume,0),0)),meterCount:30,expectedMeterCount:30,quality:'GOOD',source:source+' · 仅30个宿舍用户水表'});}
    cached={devices,bindings,standard:{balances,revenueRecords,imports:[],reports:[],rule:null,fixtureRange:range,campusMeteringRevision:revision},dayZones};return cached;
  }
  function hierarchy(hostId){const d=dorms.find(d=>d.hostId===hostId);if(!d)return null;const base=build(),meters=base.devices.filter(m=>m.hostId===hostId&&m.metric==='flow').map(m=>({id:m.id,name:m.name,demo:true,preset:true,daily:copy(m.daily)}));return {revision:2,seedRevision:revision,children:Array.from({length:10},(_,i)=>({id:`CAMPUS-${d.id}-USER${pad(i+1)}`,name:`用户${pad(i+1)}`,floor:i+1,meterId:`CAMPUS-${d.id}-U${pad(i+1)}`})),meters,pressures:[],totalMeterId:`CAMPUS-L3-${d.id}-F`,totalPressureId:null,range:copy(range)};}
  function device(id,storage=root.localStorage){if(storage){try{const current=JSON.parse(storage.getItem('water-devices:'+projectId));if(Array.isArray(current))return current.find(d=>d.id===id)||null;}catch(_){return null;}}return copy(build().devices.find(d=>d.id===id)||null);}
  function enrichDb(db){
    if(db.campusMeteringRevision!==revision)return db;db.hourlyBalances||=[];
    const dayKey=r=>[r.topology,r.zoneId,(r.date||r.time).slice(0,10)].join('|'),days=new Map(),occupied=new Set(db.hourlyBalances.filter(r=>r.source!==source).map(dayKey));
    for(const r of db.balances||[]){const key=dayKey(r);if(!days.has(key))days.set(key,[]);days.get(key).push(r);}
    const valid=new Set(build().dayZones.filter(({record:r})=>{const rows=days.get(dayKey(r));return !occupied.has(dayKey(r))&&rows?.length===1&&rows[0].source===source&&rows[0].quality==='GOOD'&&rows[0].inlet===r.inlet&&rows[0].outlet===r.outlet;}).map(({record:r})=>dayKey(r)));
    db.hourlyBalances=db.hourlyBalances.filter(r=>r.source!==source||valid.has(dayKey(r)));
    const existing=new Set(db.hourlyBalances.map(r=>[r.topology,r.zoneId,r.time].join('|')));
    for(const {record:r,incoming,outgoing}of build().dayZones)if(valid.has(dayKey(r)))for(let h=0;h<24;h++){const time=`${r.date} ${pad(h)}:00:00`,key=[topologyId,r.zoneId,time].join('|');if(!existing.has(key))db.hourlyBalances.push({topology:topologyId,zoneId:r.zoneId,time,inlet:incoming[h],outlet:outgoing[h],quality:'GOOD',source});}return db;
  }
  function note(zoneId){return ({'DMA-01':'当前未预设用户售水表，营收水量待抄表；M8 暂挂入口节点28，位置待确认。','DMA-02':'营收水量覆盖宿舍1–3共30个用户表；差额还包含教学、图书馆和公共用水，不能全部认定为漏损。','DMA-03':'进口按M1示例、出口按宿舍4–6三级总表合计估算；本区未预设用户售水表，营收水量待抄表。','DMA-04':'分区用水量按宿舍4–6三个三级总表合计估算，非独立边界表实测；营收水量覆盖30个宿舍用户表。'})[zoneId]||'';}
  function initialize(storage=root.localStorage){
    if(!storage)return false;const marker='water-campus-metering:'+projectId;if(storage.getItem(marker)===revision)return false;
    const read=(key,fallback)=>{const raw=storage.getItem(key);if(raw==null)return fallback;return JSON.parse(raw);};
    const storeKey='water-topology-store:'+projectId,deviceKey='water-devices:'+projectId,standardKey='water-standard:'+projectId;
    const store=read(storeKey,null);if(!store?.versions?.some(v=>v.id===topologyId))return false;
    const seed=build(),devices=read(deviceKey,[]),standard=read(standardKey,{imports:[],reports:[],rule:null});if(!Array.isArray(devices)||!standard||typeof standard!=='object')throw Error('校园设备或分析配置格式异常，已保留原数据');
    store.bindings||=[];store.bindingHistory||=[];const available=new Set(devices.map(d=>d.id));const added=new Set();
    for(const d of seed.devices)if(!available.has(d.id)){devices.push(copy(d));available.add(d.id);added.add(d.id);}
    for(const b of seed.bindings)if(!store.bindings.some(x=>x.key===b.key)&&b.devices.every(id=>added.has(id)))store.bindings.push(copy(b));
    for(const field of ['balances','revenueRecords']){standard[field]||=[];const key=r=>[r.topology,r.zoneId,r.date||r.month].join('|'),existing=new Set(standard[field].map(key));for(const r of seed.standard[field])if(!existing.has(key(r)))standard[field].push(copy(r));}
    standard.fixtureRange||=copy(range);standard.campusMeteringRevision=revision;
    const writes=[[deviceKey,JSON.stringify(devices)],[storeKey,JSON.stringify(store)],[standardKey,JSON.stringify(standard)],[marker,revision]],before=new Map(writes.map(([k])=>[k,storage.getItem(k)])),applied=[];
    try{for(const [k,value]of writes){storage.setItem(k,value);applied.push(k);}}catch(error){for(const k of applied.reverse()){const old=before.get(k);if(old==null)storage.removeItem(k);else storage.setItem(k,old);}throw error;}return true;
  }
  return {projectId,topologyId,revision,source,range,sites,dorms,initialize,hierarchy,device,enrichDb,note,seed:()=>copy({devices:build().devices,bindings:build().bindings,standard:build().standard})};
});
