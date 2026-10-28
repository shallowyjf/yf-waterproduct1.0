/* Read models for the operational maps, derived from the selected saved topology. */
(() => {
  const lengthText = v => v == null || v === '' || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('en-US', {useGrouping:false, minimumFractionDigits:2, maximumFractionDigits:2});
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={node:'连接点',valve:'阀门',plant:'水厂',pump:'泵站',user:'用户端',cap:'堵头',pipe:'管线'};
  function build(data, geometry, history=false) {
    const objects=new Map([...data.nodes,...data.pipes,...data.zones].map(o=>[o.id,o]));
    const city=data.nodes.some(n=>n.id.startsWith('CITY-'));
    const zoneFor=id=>data.zones.filter(z=>z.nodeIds.includes(id)||z.pipeIds.includes(id)).map(z=>z.id);
    const pipes=data.pipes.map(p=>({...p,diameter:`DN${p.diameter}`,age:p.age??8}));
    const assets=data.nodes.map(n=>({...n,kind:window.WaterStandard?.kind(n)||n.type,type:window.WaterStandard?.label(n)||labels[n.type],model:n.diameter?`DN${n.diameter}`:'—',location:zoneFor(n.id).map(id=>objects.get(id).name).join(' / ')||'分区外',status:data.sourceDataset?'待核实':'在用'}));
    const pipeByName=name=>data.pipes.find(p=>p.name===name)?.id;
    const sourceHosts=city?[
      pipeByName('城西水厂出厂管'),pipeByName('城北水厂出厂管'),pipeByName('南城大道'),'CITY-J-14','CITY-J-48','CITY-BV-10','CITY-W-WEST','CITY-U-8','CITY-U-10','CITY-W-WEST'
    ]:['PIPE-2026-002','PIPE-2026-004','PIPE-2026-010','NODE-J02','VALVE-V401','VALVE-V402','PLANT-001','USER-NORTHEAST','USER-SOUTH','PLANT-001'];
    const definitions=[['Q-001','flow','西部出厂流量',1286,'m³/h'],['Q-018','flow','北部干管流量',286,'m³/h'],['Q-032','flow','南部干管流量',328,'m³/h'],['P-018','pressure','北部主干压力',.328,'MPa'],['P-086','pressure','东部主干压力',.246,'MPa'],['P-032','pressure','南部末梢压力',.182,'MPa'],['WQ-001','quality','出厂水质',.32,'mg/L'],['WQ-018','quality','东北末梢水质',.28,'mg/L'],['WQ-032','quality','南部末梢水质',.16,'mg/L'],['WL-001','level','水厂清水池水位',4.82,'m']];
    const monitors=(data.sourceDataset?[]:definitions).map(([id,type,name,numeric,unit],i)=>({id,type,name,numeric,unit,hostId:sourceHosts[i],quality:id==='Q-018'?'DELAYED':'GOOD',alarm:id==='P-032'}));
    const zoneLevel=z=>{let level=1,parent=z.parent;const seen=new Set([z.id]);while(parent&&!seen.has(parent)){seen.add(parent);const p=data.zones.find(z=>z.id===parent);if(!p)break;level++;parent=p.parent;}return level;};
    const zones=data.zones.map((z,index)=>{
      const pts=geometry.zonePoints(z),members=new Set(z.nodeIds),anchor=window.DMAGeometry?.labelPoint(pts);
      const boundaries=data.pipes.filter(p=>members.has(p.start)!==members.has(p.end));
      const inlet=boundaries.find(p=>!members.has(p.start)),outlet=boundaries.find(p=>members.has(p.start));
      const node=data.nodes.find(n=>z.nodeIds.includes(n.id));
      // Values are fixed prototype samples; geometry and membership are real shared objects.
      const qIn=720+index*116,qOut=+(qIn*.94).toFixed(1);
      if(inlet&&!data.sourceDataset)monitors.push({id:`Q-IN-${index+1}`,name:`${z.name}入口流量`,type:'flow',numeric:qIn,unit:'m³/h',hostId:inlet.id,zoneIds:[z.id],direction:'inlet',quality:'GOOD'});
      if(outlet&&!data.sourceDataset)monitors.push({id:`Q-OUT-${index+1}`,name:`${z.name}出口流量`,type:'flow',numeric:qOut,unit:'m³/h',hostId:outlet.id,zoneIds:[z.id],direction:'outlet',quality:'GOOD'});
      if(node&&!data.sourceDataset)monitors.push({id:`P-DMA-${index+1}`,name:`${z.name}压力`,type:'pressure',numeric:+(.336-index*.022).toFixed(3),unit:'MPa',hostId:node.id,zoneIds:[z.id],quality:'GOOD'});
      return {...z,parent:z.parent||null,level:zoneLevel(z),group:'current-zones',zone:['a','b','c','d'][index%4],path:pts.length?`M${pts.map(p=>`${p.x} ${p.y}`).join('L')}Z`:'',labelX:anchor?anchor.x:pts.length?pts.reduce((a,p)=>a+p.x,0)/pts.length:0,labelY:anchor?anchor.y:pts.length?pts.reduce((a,p)=>a+p.y,0)/pts.length:0,boundaries:boundaries.map(p=>p.id),length:data.pipes.filter(p=>z.pipeIds.includes(p.id)).reduce((a,p)=>a+p.length,0),inlet:inlet&&!data.sourceDataset?`${qIn} m³/h`:'—',outlet:outlet&&!data.sourceDataset?`${qOut} m³/h`:'—',inletTotal:'—',outletTotal:'—',pressure:node&&!data.sourceDataset?`${(.336-index*.022).toFixed(3)} MPa`:'—',minPressure:node&&!data.sourceDataset?`${(.316-index*.022).toFixed(3)} MPa`:'—',waterQuality:'—',pressureLoss:'未计算',leakage:'—',status:z.definitionSource==='user'?'用户指定分区':z.hypothetical?'假定分区':data.sourceDataset?'待接入':'示例'};
    });
    monitors.forEach(m=>{
      const host=objects.get(m.hostId);m.zoneIds=m.zoneIds||zoneFor(m.hostId);
      if(!host){m.x=null;m.y=null;m.value='—';m.quality='UNBOUND';m.location='未挂接';return;}
      if(host.type==='pipe'){const[a,b]=geometry.coords(host);m.x=(a.x+b.x)/2;m.y=(a.y+b.y)/2;}else{m.x=host.x;m.y=host.y;}
      m.value=`${m.type==='pressure'?m.numeric.toFixed(3):m.numeric} ${m.unit}`;m.location=`${host.id} · ${host.name}`;
    });
    const monitorById=id=>monitors.find(m=>m.id===id);
    const events=data.sourceDataset?[]:[
      {id:'ALM-032',type:'alarm',hostId:monitorById('P-032')?.hostId,monitorId:'P-032',name:'南部末梢低压'},
      {id:'ALM-018',type:'alarm',hostId:monitorById('Q-018')?.hostId,monitorId:'Q-018',name:'北部流量数据延迟'},
      {id:'WO-2026-083',type:'workorder',hostId:city?'CITY-BV-10':'VALVE-V301',name:'南部边界阀巡检'},
      {id:'WO-2026-091',type:'workorder',hostId:city?'CITY-B-WEST':'PUMP-001',name:'西部泵站巡检'}
    ];
    const position=id=>{
      const monitor=monitors.find(m=>m.id===id);if(monitor)return monitor.x===null?null:[monitor.x,monitor.y];
      const event=events.find(e=>e.id===id);const o=objects.get(event?.hostId||id);if(!o)return null;
      if(o.type==='pipe'){const[a,b]=geometry.coords(o);return[(a.x+b.x)/2,(a.y+b.y)/2];}
      if(o.type==='zone'){const z=zones.find(z=>z.id===id);return[z.labelX,z.labelY];}return[o.x,o.y];
    };
    return {data,objects,pipes,assets,zones,monitors,events,position,zoneFor,history,totalLength:data.pipes.reduce((a,p)=>a+p.length,0)};
  }
  const fields=rows=>`<div class="app-descriptions">${rows.map(([k,v])=>`<div class="app-description-item"><div class="app-description-label">${esc(k)}</div><div class="app-description-value">${esc(v)}</div></div>`).join('')}</div>`;
  const link=(id,name,action)=>`<button class="product-detail-list-row" type="button" data-action="${action}" data-value="${esc(id)}" data-pipe-id="${esc(id)}"><span><strong>${esc(id)}</strong><small>${esc(name)}</small></span><span>定位</span></button>`;
  const related=(title,items,empty='暂无关联对象')=>`<section class="product-detail-section"><h3>${esc(title)}</h3><div class="product-detail-list">${items.join('')||`<div class="app-empty">${esc(empty)}</div>`}</div></section>`;
  function detail(model,type,id,tab='basic') {
    // Old tab references open the complete basic information panel.
    if(tab==='topology')tab='basic';
    const o=model.objects.get(id),m=model.monitors.find(m=>m.id===id),event=model.events.find(e=>e.id===id);
    const objectLink=(id,prefix='')=>{
      const object=model.objects.get(id);
      return object?link(id,prefix+object.name,object.type==='pipe'?'select-pipe':object.type==='zone'?'select-dma':'select-asset'):`<div class="app-empty">${esc(prefix)}${esc(id||'未关联')} · 对象不存在</div>`;
    };
    const zones=ids=>related('所属分区',ids.map(id=>objectLink(id)),'分区外');
    if(type==='dma'){
      const z=model.zones.find(z=>z.id===id);if(!z)return '<div class="app-empty">所选拓扑中无此分区</div>';
      if(tab==='metrics'){const b=z.balance||{},fmt=v=>v==null||v===''?'—':typeof v==='number'?v.toFixed(3):v;return fields([['统计月份',b.date||'—'],['流入总量（m³）',fmt(b.inlet)],['流出总量（m³）',fmt(b.outlet)],['储水增加量（m³）',fmt(b.storage)],['供水基数（m³）',fmt(b.basis)],['收费售水（m³）',fmt(b.billed)],['合法未收费（m³）',fmt(b.unbilled)],['统计差额（m³）',fmt(b.loss)],['漏损率',z.leakage],['夜间统计日期',z.nightDaily?.date||'—'],['当日夜间平均流量（m³/h）',fmt(z.nightDaily?.night)],['夜间时段','02:00–05:00']])+`<button class="app-button app-button-primary u-w-full" data-action="dma-leakage-trend" data-value="${esc(z.id)}">查看趋势</button><button class="app-button u-w-full" data-action="dma-leakage-trend" data-metric="night" data-value="${esc(z.id)}">查看每日夜间流量</button>`;}
      if(tab==='history')return '<div class="app-empty">该拓扑快照未附带分区运行归档</div>';
      return fields([['分区编号',z.id],['分区名称',z.name],['成员点',z.nodeIds.length],['成员线',z.pipeIds.length],['成员管长',`${(z.length/1000).toFixed(2)} km`],['边界管线',z.boundaries.length],['形状',z.boundaryMode==='pipe-corridor'?'沿管路收紧的外接多边形':z.boundary?.length?'外接多边形（允许凹边界）':'成员外接多边形'],...(z.boundaryWidthM?[["包络总宽度",z.boundaryWidthM+' m（常规管段两侧各 '+z.boundaryWidthM/2+' m）'],["分区面积",Number.isFinite(z.boundaryAreaM2)?z.boundaryAreaM2.toFixed(1)+' m²':'—'],["边界规则",z.boundaryNote||'相邻分区交界处共边裁切']]:[]),...(z.hypothetical&&z.definitionSource!=='user'?[["方案性质","假定分区 · 待现场核实"],["包含建筑",(z.buildings||[]).join('、')],["假定入口",(z.inletPipeIds||[]).join('、')||'—'],["假定出口",(z.outletPipeIds||[]).join('、')||'无'],["分区说明",z.note||'计量尚未接入']]:[])])
        +(z.definitionSource==='user'?fields([['方案性质','用户指定范围 · 计量待接入'],['包含建筑',(z.buildings||[]).join('、')],['起点节点',(z.inletNodeIds||[]).join('、')||'—'],['出口交界节点',(z.outletNodeIds||[]).join('、')||'无'],['共用边界节点',(z.boundaryNodeIds||[]).join('、')||'无'],['分区说明',z.note||'']]):'')
        +related('挂接监测点',model.monitors.filter(m=>m.zoneIds.includes(z.id)).map(m=>link(m.id,`${m.name} · ${m.location}`,'select-monitor')),'暂无挂接监测点')
        +related('边界管线',z.boundaries.map(id=>objectLink(id)),'无边界管线');
    }
    if(m){
      if(tab==='history')return '<div class="app-empty">请从监测历史记录查看归档数据</div>';
      if(tab==='metrics')return fields([['监测点',m.id],['监测值',m.value],['质量码',m.quality],...(m.demo?[['数据性质','预设设备 · 示例数据（非实测）'],['示例采样时间',m.sampleTime]]:[])]);
      return fields([['监测点',m.id],['名称',m.name],['挂接位置',m.location],['监测值',m.value],['质量码',m.quality],...(m.demo?[['设备状态','预设待安装'],['数据性质','示例数据（非实测）'],['示例采样时间',m.sampleTime]]:[])])
        +related('挂接对象',[objectLink(m.hostId)])+zones(m.zoneIds)+(m.devices||[]).map(id=>`<button class="app-button" data-action="standard-device-data" data-value="${esc(id)}">${esc(id)} · 查看数据</button>`).join('');
    }
    if(event){
      const host=model.objects.get(event.hostId);
      return fields([['编号',event.id],['名称',event.name],['关联对象',event.hostId||'空'],['对象名称',host?.name||'对象已移除'],['关联监测',event.monitorId||'—'],['数据来源','原型示例']])
        +related('关联对象',[objectLink(event.hostId)]);
    }
    if(!o)return '<div class="app-empty">所选拓扑中无此对象</div>';
    if(tab==='floors')return window.WaterUserHierarchy?.render(model.data,id)||'<div class="app-empty">暂无子用户</div>';
    if(tab==='history')return '<div class="app-empty">该对象暂无附带巡检记录</div>';
    const ps=model.data.pipes.filter(p=>p.start===id||p.end===id);
    if(tab==='metrics')return fields([['对象类型',window.WaterStandard?.label(o)||labels[o.type]],['连接管线',o.type==='pipe'?'—':ps.length],['所属分区',model.zoneFor(id).join(' / ')||'分区外']]);
    const rows=[['对象编号',o.id],['名称',o.name],['类型',window.WaterStandard?.label(o)||labels[o.type]]];
    const measure=(v,unit)=>v==null?'—':`${v} ${unit}`;
    if(o.type==='pipe')rows.push(['管径',o.diameter?`DN${o.diameter}`:'—'],['材质',o.material||'—'],['管长',`${lengthText(o.length)}${o.length==null?'':' m'}`],['起点高程',measure(o.startElevation,'m')],['终点高程',measure(o.endElevation,'m')]);
    else rows.push(['坐标',`${o.x}, ${o.y}`],['高程',measure(o.elevation,'m')],['管径',o.diameter?`DN${o.diameter}`:'—']);
    if(o.nodeKind==='RESERVOIR')rows.push(['水源总水头',o.headStatus==='待设置'?'待设置':measure(o.headM,'m')]);
    return fields(rows)+(o.type==='pipe'?related('连接节点',[objectLink(o.start,'起点 · '),objectLink(o.end,'终点 · ')]):related('连接管线',ps.map(p=>link(p.id,`${p.name} · DN${p.diameter}`,'select-pipe')),'无连接管线'))
      +zones(model.zoneFor(id))+(window.WaterUserHierarchy?.render(model.data,id)||'');
  }
  function overlay(model,options={}) {
    if(options.historyKind)return '';
    const layers=options.layers||{},selected=new Set(options.selectedIds||[]),show=key=>!options.layers||layers[key]===true;
    const codes={pressure:'P',flow:'Q',quality:'WQ',level:'WL',noise:'噪'};
    let result='';
    if(options.points!==false)for(const m of model.monitors){if(!show(m.type)||m.x===null)continue;
      const dx=m.type==='noise'?-28:m.type==='quality'?14:m.type==='level'?-15:0,dy=m.type==='pressure'?-16:m.type==='flow'?15:m.type==='noise'?18:28;
      const active=selected.has(m.id),x=m.x+dx,y=m.y+dy;
      result+=`<g class="product-monitor-symbol is-${m.type} unified-monitor ${active?'is-selected':''} ${m.alarm?'is-error':''}" transform="translate(${x} ${y})" data-action="select-monitor" data-value="${esc(m.id)}" tabindex="0" role="button" aria-label="${esc(m.id)} ${esc(m.name)}"><path class="unified-leader" d="M0 0L${-dx} ${-dy}"/><circle r="8"/><text class="product-monitor-code" text-anchor="middle" y="3">${codes[m.type]}</text>${show('labels')?`<text class="product-monitor-value" text-anchor="middle" y="${dy<0?-13:21}">${esc(active?`${m.id} · ${m.value}`:m.id)}</text>`:''}<title>${esc(m.location)} · ${esc(m.value)}</title></g>`;
    }
    for(const event of model.events){if(!show(event.type==='alarm'?'alarms':'workorders'))continue;const pos=model.position(event.id);if(!pos)continue;
      result+=`<g class="product-ops-marker is-${event.type} ${selected.has(event.id)?'is-selected':''}" transform="translate(${pos[0]+20} ${pos[1]-24})" data-action="${event.type==='alarm'?'select-map-alarm':'select-workorder'}" data-value="${event.id}" tabindex="0" role="button" aria-label="${esc(event.id)} ${esc(event.name)}"><circle r="10"/><text text-anchor="middle" y="4">${event.type==='alarm'?'!':'单'}</text><title>${esc(event.name)} · ${esc(event.hostId)}</title></g>`;
    }
    return result;
  }
  function historyHost(model,kind,record){
    if(kind==='dma')return model.objects.has(record.id)?record.id:null;
    const monitor=kind==='alarm'?({'低压报警':'P-032','数据延迟':'Q-018','余氯偏低':'WQ-018'}[record.metric]):kind==='data'?record.id:null;
    const host=monitor?model.monitors.find(m=>m.id===monitor)?.hostId:({'WO-2026-072':'CITY-BV-10','WO-2026-068':'CITY-B-WEST','INS-2026-114':'CITY-V-036','INS-2026-108':'CITY-P-015'}[record.id]);
    return model.objects.has(host)?host:null;
  }
  window.TopologyMapData={build,detail,overlay,fields,historyHost};
})();
