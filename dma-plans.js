(() => {
  const copy=v=>JSON.parse(JSON.stringify(v));
  function ensure(store,version,data){
    store.dmaPlans ||= {};
    return store.dmaPlans[version] ||= {activeId:'S1',items:[{id:'S1',name:'现状分区方案',zones:copy(data.zones),created:new Date().toLocaleString('sv-SE'),updated:new Date().toLocaleString('sv-SE'),source:null}]};
  }
  function create(bucket,name,source){
    if(!name.trim())throw Error('请输入方案名称');
    if(bucket.items.some(p=>p.name===name.trim()))throw Error('方案名称已存在');
    const id='S'+(Math.max(0,...bucket.items.map(p=>Number(p.id.slice(1))||0))+1);
    const plan={id,name:name.trim(),zones:copy(source?.zones||[]),source:source?.id||null,created:new Date().toLocaleString('sv-SE'),updated:new Date().toLocaleString('sv-SE')};bucket.items.push(plan);return plan;
  }
  function stats(data,zones){
    const nodes=new Set(data.nodes.map(n=>n.id)),pipes=new Set(data.pipes.map(p=>p.id)),nc=new Map(),pc=new Map();let invalid=0;
    zones.forEach(z=>{z.nodeIds.forEach(id=>{if(!nodes.has(id))invalid++;nc.set(id,(nc.get(id)||0)+1);});z.pipeIds.forEach(id=>{if(!pipes.has(id))invalid++;pc.set(id,(pc.get(id)||0)+1);});});
    return {spatialOverlap:(window.DMAGeometry?.findOverlaps(data,zones)||[]).length,zones:zones.length,nodes:[...nc.keys()].filter(id=>nodes.has(id)).length,pipes:[...pc.keys()].filter(id=>pipes.has(id)).length,unassignedNodes:data.nodes.filter(n=>!nc.has(n.id)).length,unassignedPipes:data.pipes.filter(p=>!pc.has(p.id)).length,overlap:[...nc.values(),...pc.values()].filter(n=>n>1).length,invalid,boundaries:new Set(zones.flatMap(z=>data.pipes.filter(p=>z.nodeIds.includes(p.start)!==z.nodeIds.includes(p.end)).map(p=>p.id))).size};
  }
  function activate(bucket,id,data){const plan=bucket.items.find(p=>p.id===id);if(!plan)throw Error('方案不存在');const s=stats(data,plan.zones);if(!s.zones)throw Error('空方案不能设为在用');if(s.invalid)throw Error('存在已删除的成员，请先修正');if(s.overlap)throw Error('存在重复归属的成员，请先修正');if(s.spatialOverlap)throw Error('存在分区范围空间重叠，请先调整边界或成员');const geometryIssues=window.DMAGeometry?.validateZones(data,plan.zones)||[];if(geometryIssues.length)throw Error(geometryIssues[0].zoneId+'：'+geometryIssues[0].message+'，请重新圈选边界');bucket.activeId=id;}
  function differences(a,b){
    const am=new Map(a.map(z=>[z.id,z])),bm=new Map(b.map(z=>[z.id,z]));
    return [...new Set([...am.keys(),...bm.keys()])].map(id=>{const old=am.get(id),now=bm.get(id);const add=(k)=> (now?.[k]||[]).filter(v=>!old?.[k]?.includes(v)),remove=k=>(old?.[k]||[]).filter(v=>!now?.[k]?.includes(v));const addedNodes=add('nodeIds'),removedNodes=remove('nodeIds'),addedPipes=add('pipeIds'),removedPipes=remove('pipeIds');return {id,old,now,addedNodes,removedNodes,addedPipes,removedPipes,changed:!old||!now||old.name!==now.name||old.parent!==now.parent||addedNodes.length+removedNodes.length+addedPipes.length+removedPipes.length>0};});
  }
  function members(a,b){
    const result={common:{nodes:[],pipes:[]},a:{nodes:[],pipes:[]},b:{nodes:[],pipes:[]}};
    for(const [field,key] of [['nodeIds','nodes'],['pipeIds','pipes']]){
      const left=new Set(a?.[field]||[]),right=new Set(b?.[field]||[]);
      result.common[key]=[...left].filter(id=>right.has(id));
      result.a[key]=[...left].filter(id=>!right.has(id));
      result.b[key]=[...right].filter(id=>!left.has(id));
    }
    return result;
  }
  window.DMAPlans={ensure,create,stats,activate,differences,members};
})();
