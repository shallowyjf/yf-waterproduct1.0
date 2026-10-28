/* Business users and preset meters are separate from hydraulic topology nodes. */
(function(root){
  'use strict';
  const DAY=86400000,SEED_REVISION='campus-metering-20261027',PAGE_SIZE=5;
  const clone=x=>JSON.parse(JSON.stringify(x));
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const round=x=>+x.toFixed(3);
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const dateValue=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
  const shiftDate=(date,n)=>new Date(Date.parse(date)+n*DAY).toISOString().slice(0,10);
  function days(start,end){
    if(!dateValue(start)||!dateValue(end)||start>end)throw Error('请选择有效的起止日期');
    const n=(Date.parse(end)-Date.parse(start))/DAY+1;
    if(n>93)throw Error('单次最多查询93天');
    return Array.from({length:n},(_,i)=>shiftDate(start,i));
  }
  function legacySeed(source,id){
    const demo=(source==='sh-campus-20261013'||source.endsWith('|sh-campus-20261013'))&&id==='22';
    return {revision:1,children:demo?Array.from({length:6},(_,i)=>({id:`22-F${i+1}`,name:`${i+1}层`,floor:i+1,meterId:`DEMO-22-F${i+1}`})):[],meters:demo?Array.from({length:7},(_,i)=>({id:i?`DEMO-22-F${i}`:'DEMO-22-TOTAL',name:i?`${i}层水表`:'宿舍1总表',factor:i?8+i:90,demo:true})):[],totalMeterId:demo?'DEMO-22-TOTAL':null};
  }
  function campusScope(source){return source==='sh-campus-20261013'||source==='PRJ-SH-CAMPUS|sh-campus-20261013';}
  function seed(source,id){
    if(root.CampusMetering?.hierarchy){
      const preset=campusScope(source)?root.CampusMetering.hierarchy(id):null;
      return preset?clone(preset):{revision:2,children:[],meters:[],pressures:[],totalMeterId:null,totalPressureId:null};
    }
    return legacySeed(source,id);
  }
  function dailyRow(meter,date){return meter?.daily?.find(d=>d.date===date);}
  let registryRaw,registryMeters;
  function currentMeter(meter){
    if(!meter?.preset||!root.CampusMetering?.device)return meter;
    try{
      const raw=root.localStorage?.getItem('water-devices:PRJ-SH-CAMPUS');
      if(raw!=null){
        if(raw!==registryRaw){registryRaw=raw;registryMeters=null;const rows=JSON.parse(raw);if(Array.isArray(rows))registryMeters=new Map(rows.map(m=>[m.id,m]));}
        return registryMeters?.get(meter.id)||null;
      }
      return root.CampusMetering.device(meter.id,root.localStorage);
    }catch{return null;}
  }
  const usableMeter=m=>m&&m.status!=='停用'?m:null;
  function storedConfig(db){
    const copy=clone(db);
    if(copy.seedRevision===SEED_REVISION)copy.meters.forEach(m=>{if(m.preset){delete m.daily;delete m.samples;}});
    return copy;
  }
  function volume(meter,start,end){
    if(!meter)return null;
    const dates=days(start,end);
    if(Array.isArray(meter.daily)){
      const rows=dates.map(d=>dailyRow(meter,d));
      return rows.every(d=>finite(d?.volume))?round(rows.reduce((sum,d)=>sum+d.volume,0)):null;
    }
    if(!finite(meter.factor))return null;
    return round(dates.reduce((sum,d)=>sum+meter.factor*(.85+(Math.floor(Date.parse(d)/DAY)%7)*.05),0));
  }
  function addChild(db,name,floor){
    name=String(name).trim();floor=Number(floor);
    const label=db.seedRevision===SEED_REVISION?'用户序号':'楼层';
    if(!name||name.length>40||!Number.isInteger(floor)||floor<1)throw Error(`填写子用户名称和正整数${label}`);
    if(db.children.some(x=>x.floor===floor))throw Error(`该${label}已存在`);
    db.children.push({id:'child-'+Date.now()+'-'+Math.random().toString(16).slice(2),name,floor,meterId:null});
    db.children.sort((a,b)=>a.floor-b.floor);return db;
  }
  function bind(db,childId,meterId){
    const c=db.children.find(x=>x.id===childId);if(!c)throw Error('子用户不存在');
    if(meterId&&(!db.meters.some(x=>x.id===meterId)||meterId===db.totalMeterId||db.children.some(x=>x.id!==childId&&x.meterId===meterId)))throw Error('水表不可用或已挂接');
    c.meterId=meterId||null;return db;
  }
  function enrich(db){
    if(!db.pressures){
      // Only the original six-floor fixture had implicit demonstration pressures.
      db.pressures=db.seedRevision===SEED_REVISION?[]:db.meters.filter(m=>m.demo&&/^DEMO-22-/.test(m.id)).map((m,i)=>({id:m.id+'-P',name:i?`${i}层压力计`:'楼栋压力计',pressure:.32-i*.012,demo:true}));
      db.totalPressureId=db.pressures[0]?.id||null;
      db.children.forEach(c=>{c.pressureId=db.pressures.find(p=>p.id===c.meterId+'-P')?.id||null;});
    }
    return db;
  }
  function canonical(value){
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  function canUpgrade(db,source,id){
    if(!campusScope(source)||id!=='22'||db?.seedRevision)return false;
    const original=legacySeed(source,id);
    return canonical(db)===canonical(original)||canonical(db)===canonical(enrich(original));
  }
  function latestRange(db){
    if(dateValue(db.range?.start)&&dateValue(db.range?.end))return {start:shiftDate(db.range.end,-6)<db.range.start?db.range.start:shiftDate(db.range.end,-6),end:db.range.end};
    return {start:'2026-10-01',end:'2026-10-07'};
  }
  const states=new Map(),contexts=new Map();
  function state(source,id){
    const key=`water-user-hierarchy:v1:${source}:${id}`;
    if(!states.has(key)){
      let db,migration='';
      try{db=JSON.parse(root.localStorage?.getItem(key)||'null');}catch{}
      if(!db||!Array.isArray(db.children)||!Array.isArray(db.meters))db=seed(source,id);
      else if(root.CampusMetering?.hierarchy&&canUpgrade(db,source,id)){
        const next=seed(source,id);
        if(next.seedRevision===SEED_REVISION){
          try{
            const backupKey=key+':before-'+SEED_REVISION;
            if(!root.localStorage)throw Error('存储不可用');
            if(!root.localStorage.getItem(backupKey))root.localStorage.setItem(backupKey,JSON.stringify(db));
            root.localStorage.setItem(key,JSON.stringify(storedConfig(next)));
            db=next;migration='已将原六层示例更新为10个预设用户水表，原配置已备份。';
          }catch{migration='原示例配置保留：本地备份未成功，未覆盖已有配置。';}
        }
      }
      states.set(key,{key,db,...latestRange(db),page:1,dayPage:1,selected:null,tab:'overview',error:'',migration});
    }
    return states.get(key);
  }
  function sourceKey(data){return [data.businessProjectId||data.id||'default',data.sourceDataset||'standard'].join('|');}
  function eligible(o){return o?.type==='user'&&String(o.user_subtype||o.userSubtype||'').toUpperCase()!=='FIRE_HYDRANT';}
  function summary(data,id){
    contexts.set(sourceKey(data),data);
    const o=data.nodes.find(x=>x.id===id);if(!eligible(o))return null;
    const db=enrich(state(sourceKey(data),id).db);
    return {children:db.children.length,devices:new Set([db.totalMeterId,db.totalPressureId,...(data.businessDeviceLinks||[]).filter(d=>d.hostId===id).map(d=>d.id)].filter(Boolean)).size};
  }
  function cumulative(meter,date){
    if(!meter||!dateValue(date))return null;
    if(Array.isArray(meter.daily)){const row=dailyRow(meter,date);return finite(row?.total)?row.total:null;}
    if(!finite(meter.factor))return null;
    const anchor=Math.floor(Date.parse('2026-01-01')/DAY),n=Math.round((Date.parse(date)-Date.parse('2026-01-01'))/DAY)+1,count=Math.abs(n),start=anchor+Math.min(0,n);
    let factor=Math.floor(count/7)*7;
    for(let i=0;i<count%7;i++)factor+=.85+((start+i)%7+7)%7*.05;
    return round(10000+(n<0?-1:1)*meter.factor*factor);
  }
  function readings(db,user,start,end){
    const configured=db.meters.find(x=>x.id===user.meterId),registered=currentMeter(configured),m=usableMeter(registered),p=(db.pressures||[]).find(x=>x.id===user.pressureId),dayVolume=volume(m,end,end),row=dailyRow(m,end);
    const pressureRow=dailyRow(p,end);
    return {flow:finite(row?.flow)?row.flow:dayVolume==null?null:round(dayVolume/24*(Array.isArray(m?.daily)?1:.85)),meanFlow:dayVolume==null?null:round(dayVolume/24),pressure:Array.isArray(p?.daily)?(finite(pressureRow?.pressure)?pressureRow.pressure:null):finite(p?.pressure)?round(p.pressure):null,total:cumulative(m,end),volume:volume(m,start,end),status:!user.meterId?'未挂接':!registered?'设备缺失':registered.status==='停用'?'设备停用':''};
  }
  function analysis(db,start,end){
    const dates=days(start,end),meter=usableMeter(currentMeter(db.meters.find(m=>m.id===db.totalMeterId)));
    const used=new Set(),assigned=db.children.map(c=>{
      if(!c.meterId||c.meterId===db.totalMeterId||used.has(c.meterId))return null;
      used.add(c.meterId);return usableMeter(currentMeter(db.meters.find(m=>m.id===c.meterId)))||null;
    });
    const total=volume(meter,start,end),parts=assigned.map(m=>volume(m,start,end));
    const subTotal=parts.length&&parts.every(finite)?round(parts.reduce((s,v)=>s+v,0)):null;
    const difference=finite(total)&&finite(subTotal)?round(total-subTotal):null;
    const rate=finite(difference)&&total>0?round(difference/total*100):null;
    const daily=dates.map(date=>{
      const t=volume(meter,date,date),values=assigned.map(m=>volume(m,date,date));
      const sub=values.length&&values.every(finite)?round(values.reduce((s,v)=>s+v,0)):null;
      return {date,total:t,subTotal:sub,difference:finite(t)&&finite(sub)?round(t-sub):null,rate:finite(t)&&finite(sub)&&t>0?round((t-sub)/t*100):null};
    });
    const notices=[];
    if(!finite(total)||!finite(subTotal))notices.push({kind:'empty',text:'所选日期存在未挂接、停用设备或缺失读数，完整总分表差量暂不计算。'});
    const abnormal=daily.filter(d=>finite(d.rate)&&(d.rate>15||d.rate<0));
    if(abnormal.length)notices.push({kind:'attention',text:`${abnormal.length}天总分表差率${abnormal.some(d=>d.rate<0)?'为负或超过':'超过'}15%的示例阈值；请结合公共用水、读数时段和设备状态核查。`});
    const complete=daily.filter(d=>finite(d.total));
    if(complete.length){const peak=complete.reduce((a,b)=>b.total>a.total?b:a);notices.push({kind:'info',text:`区间最高日用水量：${peak.date}，${peak.total.toFixed(3)} m³。`});}
    for(let i=1;i<daily.length;i++)if(daily[i-1].total>0&&daily[i].total>daily[i-1].total*1.35){notices.push({kind:'attention',text:`${daily[i].date}总表日用水量较前一天上升${((daily[i].total/daily[i-1].total-1)*100).toFixed(1)}%，可查看当日各用户用水。`});break;}
    return {total,subTotal,difference,rate,daily,notices,covered:parts.filter(finite).length,children:db.children.length};
  }
  function bindPressure(db,childId,pressureId){
    const u=childId==='root'?null:db.children.find(x=>x.id===childId);if(childId!=='root'&&!u)throw Error('子用户不存在');
    if(pressureId&&(!(db.pressures||[]).some(p=>p.id===pressureId)||(childId!=='root'&&db.totalPressureId===pressureId)||db.children.some(c=>c.id!==childId&&c.pressureId===pressureId)))throw Error('压力设备已挂接或不可用');
    if(u)u.pressureId=pressureId||null;else db.totalPressureId=pressureId||null;
  }
  function bindMeter(db,childId,meterId){
    if(childId!=='root')return bind(db,childId,meterId);
    if(meterId&&(!db.meters.some(m=>m.id===meterId)||db.children.some(c=>c.meterId===meterId)))throw Error('水表已挂接或不可用');
    db.totalMeterId=meterId||null;
  }
  function render(data,id,mode='assets'){
    contexts.set(sourceKey(data),data);const o=data.nodes.find(x=>x.id===id);
    return eligible(o)?panel(sourceKey(data),id,o.name,mode):'';
  }
  const value=x=>finite(x)?x.toFixed(3):'—';
  function trend(daily){
    const points=daily.flatMap(d=>[d.total,d.subTotal]).filter(finite);
    if(!points.length)return '<p class="floor-empty">所选日期暂无日用水量数据。</p>';
    const max=Math.max(1,...points)*1.1,w=540,h=180,x=i=>42+i*(w-56)/Math.max(1,daily.length-1),y=v=>h-30-v/max*(h-48);
    const lines=key=>{
      const chunks=[];let current=[];
      daily.forEach((d,i)=>{if(finite(d[key]))current.push(`${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`);else if(current.length){chunks.push(current);current=[];}});
      if(current.length)chunks.push(current);
      return chunks.map(c=>`<polyline class="floor-trend-${key}" points="${c.join(' ')}"/>`).join('')+daily.map((d,i)=>finite(d[key])?`<circle class="floor-dot-${key}" cx="${x(i).toFixed(1)}" cy="${y(d[key]).toFixed(1)}" r="2.5"><title>${d.date} ${key==='total'?'总表':'分表合计'} ${value(d[key])} m³</title></circle>`:'').join('');
    };
    return `<figure class="floor-trend"><figcaption><span class="floor-legend-total">三级总表</span><span class="floor-legend-sub">用户分表合计</span><small>m³ / 日</small></figcaption><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="每日总表与用户分表用水量趋势。具体数值见下方每日总分表明细。">${[0,.5,1].map(f=>`<line class="floor-grid" x1="42" x2="${w-14}" y1="${y(max*f)}" y2="${y(max*f)}"/><text x="36" y="${y(max*f)+4}" text-anchor="end">${(max*f).toFixed(0)}</text>`).join('')}${lines('total')}${lines('subTotal')}<text x="42" y="${h-7}">${daily[0].date.slice(5)}</text><text x="${w-14}" y="${h-7}" text-anchor="end">${daily[daily.length-1].date.slice(5)}</text></svg></figure>`;
  }
  function comparison(db,start,end){
    const a=analysis(db,start,end);
    return `<div class="floor-analysis"><h4>总分表用水分析</h4><div class="floor-summary floor-comparison">${[['三级总表 / m³',value(a.total)],['用户分表合计 / m³',value(a.subTotal)],['总分表差量 / m³',value(a.difference)],['总分表差率',finite(a.rate)?a.rate.toFixed(2)+'%':'—']].map(([k,v])=>`<div>${k}<strong>${v}</strong></div>`).join('')}</div><p class="floor-analysis-note">覆盖 ${a.covered} / ${a.children} 个用户水表。差量 = 三级总表 − 用户分表合计；差率 = 差量 ÷ 三级总表。差量可能包含公共用水与计量差异，不直接代表漏损。</p>${trend(a.daily)}<ul class="floor-notices">${a.notices.map(n=>`<li class="floor-notice-${n.kind}">${esc(n.text)}</li>`).join('')}</ul><details class="floor-daily-comparison"><summary>每日总分表明细</summary><div class="floor-table"><table class="app-table"><thead><tr><th>日期</th><th>总表 m³</th><th>分表 m³</th><th>差量 m³</th><th>差率</th></tr></thead><tbody>${a.daily.map(d=>`<tr><td>${d.date}</td><td>${value(d.total)}</td><td>${value(d.subTotal)}</td><td>${value(d.difference)}</td><td>${finite(d.rate)?d.rate.toFixed(2)+'%':'—'}</td></tr>`).join('')}</tbody></table></div></details></div>`;
  }
  function panel(source,id,name,mode='assets'){
    const context=contexts.get(source)||{},external=[...new Map((context.businessDeviceLinks||[]).filter(d=>d.hostId===id).map(d=>[d.id,d])).values()];
    const s=state(source,id),db=enrich(s.db),dates=days(s.start,s.end),rootUser={id:'root',name,meterId:db.totalMeterId,pressureId:db.totalPressureId};
    const preset=db.seedRevision===SEED_REVISION,isData=mode==='monitor',unified=!!root.WaterTable?.render,rows=unified?db.children:db.children.slice((s.page-1)*PAGE_SIZE,s.page*PAGE_SIZE);
    const selected=s.selected==='root'||(!s.selected&&isData)?rootUser:db.children.find(x=>x.id===s.selected);
    const deviceNames=u=>[...new Map([db.meters.find(m=>m.id===u.meterId),db.pressures.find(p=>p.id===u.pressureId),...(u.id==='root'?external:[])].filter(Boolean).map(d=>[d.id,d])).values()].map(d=>{const live=currentMeter(d);return `${esc(live?.name||d.name)}<small>${esc(d.id)}${!live?' · 设备缺失':live.status==='停用'?' · 设备停用':''}</small>`;}).join('<br>')||'未挂接设备';
    const cards=u=>{
      const v=readings(db,u,s.start,s.end);
      if(u.id==='root'&&!db.meters.length){const monitors=(context.businessMonitoring||[]).filter(m=>m.hostId===id);v.flow=monitors.find(m=>m.type==='flow')?.numeric??null;v.pressure=monitors.find(m=>m.type==='pressure')?.numeric??null;}
      const fields=[[preset?'结束日日均流量 / m³/h':'流量 / m³/h',v.flow],...(!preset||db.pressures.length?[['压力 / MPa',v.pressure]]:[]),['累计量示值 / m³',v.total],['时段用水量 / m³',v.volume]];
      return `<div class="floor-summary">${fields.map(([k,x])=>`<div>${k}<strong>${value(x)}</strong></div>`).join('')}</div>${v.status?`<small>${esc(v.status)}，用水读数暂不可用。</small>`:''}`;
    };
    const pages=unified?'':`<div class="floor-pages"><button class="app-button" data-floor-action="prev" ${s.page<=1?'disabled':''}>上一页</button><span>${s.page} / ${Math.max(1,Math.ceil(db.children.length/PAGE_SIZE))} · ${db.children.length}个子用户</span><button class="app-button" data-floor-action="next" ${s.page*PAGE_SIZE>=db.children.length?'disabled':''}>下一页</button></div>`;
    const head=`<header><h3>${isData?'用户用水监测':'子用户与设备'}</h3>${db.meters.some(m=>m.demo)?`<span class="app-tag">${preset?'预设设备 · 示例数据':'演示数据'}</span>`:''}</header>${s.migration?`<p class="floor-analysis-note">${esc(s.migration)}</p>`:''}`;
    const range=isData?`<form data-floor-form="range"><label>开始日期<input class="app-input" type="date" name="start" value="${s.start}" required></label><label>结束日期<input class="app-input" type="date" name="end" value="${s.end}" required></label><button class="app-button">查询</button><button class="app-button" type="button" data-floor-action="recent">最近7天</button></form><small>统计日期 ${s.start} 至 ${s.end}${preset?` · 示例数据范围 ${db.range.start} 至 ${db.range.end}，非实测`:db.meters.some(m=>m.demo)?' · 示例指标时刻 '+s.end+' 23:59':' · 流量、压力为已接入最新值'}</small><div class="floor-monitor-tabs" role="group" aria-label="用水视图"><button class="app-button ${s.tab==='overview'?'is-active':''}" data-floor-action="overview" aria-pressed="${s.tab==='overview'}">查看水量</button><button class="app-button ${s.tab==='analysis'?'is-active':''}" data-floor-action="analysis" aria-pressed="${s.tab==='analysis'}">用水分析</button></div><h4>${esc(name)} · ${preset?'入口三级流量表':'楼栋总表'}</h4>${cards(rootUser)}<small>累计量为表计示值，时段用水量为区间增量。楼栋总表与分表不叠加。</small>`:`<p>直属子用户 <strong>${db.children.length}</strong> 个 · 楼栋挂接设备 <strong>${new Set([db.totalMeterId,db.totalPressureId,...external.map(d=>d.id)].filter(Boolean)).size}</strong> 台</p>${preset?'<p class="floor-analysis-note">每栋宿舍预设10个用户水表；用户序号不代表楼层。入口三级表和用户水表均为待安装预设。</p>':''}<div class="floor-root-devices">${deviceNames(rootUser)}</div><div class="floor-actions"><button class="app-button" data-floor-action="select" data-id="root">楼栋设备挂接</button><button class="app-button" data-action="open-user-monitor" data-value="${esc(id)}">查看用水监测</button></div>`;
    const pressureColumn=!preset||db.pressures.length>0;
    const childColumns=isData?[
      {label:'子用户',value:c=>c.name},
      {label:(preset?'日均流量':'流量')+' m³/h',value:c=>readings(db,c,s.start,s.end).flow},
      ...(pressureColumn?[{label:'压力 MPa',value:c=>readings(db,c,s.start,s.end).pressure}]:[]),
      {label:'累计量 m³',value:c=>readings(db,c,s.start,s.end).total},
      {label:'时段水量 m³',value:c=>readings(db,c,s.start,s.end).volume}
    ]:[{label:'子用户',value:c=>c.name},{label:'挂接设备',value:c=>[c.meterId,c.pressureId,...[...db.meters,...db.pressures].filter(d=>d.id===c.meterId||d.id===c.pressureId).map(d=>currentMeter(d)?.name||d.name)].filter(Boolean).join(' ')},{label:'操作',value:()=>'',filterable:false,sortable:false,searchable:false}];
    const childRow=c=>{const v=isData?readings(db,c,s.start,s.end):null;return isData?`<tr${selected?.id===c.id?' class="is-selected"':''}><td><button class="app-button app-button-link" data-floor-action="select" data-id="${esc(c.id)}">${esc(c.name)}</button></td><td>${value(v.flow)}</td>${pressureColumn?`<td>${value(v.pressure)}</td>`:''}<td>${value(v.total)}</td><td>${value(v.volume)}</td></tr>`:`<tr><td>${esc(c.name)}</td><td>${deviceNames(c)}</td><td><button class="app-button app-button-link" data-floor-action="select" data-id="${esc(c.id)}">挂接设备</button></td></tr>`;};
    const childTable=unified?root.WaterTable.render({key:[source,id,mode,'children'].join('|'),columns:childColumns,rows:db.children,renderRow:childRow,pageSize:PAGE_SIZE}):`<table class="app-table"><thead><tr>${childColumns.map(c=>`<th>${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map(childRow).join('')||`<tr><td colspan="${childColumns.length}">暂无子用户</td></tr>`}</tbody></table>`;
    const table=`${isData?'<h4>用户水表 · 点击查看每日用水</h4>':''}<div class="floor-table ${isData?'floor-monitor-table':''}">${childTable}</div>`;
    const available=(list,field,current)=>list.filter(d=>!db.children.some(c=>c.id!==selected.id&&c[field]===d.id)&&(selected.id==='root'||d.id!==(field==='meterId'?db.totalMeterId:db.totalPressureId))).map(d=>`<option value="${esc(d.id)}" ${current===d.id?'selected':''}>${esc(d.name)} · ${esc(d.id)}</option>`).join('');
    let detail='';
    if(selected){
      detail=`<div class="floor-detail"><h4>${esc(selected.name)} · ${isData?'每日用水':'设备挂接'}</h4>`;
      if(isData){
        const dailyRows=dates.map(date=>({date,...readings(db,selected,date,date)})),dailyColumns=[{label:'日期',value:r=>r.date},{label:'日均流量 m³/h',value:r=>r.meanFlow},...(pressureColumn?[{label:'压力 MPa',value:r=>r.pressure}]:[]),{label:'日末累计量 m³',value:r=>r.total},{label:'日用水量 m³',value:r=>r.volume}];
        const dailyRow=r=>`<tr><td>${r.date}</td><td>${value(r.meanFlow)}</td>${pressureColumn?`<td>${value(r.pressure)}</td>`:''}<td>${value(r.total)}</td><td>${value(r.volume)}</td></tr>`;
        const dailyTable=unified?root.WaterTable.render({key:[source,id,mode,'daily',selected.id].join('|'),columns:dailyColumns,rows:dailyRows,renderRow:dailyRow,pageSize:7}):`<table class="app-table"><thead><tr>${dailyColumns.map(c=>`<th>${c.label}</th>`).join('')}</tr></thead><tbody>${dailyRows.slice((s.dayPage-1)*7,s.dayPage*7).map(dailyRow).join('')}</tbody></table>`;
        detail+=(selected.id==='root'?'':cards(selected))+`<div class="floor-table floor-monitor-table">${dailyTable}</div>${unified?'':`<div class="floor-pages"><button class="app-button" data-floor-action="day-prev" ${s.dayPage<=1?'disabled':''}>上一页</button><span>${s.dayPage} / ${Math.ceil(dates.length/7)} · ${dates.length}天</span><button class="app-button" data-floor-action="day-next" ${s.dayPage*7>=dates.length?'disabled':''}>下一页</button></div>`}${selected.id!=='root'?'<button class="app-button app-button-link" data-floor-action="select" data-id="root">返回楼栋总表</button>':''}`;
      }else detail+=`<form data-floor-form="bind"><label>水表<select class="app-select" name="meter"><option value="">未挂接</option>${available(db.meters,'meterId',selected.meterId)}</select></label>${db.pressures.length?`<label>压力设备<select class="app-select" name="pressure"><option value="">未挂接</option>${available(db.pressures,'pressureId',selected.pressureId)}</select></label>`:'<input type="hidden" name="pressure" value="">'}<button class="app-button">保存设备挂接</button></form>`;
      detail+='</div>';
    }
    const add=isData?'':`<details><summary>${preset?'新增子用户':'新增楼层子用户'}</summary><form data-floor-form="add"><label>子用户名称<input class="app-input" name="name" placeholder="${preset?'例如用户11':'例如7层'}" maxlength="40" required></label><label>${preset?'用户序号':'楼层编号'}<input class="app-input" name="floor" type="number" min="1" step="1" required></label><button class="app-button">新增</button></form></details>`;
    return `<section class="user-floors" data-floor-source="${esc(source)}" data-floor-root="${esc(id)}" data-floor-name="${esc(name)}" data-floor-mode="${mode}">${head}${s.error?`<p role="alert" class="floor-error">${esc(s.error)}</p>`:''}${range}${isData&&s.tab==='analysis'?comparison(db,s.start,s.end):''}${table}${pages}${detail}${add}</section>`;
  }
  function rerender(el){el.outerHTML=panel(el.dataset.floorSource,el.dataset.floorRoot,el.dataset.floorName,el.dataset.floorMode);}
  root.document?.addEventListener('click',e=>{
    const b=e.target.closest('[data-floor-action]');if(!b)return;e.preventDefault();
    const el=b.closest('.user-floors');if(!el)return;
    const s=state(el.dataset.floorSource,el.dataset.floorRoot),a=b.dataset.floorAction;
    if(a==='select'){s.selected=b.dataset.id;s.dayPage=1;}
    if(a==='prev')s.page=Math.max(1,s.page-1);
    if(a==='next')s.page=Math.min(Math.max(1,Math.ceil(s.db.children.length/PAGE_SIZE)),s.page+1);
    if(a==='day-prev')s.dayPage=Math.max(1,s.dayPage-1);
    if(a==='day-next')s.dayPage=Math.min(Math.ceil(days(s.start,s.end).length/7),s.dayPage+1);
    if(a==='overview'||a==='analysis')s.tab=a;
    if(a==='recent'){Object.assign(s,latestRange(s.db));s.dayPage=1;s.error='';}
    rerender(el);
  });
  root.document?.addEventListener('submit',e=>{
    const form=e.target.closest('[data-floor-form]');if(!form)return;e.preventDefault();
    const el=form.closest('.user-floors');if(!el)return;
    const s=state(el.dataset.floorSource,el.dataset.floorRoot),v=new FormData(form);s.error='';
    try{
      if(form.dataset.floorForm==='range'){days(v.get('start'),v.get('end'));s.start=v.get('start');s.end=v.get('end');s.dayPage=1;}
      else{
        const next=clone(s.db);
        if(form.dataset.floorForm==='add')addChild(next,v.get('name'),v.get('floor'));
        else{bindMeter(next,s.selected,v.get('meter'));bindPressure(next,s.selected,v.get('pressure'));}
        root.localStorage.setItem(s.key,JSON.stringify(storedConfig(next)));s.db=next;
      }
    }catch(err){s.error=err.message;}
    rerender(el);
  });
  root.WaterUserHierarchy={seed,days,volume,addChild,bind,render,summary,enrich,readings,cumulative,bindPressure,eligible,analysis,canUpgrade};
  if(typeof module==='object')module.exports=root.WaterUserHierarchy;
})(globalThis);
