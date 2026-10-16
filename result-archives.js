(function(root,factory){const api=factory(root.WaterHydraulics||(typeof require==='function'?require('./hydraulics-data.js'):null));root.WaterResultArchives=api;if(typeof module==='object'&&module.exports)module.exports=api;})(globalThis,function(H){
 'use strict';
 const domain=r=>r.domain==='quality'||['qualityScenes','qualityEvent'].includes(r.kind)?'quality':'hydraulic';
 const stamp=(day,h)=>`${day}T${String(h).padStart(2,'0')}:00:00+08:00`;
 function points(run){return (run.frames||[]).flatMap((f,index)=>f&&(!run.availableHours||run.availableHours.includes(f.hour))?[{runId:run.id,index,time:run.calculationTime||stamp(run.date,f.hour)}]:[]).filter(p=>Number.isFinite(Date.parse(p.time))).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));}
 function describe(entry,refs){return {...entry,points:refs,start:refs[0]?.time,end:refs.at(-1)?.time,count:refs.length};}
 function list(db,wanted){const groups=new Map();for(const r of db.runs){if(!r.snapshot?.nodes?.length||r.kind==='agingAnalysis'||wanted&&domain(r)!==wanted)continue;const key=JSON.stringify([domain(r),r.topology,r.sceneId||r.id,r.revision||0,r.snapshot]);let g=groups.get(key);if(!g){g={id:'auto:'+r.id,name:r.name||'历史仿真',topology:r.topology,domain:domain(r),revision:r.revision||0,createdAt:r.createdAt,source:r.archiveSource||'计算结果',points:[]};groups.set(key,g);}g.points.push(...points(r));}
 const auto=[...groups.values()].map(g=>{const unique=new Map();for(const p of g.points)if(!unique.has(p.time))unique.set(p.time,p);return describe(g,[...unique.values()].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)));});
 const saved=(db.resultArchives||[]).filter(a=>!wanted||a.domain===wanted).map(a=>describe(a,a.points.filter(p=>db.runs.some(r=>r.id===p.runId&&r.frames[p.index]))));
 return [...saved,...auto].filter(a=>a.count).sort((a,b)=>Date.parse(b.start)-Date.parse(a.start)||a.name.localeCompare(b.name));}
 const date=v=>Date.parse(v?.length===16?v+':00+08:00':v);
 function filter(rows,q){if(q.start&&q.end&&date(q.start)>date(q.end))throw Error('开始时间不能晚于结束时间');return rows.filter(a=>(!q.topology||a.topology===q.topology)&&(!q.name||a.name.toLowerCase().includes(q.name.toLowerCase()))&&(!q.start||Date.parse(a.end)>=date(q.start))&&(!q.end||Date.parse(a.start)<=date(q.end)));}
 function save(db,source,name,start,end){if(!name?.trim())throw Error('请输入归档名称');const a=source.points.findIndex(p=>p.time===start),b=source.points.findIndex(p=>p.time===end);if(a<0||b<a)throw Error('请选择有效的开始、结束时刻');const entry=describe({id:'AR-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name:name.trim(),topology:source.topology,domain:source.domain,revision:source.revision,source:'时段归档',createdAt:new Date().toISOString()},H.clone(source.points.slice(a,b+1)));(db.resultArchives||=[]).unshift(entry);return entry;}
 function view(db,archive,index){const ref=archive.points[index],r=db.runs.find(r=>r.id===ref?.runId);if(!r)throw Error('所选结果不存在');return {...r,id:archive.id,date:ref.time.slice(0,10),availableHours:[r.frames[ref.index].hour]};}
 function csv(db,archive){const metrics=archive.domain==='quality'?['chlorine','age','source','tracer','pressure','flow']:['pressure','flow','loss','velocity','age','head'];
 const cell=v=>'"'+String(typeof v==='string'&&/^[\s]*[=+@-]/.test(v)?'\t'+v:v??'').replace(/"/g,'""')+'"';
 const rows=[['归档','拓扑','计算时刻','结果版本','对象编号','名称','类型',...metrics.map(k=>H.metrics[k].name+' / '+H.metrics[k].unit)]];
 for(const ref of archive.points){const r=db.runs.find(r=>r.id===ref.runId),f=r.frames[ref.index];for(const n of r.snapshot.nodes.concat(r.snapshot.pipes)){const values=(n.type==='pipe'?f.pipes:f.nodes)[n.id]||{};rows.push([archive.name,r.topology,ref.time,'R'+(r.revision||0),n.id,n.name,n.type,...metrics.map(k=>Number.isFinite(values[k])?values[k]:'')]);}}
 return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n');}
 function bundle(db,archive){const copy=H.clone(archive),runs=[];for(const id of new Set(archive.points.map(p=>p.runId))){const original=db.runs.find(r=>r.id===id),indexes=[...new Set(archive.points.filter(p=>p.runId===id).map(p=>p.index))],r=H.clone(original);r.frames=indexes.map(i=>original.frames[i]);r.availableHours=r.frames.map(f=>f.hour);copy.points.filter(p=>p.runId===id).forEach(p=>p.index=indexes.indexOf(p.index));runs.push(r);}return {format:'water-result-archive',version:1,exportedAt:new Date().toISOString(),archive:copy,runs};}

 return {domain,points,list,filter,save,view,csv,bundle};
});
