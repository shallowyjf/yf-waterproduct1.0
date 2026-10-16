/* Local operational records. No SCADA ingestion, server scheduler or field dispatch. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WaterOperations = api;
})(typeof window === 'object' ? window : globalThis, function() {
  'use strict';
  const teams = ['城南运维班', '城北运维班', '城东运维班', '城西运维班', '机电维护班', '管线巡检班'];
  const copy = v => JSON.parse(JSON.stringify(v));
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const stamp = () => new Date().toISOString();
  const terminal = w => ['已完成', '已取消'].includes(w.status);
  function empty() { return {version:1, seq:0, tasks:[], orders:[], alarms:[], seeded:false}; }
  function log(record, text, actor = '系统管理员（本地演示）') {
    (record.logs ||= []).push({time:stamp(), text, actor});
  }
  function id(db, prefix) { return `${prefix}-${Date.now()}-${++db.seq}`; }
  function route(data, stops) {
    check(Array.isArray(stops) && stops.length >= 2, '请选择起点和终点');
    const nodes = new Map(data.nodes.map(n => [n.id, n]));
    stops.forEach(n => check(nodes.has(n), `节点 ${n || '（未选择）'} 不存在，请重新选择`));
    check(stops.every((n,i) => !i || n !== stops[i-1]), '相邻巡检点不能相同');
    check(new Set(stops.slice(0,-1)).size === stops.length-1 && !stops.slice(1,-1).includes(stops.at(-1)), '途经点不能重复；闭环路线可将终点设为起点');
    const graph = new Map(data.nodes.map(n => [n.id, []]));
    for (const p of data.pipes) if (nodes.has(p.start) && nodes.has(p.end) && Number.isFinite(+p.length) && +p.length > 0) {
      graph.get(p.start).push({to:p.end, pipe:p}); graph.get(p.end).push({to:p.start, pipe:p});
    }
    const path = [], pipeIds = []; let length = 0;
    for (let i = 1; i < stops.length; i++) {
      const distance = new Map([[stops[i-1],0]]), previous = new Map(), pending = new Set(nodes.keys());
      while (pending.size) {
        let at = null, best = Infinity;
        for (const n of pending) if ((distance.get(n) ?? Infinity) < best) { at=n; best=distance.get(n); }
        if (at === null || at === stops[i]) break;
        pending.delete(at);
        for (const edge of graph.get(at)) if (pending.has(edge.to) && best + +edge.pipe.length < (distance.get(edge.to) ?? Infinity)) {
          distance.set(edge.to,best + +edge.pipe.length); previous.set(edge.to,{from:at,pipe:edge.pipe.id});
        }
      }
      check(distance.has(stops[i]), `${stops[i-1]} 至 ${stops[i]} 无有效管网连接，请调整路线或修复拓扑`);
      let at = stops[i]; const segment = [at], pipes = [];
      while (at !== stops[i-1]) { const p = previous.get(at); pipes.unshift(p.pipe); at=p.from; segment.unshift(at); }
      path.push(...(i===1?segment:segment.slice(1))); pipeIds.push(...pipes); length += distance.get(stops[i]);
    }
    return {stops:copy(stops), path, pipeIds, length, nodes:stops.map(n => copy(nodes.get(n)))};
  }
  function signature(data, r) {
    return JSON.stringify({nodes:[...new Set(r.path)].map(id=>data.nodes.find(n=>n.id===id)),pipes:[...new Set(r.pipeIds)].map(id=>data.pipes.find(p=>p.id===id))});
  }
  function validDate(value) { return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value)); }
  function saveTask(db, input, data, topology) {
    check(input.name?.trim(), '请输入巡检任务名称');
    check(!db.tasks.some(t=>t.id!==input.id && t.name===input.name.trim()), '巡检任务名称已存在');
    check(teams.includes(input.assignee), '请选择有效的工单派发班组');
    check(['once','day','week','month'].includes(input.frequency), '请选择巡检频率');
    check(Number.isInteger(+input.interval) && +input.interval>=1 && +input.interval<=365, '巡检间隔须为 1–365 的整数');
    check(Number.isFinite(+input.hours) && +input.hours>=1 && +input.hours<=720, '完成时限须为 1–720 小时');
    check(validDate(input.nextAt), '请选择首次或下次执行时间');
    check(input.instructions?.trim(), '请填写巡检要求');
    check(input.accessConfirmed === true, '请确认已核实现场通行条件');
    const r = route(data,input.stops), existing = db.tasks.find(t=>t.id===input.id);
    check(!input.id || existing, '巡检任务不存在');
    const task = {...copy(input), name:input.name.trim(), interval:+input.interval, hours:+input.hours, nextAt:new Date(input.nextAt).toISOString(), topology, route:r, signature:signature(data,r), id:existing?.id || id(db,'INS'), enabled:existing?.enabled ?? true, logs:existing?.logs || [], revision:(existing?.revision||0)+1};
    log(task, existing?'编辑任务；下次生成工单使用新配置':'创建巡检任务');
    if (existing) db.tasks[db.tasks.indexOf(existing)] = task; else db.tasks.push(task);
    return task;
  }
  function validateTask(task, data, topology) {
    check(task.topology===topology, '任务绑定的拓扑已变更，请编辑任务并重新确认路线');
    const r = route(data,task.stops);
    check(task.signature===signature(data,r), '路线相关节点或管线已变更，请编辑任务并重新确认');
    return r;
  }
  function nextOccurrence(task) {
    if (task.frequency==='once') return null;
    const d = new Date(task.nextAt), count = task.interval;
    // Schedules are defined in Asia/Shanghai; use a shifted UTC calendar independent of browser timezone.
    const local = new Date(d.getTime()+8*3600000);
    if (task.frequency==='month') {
      const day=local.getUTCDate(); local.setUTCDate(1); local.setUTCMonth(local.getUTCMonth()+count);
      const last = new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+1,0)).getUTCDate();
      local.setUTCDate(Math.min(task.anchorDay || day,last));
    } else local.setUTCDate(local.getUTCDate()+count*(task.frequency==='week'?7:1));
    return new Date(local.getTime()-8*3600000).toISOString();
  }
  function createOrder(db, input, data) {
    check(input.name?.trim(), '请输入工单名称');
    check([...data.nodes,...data.pipes].some(n=>n.id===input.hostId), '请选择有效的关联对象');
    check(teams.includes(input.assignee), '请选择有效的派发班组');
    check(validDate(input.dueAt) && Date.parse(input.dueAt)>Date.now(), '要求完成时间须晚于当前时间');
    check(['普通','紧急'].includes(input.priority), '请选择优先级');
    check(input.instructions?.trim(), '请填写处理要求');
    if(input.alarmId) {
      const a=db.alarms.find(a=>a.id===input.alarmId);
      check(a && a.status!=='已关闭', '报警不存在或已关闭');
      const existing=db.orders.find(w=>w.alarmId===a.id && w.status!=='已取消');
      if(existing) return existing;
    }
    const order = {...copy(input), id:id(db,'WO'), name:input.name.trim(), createdAt:stamp(), status:'待派单', logs:[]};
    db.orders.push(order); log(order,'创建工单');
    if(input.alarmId) { const a=db.alarms.find(a=>a.id===input.alarmId); a.orderId=order.id; log(a,`生成工单 ${order.id}`); }
    return order;
  }
  function issue(db, taskId, data, topology, now=Date.now()) {
    const task=db.tasks.find(t=>t.id===taskId); check(task,'巡检任务不存在');
    check(task.enabled, '任务已暂停'); check(task.nextAt,'单次任务已生成工单');
    check(Date.parse(task.nextAt)<=now, '尚未到执行时间');
    validateTask(task,data,topology);
    check(!db.orders.some(w=>w.taskId===task.id && !terminal(w)), '上次巡检工单尚未闭环，请先处理');
    const occurrence=task.nextAt, key=`${task.id}|${occurrence}`;
    check(!db.orders.some(w=>w.occurrenceKey===key), '本期工单已生成');
    const order={id:id(db,'WO'), name:task.name, taskId:task.id, taskRevision:task.revision, occurrenceKey:key, scheduledAt:occurrence, createdAt:new Date(now).toISOString(), dueAt:new Date(now+task.hours*3600000).toISOString(), assignee:task.assignee, priority:'普通', instructions:task.instructions, hostId:task.stops[0], topology, route:copy(task.route), status:'待接单', results:task.stops.map(nodeId=>({nodeId,result:'',note:''})), logs:[]};
    db.orders.push(order); log(order,`按巡检任务第 ${task.revision} 版生成并派发（本地记录）`);
    task.nextAt=nextOccurrence(task); if (!task.nextAt) task.enabled=false;
    log(task,`生成本期工单 ${order.id}；逾期按次补办，不批量补发`); return order;
  }
  function transition(db, orderId, action, payload={}) {
    const w=db.orders.find(w=>w.id===orderId); check(w,'工单不存在');
    const rules={dispatch:['待派单','待接单'],accept:['待接单','处理中'],submit:['处理中','待验收'],approve:['待验收','已完成'],reject:['待验收','处理中']};
    if(action==='cancel') { check(['待派单','待接单'].includes(w.status),'仅未开始的工单可取消'); check(payload.note?.trim(),'请填写取消原因'); w.status='已取消'; }
    else {
      const rule=rules[action]; check(rule && w.status===rule[0], '当前状态不允许此操作，请刷新后重试');
      if(action==='dispatch') { check(teams.includes(payload.assignee),'请选择有效班组'); w.assignee=payload.assignee; }
      if(action==='submit') {
        check(payload.note?.trim(),'请填写处理结果');
        if(w.results) {
          check(payload.results?.length===w.results.length,'请逐点填写巡检结果');
          payload.results.forEach((r,i)=>{check(r.nodeId===w.results[i].nodeId && ['正常','异常','无法到达'].includes(r.result),'请逐点填写巡检结果');check(r.result==='正常'||r.note?.trim(),'异常或无法到达必须填写说明');});
          w.results=copy(payload.results);
        }
        w.result=payload.note.trim();
      }
      if(action==='approve'||action==='reject') check(payload.note?.trim(),'请填写验收意见');
      if(action==='approve' && w.results?.some(r=>r.result!=='正常')) check(db.orders.some(d=>d.id===w.defectOrderId&&d.status!=='已取消'),'存在异常或无法到达的巡检点，请先生成有效的缺陷跟进工单');
      w.status=rule[1];
    }
    if(terminal(w)) w.closedAt=stamp();
    log(w,`${{dispatch:'派发',accept:'接单并开始',submit:'提交验收',approve:'验收通过',reject:'退回整改',cancel:'取消'}[action]}${payload.note?'：'+payload.note.trim():''}`);
    return w;
  }
  function saveProgress(db, orderId, payload) {
    const w=db.orders.find(w=>w.id===orderId);check(w?.status==='处理中','仅处理中的工单可暂存进度');
    if(w.results){
      check(payload.results?.length===w.results.length,'巡检点数量不匹配');
      payload.results.forEach((r,i)=>check(r.nodeId===w.results[i].nodeId&&['','正常','异常','无法到达'].includes(r.result),'巡检点或结果不合法'));
      w.results=copy(payload.results);
    }
    w.result=payload.note||'';log(w,'暂存处理进度');return w;
  }
  function alarmAction(db, alarmId, action, note) {
    const a=db.alarms.find(a=>a.id===alarmId); check(a,'报警不存在');
    if(action==='ack') { check(a.status==='待确认','该报警已确认'); a.status='已确认'; }
    else if(action==='recover') { check(a.status!=='已关闭'&&!a.recoveredAt,'该报警已恢复或关闭'); check(note?.trim(),'请填写恢复依据'); a.recoveredAt=stamp(); }
    else if(action==='close') {
      check(a.status==='已确认','请先确认报警');check(a.recoveredAt,'报警尚未恢复，不能关闭');check(note?.trim(),'请填写关闭说明');
      check(!db.orders.some(w=>w.alarmId===a.id&&!terminal(w)), '关联工单尚未完成验收');
      a.status='已关闭'; a.closedAt=stamp();
    } else throw Error('不支持的报警操作');
    log(a,`${{ack:'确认报警',recover:'模拟信号恢复',close:'关闭报警'}[action]}${note?'：'+note.trim():''}`);
  }
  function seed(db, model, topology) {
    if(db.seeded) return;
    for(const e of model.events.filter(e=>e.type==='alarm')) {
      const m=model.monitors?.find(m=>m.id===e.monitorId);
      db.alarms.push({...copy(e),topology,status:'待确认',createdAt:stamp(),level:e.id==='ALM-032'?'严重':'重要',triggerValue:m?.value||'未附带',triggerQuality:m?.quality||'未附带',threshold:e.id==='ALM-032'?'压力 < 0.200 MPa':'数据延迟 > 10 分钟',sample:true,logs:[]});
    }
    db.seeded=true;
  }
  return {teams,copy,empty,route,signature,saveTask,validateTask,nextOccurrence,createOrder,issue,transition,saveProgress,alarmAction,seed,terminal};
});
