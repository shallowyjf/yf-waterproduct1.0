(function() {
  'use strict';
  const O=window.WaterOperations;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=v=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';
  const inputDate=v=>v?new Date(new Date(v).getTime()+8*3600000).toISOString().slice(0,16):'';
  const fromInput=v=>v?`${v}:00+08:00`:'';
  const btn=(action,text,id='',primary=false,disabled=false)=>`<button type="button" class="app-button ${primary?'app-button-primary':''}" data-ops="${action}" data-id="${esc(id)}" ${disabled?'disabled':''}>${esc(text)}</button>`;
  const options=(rows,value,placeholder='请选择')=>`<option value="">${placeholder}</option>`+rows.map(r=>{const [id,name]=Array.isArray(r)?r:[r,r];return `<option value="${esc(id)}" ${id===value?'selected':''}>${esc(name)}</option>`;}).join('');
  const field=(title,html)=>`<label class="ops-field"><span>${title}</span>${html}</label>`;
  const input=(name,value,type='text',extra='')=>`<input class="app-input" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`;
  const select=(name,rows,value)=>`<select class="app-select" name="${name}">${options(rows,value)}</select>`;
  const badge=s=>`<span class="ops-badge ${['已完成','已关闭'].includes(s)?'is-done':''}">${esc(s)}</span>`;
  window.createOperationsUI=function(ctx) {
    let project=null, draft=null, workDraft=null, selected=null, filter={query:'',status:'',start:'',end:''}, error='', notice='', loadError='', feedback={}, lastPage=null, dispatchOpen=false;
    function context() { const c=ctx(); if(project!==c.project){project=c.project;draft=null;workDraft=null;selected=null;filter={query:'',status:'',start:'',end:''};error='';notice='';feedback={};} return c; }
    const key=()=>`water-operations:v1:${context().project}`;
    function load() {
      try { const raw=localStorage.getItem(key()), db=raw?JSON.parse(raw):O.empty();
        if(db.version!==1||!['tasks','orders','alarms'].every(k=>Array.isArray(db[k])))throw Error('记录格式不兼容');
        if(!db.seeded){O.seed(db,context().model,context().topology);localStorage.setItem(key(),JSON.stringify(db));}loadError='';return db;
      } catch(e) { loadError='本地业务记录读取失败，已停止写入，请先备份并检查浏览器存储：'+e.message; return O.empty(); }
    }
    function mutate(fn) {
      const db=load(); if(loadError)throw Error(loadError);
      const result=fn(db); try{localStorage.setItem(key(),JSON.stringify(db));}catch(e){throw Error('保存失败，操作未生效。请检查浏览器存储空间或权限。');}
      return result;
    }
    function ensureActive() { if(context().topology!==context().activeTopology)throw Error('请切换到使用中拓扑后操作'); }
    const nodes=()=>context().model.data.nodes.map(n=>[n.id,`${n.id} · ${n.name}`]);
    const objects=()=>[...context().model.data.nodes,...context().model.data.pipes].map(n=>[n.id,`${n.id} · ${n.name}`]);
    function taskForm() {
      if(!draft)return '';
      let preview='',r=null;
      try{r=O.route(context().model.data,draft.stops);preview=routeMap(r);}catch(e){preview=`<p class="ops-warning">${esc(e.message)}</p>`;}
      return `<section class="ops-card" id="opsTaskEditor"><header><div><h2>${draft.id?'编辑':'新建'}巡检任务</h2><p>选择现场巡检顺序，路线绑定当前已保存拓扑 ${esc(context().topology)}。</p></div>${btn('cancel-form','取消')}</header><form id="opsTaskForm"><div class="ops-editor-grid"><div><div class="ops-form-grid">${field('任务名称 *',input('name',draft.name,'text','maxlength="80" required'))}${field('巡检执行班组 *',select('assignee',O.teams,draft.assignee))}${field('巡检频率 *',select('frequency',[['once','单次'],['day','按天'],['week','按周'],['month','按月']],draft.frequency))}${field('每隔 N 个周期 *',input('interval',draft.interval,'number','min="1" max="365" step="1"'))}${field('下次执行时间（北京时间） *',input('nextAt',inputDate(draft.nextAt),'datetime-local'))}${field('完成时限（小时） *',input('hours',draft.hours,'number','min="1" max="720"'))}</div><h3>巡检路线</h3><p class="ops-muted">途经点可添加、删除或调整顺序；闭环路线允许终点与起点相同。</p>${draft.stops.map((id,i)=>`<div class="ops-stop"><strong>${i===0?'起点':i===draft.stops.length-1?'终点':`途经 ${i}`}</strong><select class="app-select" name="stop" aria-label="${i===0?'起点节点':i===draft.stops.length-1?'终点节点':`途经点 ${i}`}">${options(nodes(),id,'选择节点')}</select>${i>0&&i<draft.stops.length-1?`${btn('stop-up','上移',i,false,i===1)}${btn('stop-down','下移',i,false,i===draft.stops.length-2)}${btn('stop-remove','移除',i)}`:''}</div>`).join('')}${btn('stop-add','添加途经点')}${field('巡检要求 *',`<textarea class="app-input" name="instructions" rows="3" maxlength="2000">${esc(draft.instructions)}</textarea>`)}<label class="ops-check"><input name="accessConfirmed" type="checkbox" ${draft.accessConfirmed?'checked':''}>已核实现场通行、设施开放及作业条件 *</label><footer>${btn('preview','校验并预览路线')}${btn('task-save','保存巡检任务','',true)}</footer></div><aside class="ops-preview"><h3>路线预览</h3>${preview}<p>线路按管网最短管长连接所选点，不代表道路导航或现场步行距离。经过的中间节点不自动列为必检点。</p><p>按设定频率安排巡检；修改任务配置只影响后续执行。</p>${r?`<strong>${draft.stops.length} 个必检点 · 沿管网 ${(r.length/1000).toFixed(2)} km</strong>`:''}</aside></div></form></section>`;
    }
    function routeMap(r) {
      const data=context().model.data, byId=new Map(data.nodes.map(n=>[n.id,n]));
      const points=r.path.map(id=>byId.get(id)).filter(Boolean);
      if(!points.length)return '<p>无可显示节点</p>';
      const xs=data.nodes.map(n=>+n.x),ys=data.nodes.map(n=>+n.y), minX=Math.min(...xs)-30,minY=Math.min(...ys)-30,w=Math.max(...xs)-minX+30,h=Math.max(...ys)-minY+30;
      const lines=data.pipes.map(p=>{const a=byId.get(p.start),b=byId.get(p.end);return a&&b?`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`:'';}).join('');
      return `<svg class="ops-route-map" viewBox="${minX} ${minY} ${w} ${h}" role="img" aria-label="巡检路线：橙色为沿管网参考路线，编号为必检点顺序"><g stroke="#c4d3df" stroke-width="2">${lines}</g><polyline points="${points.map(n=>`${n.x},${n.y}`).join(' ')}" fill="none" stroke="#ef8b26" stroke-width="5"/>${r.stops.map((id,i)=>{const n=byId.get(id);return n?`<g><circle cx="${n.x}" cy="${n.y}" r="12" fill="#1677ff"/><text x="${n.x}" y="${+n.y+4}" text-anchor="middle" font-size="12" fill="white">${i+1}</text><title>${esc(id)} · ${esc(n.name)}</title></g>`:'';}).join('')}</svg><ol class="ops-route-list">${r.nodes.map(n=>`<li>${esc(n.id)} · ${esc(n.name)}</li>`).join('')}</ol>`;
    }
    function taskWorkspace(){const M=window.WaterMapLayout,c=context(),wrap=document.createElement('div');wrap.innerHTML=taskForm();const form=wrap.querySelector('#opsTaskForm');form.querySelector('.ops-preview').remove();let route=null,issue='';try{route=O.route(c.model.data,draft.stops);}catch(e){issue=e.message;}const routeWrap=document.createElement('div');routeWrap.innerHTML=routeMap(route||{path:c.model.data.nodes.slice(0,1).map(n=>n.id),stops:[],nodes:[]});const svg=routeWrap.querySelector('svg'),points=(route?.path||draft.stops).map(id=>c.model.data.nodes.find(n=>n.id===id)).filter(Boolean);return `<div class="ops-page map-route-page"><div class="map-route-editor" data-map-workspace="inspection-route"><header data-map-slot="toolbar"><strong>${draft.id?'编辑':'新建'}巡检任务</strong>${btn('cancel-form','返回任务列表')}</header><div data-map-slot="canvas">${svg?.outerHTML||''}</div>${M.left('<label><input type="checkbox" data-map-layer=".ops-route-map>g" checked>管网与节点</label><label><input type="checkbox" data-map-layer=".ops-route-map>polyline" checked>巡检路线</label>',M.issues(issue?`<div class="ops-warning" style="padding:12px">${esc(issue)}</div>`:'',issue?1:0))}<aside data-map-slot="right" aria-label="详情表单"><header class="map-panel-head"><strong>巡检任务配置</strong></header>${form.outerHTML}</aside>${M.bottom(table(['顺序','对象编号','名称','检查点','操作'],points.map((n,i)=>[i+1,esc(n.id),esc(n.name),draft.stops.includes(n.id)?'必检点':'途经节点',`<button class="app-button" data-map-focus data-map-x="${+n.x}" data-map-y="${+n.y}">定位</button>`])),'巡检路线对象')}<div class="map-view-tools"><button class="app-button" data-map-view="in">＋</button><button class="app-button" data-map-view="out">−</button><button class="app-button" data-map-view="extent">全图</button></div>${messages()}</div></div>`;}
    function taskList(db, dispatch=false) {
      const rows=db.tasks.filter(t=>`${t.id} ${t.name} ${t.assignee}`.includes(filter.query));
      return table(['巡检任务','路线 / 拓扑','频率 / 下次执行','派发对象','状态','操作'],rows.map(t=>{
        let problem='';try{O.validateTask(t,context().model.data,context().topology);}catch(e){problem=e.message;}
        return [`<strong>${esc(t.name)}</strong><small>${esc(t.id)}</small>`,`${esc(t.stops.join(' → '))}<small>${esc(t.topology)} · 第 ${t.revision} 版</small>`,`${frequency(t)}<small>${date(t.nextAt)}</small>`,esc(t.assignee),`${badge(t.enabled?'启用':'暂停')}${problem?`<small class="ops-warning">${esc(problem)}</small>`:''}`,dispatch ? btn('task-issue','生成本期工单',t.id,true,!!problem||!t.enabled||!t.nextAt||Date.parse(t.nextAt)>Date.now()) : `${btn('task-edit','编辑',t.id)}${btn('task-toggle',t.enabled?'暂停':'启用',t.id)}`];
      }));
    }
    function frequency(t){return t.frequency==='once'?'单次':`每 ${t.interval} ${ {day:'天',week:'周',month:'月'}[t.frequency]}`;}
    function table(heads,rows){return `<div class="ops-table-wrap"><table class="app-table"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${heads.length}"><div class="app-empty">暂无符合条件的记录</div></td></tr>`}</tbody></table></div>`;}
    function workForm(){
      if(!workDraft)return '';
      return `<section class="ops-card"><header><h2>${workDraft.alarmId?'报警转工单':'新建工单'}</h2>${btn('cancel-form','取消')}</header><form id="opsWorkForm"><div class="ops-form-grid">${field('工单名称 *',input('name',workDraft.name,'text','maxlength="100"'))}${field('关联对象 *',select('hostId',objects(),workDraft.hostId))}${field('派发对象 *',select('assignee',O.teams,workDraft.assignee))}${field('优先级 *',select('priority',['普通','紧急'],workDraft.priority))}${field('要求完成（北京时间） *',input('dueAt',inputDate(workDraft.dueAt),'datetime-local'))}${field('处理要求 *',`<textarea class="app-input" name="instructions" rows="3">${esc(workDraft.instructions)}</textarea>`)}</div><footer>${btn('work-save','保存工单','',true)}</footer></form></section>`;
    }
    function logs(record){return `<details class="ops-logs"><summary>流转记录（${record.logs?.length||0}）</summary>${(record.logs||[]).map(l=>`<p><time>${date(l.time)}</time> · ${esc(l.actor)}<br>${esc(l.text)}</p>`).join('')}</details>`;}
    function detail(db,kind){
      const r=(kind==='alarm'?db.alarms:db.orders).find(r=>r.id===selected);if(!r)return '';
      const history=kind==='alarm'?r.status==='已关闭':O.terminal(r);
      let actions='';
      if(kind==='alarm'){
        actions=`<div class="ops-facts">${badge(r.status)}<span>信号：${r.recoveredAt?'已恢复':'未恢复'}</span><span>来源：模拟报警</span><span>关联工单：${r.orderId?esc(r.orderId):'无'}</span>${r.closedAt?`<span>归档：${date(r.closedAt)}</span>`:''}</div><p>触发条件（模拟）：${esc(r.threshold||'未附带')} · 触发值：${esc(r.triggerValue||'未附带')} · 质量码：${esc(r.triggerQuality||'未附带')}</p>${field('恢复依据 / 关闭说明',`<textarea id="opsNote" class="app-input" rows="2"></textarea>`)}<footer>${btn('alarm-ack','确认报警',r.id,true,r.status!=='待确认')}${btn('alarm-work',r.orderId?'查看关联工单':'转工单',r.id,false,history&&!r.orderId)}${btn('alarm-recover','模拟信号恢复',r.id,false,history||!!r.recoveredAt)}${btn('alarm-close','关闭归档',r.id,false,history)}</footer>`;
      }else{
        actions=`<div class="ops-facts">${badge(r.status)}<span>${esc(r.assignee)}</span><span>截止：${date(r.dueAt)}</span><span>拓扑：${esc(r.topology)}</span>${r.closedAt?`<span>归档：${date(r.closedAt)}</span>`:''}${r.taskId?`<span>巡检任务第 ${r.taskRevision} 版</span>`:''}</div><p><strong>处理要求：</strong>${esc(r.instructions)}</p>${r.results?`<h3>逐点巡检结果</h3>${r.results.map((v,i)=>`<div class="ops-result" data-result-index="${i}"><strong>${i+1}. ${esc(v.nodeId)} · ${esc(r.route.nodes[i]?.name)}</strong><select class="app-select" name="result" ${r.status!=='处理中'?'disabled':''}>${options(['正常','异常','无法到达'],v.result,'选择巡检结果')}</select><input class="app-input" name="resultNote" placeholder="异常 / 无法到达的原因及现场情况" value="${esc(v.note)}" ${r.status!=='处理中'?'disabled':''}></div>`).join('')}`:''}${r.result?`<p><strong>上次处理结果：</strong>${esc(r.result)}</p>`:''}${r.defectOrderId?`<p>缺陷跟进：${btn('work-detail',r.defectOrderId,r.defectOrderId)}</p>`:''}${history?'':field('处理结果 / 验收意见 / 取消原因 *',`<textarea id="opsNote" class="app-input" rows="3" placeholder="填写本次操作说明">${r.status==='处理中'?esc(r.result||''):''}</textarea>`)}<footer>${r.status==='待派单'?`${select('dispatchTeam',O.teams,r.assignee)}${btn('order-dispatch','派发工单',r.id,true)}`:''}${r.status==='待接单'?btn('order-accept','接单并开始处理',r.id,true):''}${r.status==='处理中'?btn('order-progress','暂存进度',r.id)+btn('order-submit','提交验收',r.id,true):''}${r.status==='待验收'?`${btn('order-approve','验收通过',r.id,true)}${btn('order-reject','退回整改',r.id)}${r.results?.some(v=>v.result!=='正常')&&!db.orders.some(d=>d.id===r.defectOrderId&&d.status!=='已取消')?btn('defect-create','生成缺陷跟进工单',r.id):''}`:''}${['待派单','待接单'].includes(r.status)?btn('order-cancel','取消工单',r.id):''}</footer>`;
      }
      if(feedback[r.id]) {
        actions=actions.replace(/(<textarea id="opsNote"[^>]*>).*?(<\/textarea>)/s,(_,a,b)=>a+esc(feedback[r.id].note)+b);
      }
      return `<section class="ops-card" id="opsDetail"><header><div><h2>${esc(r.name)}</h2><p>${esc(r.id)}</p></div><div>${btn('locate','地图定位',r.hostId,false,!context().model.objects.has(r.hostId))}${btn('detail-close','收起')}</div></header>${actions}${logs(r)}<p class="ops-muted">派发、接单和验收由当前浏览器模拟操作，尚未连接班组账号与现场终端。</p></section>`;
    }
    function matches(r,history){
      const d=inputDate(history?r.closedAt:r.createdAt).slice(0,10);
      return `${r.id} ${r.name} ${r.hostId} ${r.assignee||''}`.includes(filter.query)&&(!filter.status||r.status===filter.status)&&(!filter.start||d>=filter.start)&&(!filter.end||d<=filter.end);
    }
    function enterPage(page) {
      context();if(lastPage!==page){filter={query:'',status:'',start:'',end:''};lastPage=page;error='';notice='';dispatchOpen=false;}
    }
    const messages=()=>`${error||loadError?`<div class="ops-error" role="alert">${esc(error||loadError)}</div>`:''}${notice?`<div class="ops-notice" role="status">${esc(notice)}</div>`:''}`;
    function render(page){
      if(page!=='p16')return renderMap(page);
      enterPage(page);const db=load();if(draft)return taskWorkspace();
      return `<div class="ops-page"><header class="ops-page-header"><div><h1>巡检管理</h1><p>管理巡检任务、路线、执行频率和责任班组。</p></div>${btn('task-new','新建巡检任务','',true)}</header>${messages()}${taskForm()}<section class="ops-card ops-task-list"><form id="opsFilter" class="ops-filters">${field('巡检任务',input('query',filter.query,'search','placeholder="任务编号、名称、班组"'))}${btn('query','查询','',true)}${btn('reset','重置')}</form>${taskList(db)}</section></div>`;
    }
    function renderMap(page) {
      enterPage(page);const c=context(),db=load(),kind=['p13','p13h'].includes(page)?'alarm':'work',history=['p13h','p15h'].includes(page);
      const title=kind==='alarm'?(history?'报警历史地图':'当日报警地图'):(history?'工单巡检历史地图':'工单管理地图');
      const statuses=kind==='alarm'?(history?['已关闭']:['待确认','已确认']):(history?['已完成','已取消']:['待派单','待接单','处理中','待验收']);
      const records=(kind==='alarm'?db.alarms:db.orders).filter(r=>(kind==='alarm'?r.status==='已关闭':O.terminal(r))===history).filter(r=>matches(r,history));
      const events=records.map(r=>({...r,type:kind==='alarm'?'alarm':'workorder'}));
      const mapped=records.filter(r=>c.model.objects.has(r.hostId));
      const pane=workDraft&&!history?workForm():dispatchOpen&&!history?`<section class="ops-card"><header><h2>巡检任务派发</h2>${btn('dispatch-close','关闭')}</header><p class="ops-muted">选择已到期的巡检任务生成工单。周期配置在巡检管理维护。</p>${taskList(db,true)}</section>`:records.some(r=>r.id===selected)?detail(db,kind):'';
      const M=window.WaterMapLayout,problem=records.filter(r=>!c.model.objects.has(r.hostId)||!history&&(kind==='alarm'?r.status==='待确认':Date.parse(r.dueAt)<Date.now()));
      const layerUI=[['.we-pipe','管道'],['.we-node','节点与设施'],['.product-ops-marker',kind==='alarm'?'报警':'工单'],['.ops-event-label,.we-node text','名称标注']].map(([selector,label])=>`<label><input type="checkbox" data-map-layer="${selector}" checked>${label}</label>`).join('');
      const problemUI=M.issues(problem.slice(0,5).map(r=>`<button class="product-list-row" data-ops="${kind==='alarm'?'alarm-detail':'work-detail'}" data-id="${esc(r.id)}"><span class="product-list-row-main"><strong>${esc(r.name)}</strong><small>${!c.model.objects.has(r.hostId)?'关联对象已移除':kind==='alarm'?'待确认报警':'工单已超期'}</small></span></button>`).join(''),problem.length);
      const rows=table(['记录编号','名称','关联对象','状态','班组 / 等级','时间','操作'],records.map(r=>[esc(r.id),esc(r.name),`${esc(r.hostId||'未关联对象')}<small>${c.model.objects.has(r.hostId)?'可定位':'对象已移除，无法定位'}</small>`,badge(r.status),esc(r.assignee||r.level||'—'),date(history?r.closedAt:r.createdAt),btn(kind==='alarm'?'alarm-detail':'work-detail','查看 / 定位',r.id)]));
      return `<div class="ops-map-page" data-map-workspace="${page}"><header class="ops-map-header" data-map-slot="toolbar"><div><strong>${title}</strong><span>${esc(c.topology)} · 当前管网</span></div><div>${kind==='work'&&!history?btn('dispatch-open','巡检任务派发')+btn('work-new','新建工单','',true):''}<button class="app-button" data-page="${history?(kind==='alarm'?'p13':'p15'):(kind==='alarm'?'p13h':'p15h')}">${history?'返回当前':'历史记录'}</button></div></header><div class="ops-map-canvas product-map-view-operations" data-map-slot="canvas">${c.drawMap?c.drawMap(events,selected,kind):'<div role="img" aria-label="业务地图"></div>'}</div>${M.left(layerUI,problemUI)}<section data-map-slot="bottom" aria-label="对象列表"><header class="map-panel-head"><strong>${kind==='alarm'?'报警':'工单'}记录 · ${records.length}</strong><small>地图可定位 ${mapped.length} 条</small>${M.toggle('bottom','对象列表')}</header><form id="opsFilter">${field('关键字',input('query',filter.query,'search','placeholder="编号、名称、对象、班组"'))}${field('状态',`<select class="app-select" name="status">${options(statuses,filter.status,'全部状态')}</select>`)}<div class="ops-form-grid">${field(history?'归档日期起':'创建日期起',input('start',filter.start,'date'))}${field('截止日期',input('end',filter.end,'date'))}</div><footer>${btn('query','查询','',true)}${btn('reset','重置')}</footer></form>${rows}</section><div class="ops-map-messages">${messages()}</div>${pane?`<aside class="ops-map-detail-panel" data-map-slot="right" aria-label="详情表单">${pane}</aside>`:''}<div class="ops-map-tools">${btn('map-reset','全图')}${btn('map-zoom-in','放大')}${btn('map-zoom-out','缩小')}</div></div>`;

    }
    function captureTask(){
      const f=document.getElementById('opsTaskForm');if(!f)return;
      const d=new FormData(f), previousStops=JSON.stringify(draft.stops);
      Object.assign(draft,Object.fromEntries(d));draft.stops=d.getAll('stop');draft.nextAt=fromInput(d.get('nextAt'));draft.accessConfirmed=d.get('accessConfirmed')==='on';
      if(previousStops!==JSON.stringify(draft.stops))draft.accessConfirmed=false;
    }
    function open(page,id){selected=id;workDraft=null;draft=null;error='';notice='';filter={query:'',status:'',start:'',end:''};dispatchOpen=false;context().navigate(page);}
    function action(action,id){
      error='';notice='';const c=context(), note=document.getElementById('opsNote')?.value||'';
      const resultDraft=[...document.querySelectorAll('[data-result-index]')].map(el=>({result:el.querySelector('[name=result]').value,note:el.querySelector('[name=resultNote]').value}));
      if(selected&&document.getElementById('opsNote'))feedback[selected]={note,results:resultDraft};
      try{
        if(action==='query'){const f=new FormData(document.getElementById('opsFilter'));const next={query:f.get('query')||'',status:f.get('status')||'',start:f.get('start')||'',end:f.get('end')||''};if(next.start&&next.end&&next.start>next.end)throw Error('开始日期不能晚于截止日期');filter=next;}
        else if(action==='reset')filter={query:'',status:'',start:'',end:''};
        else if(action==='cancel-form'){draft=null;workDraft=null;}
        else if(action==='detail-close')selected=null;
        else if(action==='dispatch-open'){dispatchOpen=true;selected=null;workDraft=null;}
        else if(action==='dispatch-close')dispatchOpen=false;
        else if(action.startsWith('map-')){c.mapView(action);return;}
        else if(action==='locate'){if(c.focusMap){c.focusMap(id);return;}c.locate(id);return;}
        else if(action==='task-new'){draft={name:'',stops:['',''],frequency:'week',interval:1,hours:8,assignee:'',nextAt:new Date().toISOString(),instructions:'检查管线沿线渗漏、阀门井积水、设施完好及周边施工情况。',accessConfirmed:false};}
        else if(action==='task-edit'){draft=O.copy(load().tasks.find(t=>t.id===id));if(!draft)throw Error('任务不存在');draft.nextAt ||= new Date().toISOString();draft.accessConfirmed=false;}
        else if(['stop-add','stop-remove','stop-up','stop-down','preview','task-save'].includes(action)){
          captureTask();const i=+id;
          if(action==='stop-add'){draft.stops.splice(-1,0,'');draft.accessConfirmed=false;}
          if(action==='stop-remove'){draft.stops.splice(i,1);draft.accessConfirmed=false;}
          if(action==='stop-up'||action==='stop-down'){const j=i+(action==='stop-up'?-1:1);[draft.stops[i],draft.stops[j]]=[draft.stops[j],draft.stops[i]];draft.accessConfirmed=false;}
          if(action==='preview')O.route(c.model.data,draft.stops);
          if(action==='task-save'){ensureActive();const old=load().tasks.find(t=>t.id===draft.id);draft.anchorDay=old&&inputDate(old.nextAt)===inputDate(draft.nextAt)?old.anchorDay:new Date(new Date(draft.nextAt).getTime()+8*3600000).getUTCDate();mutate(db=>O.saveTask(db,draft,c.model.data,c.topology));draft=null;notice='巡检任务已保存。';}
        }
        else if(action==='task-toggle'){mutate(db=>{const t=db.tasks.find(t=>t.id===id);if(!t.nextAt)throw Error('单次任务已执行，请编辑下次执行时间后再启用');t.enabled=!t.enabled;(t.logs||=[]).push({time:new Date().toISOString(),actor:'系统管理员（本地演示）',text:t.enabled?'启用任务':'暂停任务'});});notice='任务状态已保存。';}
        else if(action==='task-issue'){ensureActive();const w=mutate(db=>O.issue(db,id,c.model.data,c.topology));open('p15',w.id);return;}
        else if(action==='alarm-detail'||action==='work-detail'){selected=id;workDraft=null;dispatchOpen=false;}
        else if(action==='work-new'||action==='alarm-work'){
          dispatchOpen=false;
          const a=action==='alarm-work'?load().alarms.find(a=>a.id===id):null;
          if(a?.orderId&&load().orders.some(w=>w.id===a.orderId&&w.status!=='已取消')){open(O.terminal(load().orders.find(w=>w.id===a.orderId))?'p15h':'p15',a.orderId);return;}
          workDraft={name:a?.name||'',hostId:a?.hostId||'',alarmId:a?.id,assignee:'',priority:a?'紧急':'普通',dueAt:new Date(Date.now()+8*3600000).toISOString(),instructions:a?'核实报警原因，记录现场处置及恢复依据。':''};
        }
        else if(action==='work-save'){
          const f=document.getElementById('opsWorkForm');Object.assign(workDraft,Object.fromEntries(new FormData(f)));workDraft.dueAt=fromInput(workDraft.dueAt);ensureActive();workDraft.topology=c.topology;
          const w=mutate(db=>O.createOrder(db,workDraft,c.model.data));open('p15',w.id);return;
        }
        else if(action.startsWith('order-')){
          const step=action.slice(6), results=[...document.querySelectorAll('[data-result-index]')].map((el,i)=>({nodeId:load().orders.find(w=>w.id===id).results[i].nodeId,result:el.querySelector('[name=result]').value,note:el.querySelector('[name=resultNote]').value}));
          mutate(db=>step==='progress'?O.saveProgress(db,id,{note,results}):O.transition(db,id,step,{note,results,assignee:document.querySelector('[name=dispatchTeam]')?.value}));delete feedback[id];notice='工单状态与流转记录已保存。';
        }
        else if(action==='defect-create'){
          mutate(db=>{const w=db.orders.find(w=>w.id===id);if(db.orders.some(d=>d.id===w.defectOrderId&&d.status!=='已取消'))throw Error('已生成缺陷跟进工单');const issues=w.results.filter(r=>r.result!=='正常');if(w.status!=='待验收'||!issues.length)throw Error('仅待验收的异常巡检可生成跟进工单');
            const d=O.createOrder(db,{name:w.name+' · 缺陷跟进',hostId:issues[0].nodeId,assignee:w.assignee,priority:'普通',dueAt:new Date(Date.now()+86400000).toISOString(),instructions:issues.map(r=>`${r.nodeId} ${r.result}：${r.note}`).join('\n'),defectOf:w.id,topology:c.topology},c.model.data);w.defectOrderId=d.id;});notice='缺陷跟进工单已创建，请在工单管理中派发。';
        }
        else if(action.startsWith('alarm-')){mutate(db=>O.alarmAction(db,id,action.slice(6),note));delete feedback[id];notice='报警状态与流转记录已保存。';}
      }catch(e){error=e.message;}
      c.refresh();
      if(feedback[selected]?.results)document.querySelectorAll('[data-result-index]').forEach((el,i)=>{const r=feedback[selected].results[i];if(r){el.querySelector('[name=result]').value=r.result;el.querySelector('[name=resultNote]').value=r.note;}});
      const el=document.getElementById(error?'opsTaskEditor':draft?'opsTaskEditor':selected?'opsDetail':'');
      if(el&&!error)el.scrollIntoView({block:'nearest'});
    }
    document.addEventListener('click',e=>{const b=e.target.closest('[data-ops]');if(b&&!b.disabled){e.preventDefault();action(b.dataset.ops,b.dataset.id);}});
    document.addEventListener('submit',e=>{if(['opsTaskForm','opsWorkForm','opsFilter'].includes(e.target.id)){e.preventDefault();action(e.target.id==='opsTaskForm'?'task-save':e.target.id==='opsWorkForm'?'work-save':'query','');}});
    document.addEventListener('change',e=>{if(e.target.closest('#opsTaskForm')&&e.target.name==='stop'){captureTask();draft.accessConfirmed=false;const checkbox=document.querySelector('[name=accessConfirmed]');if(checkbox)checkbox.checked=false;}});
    return {render,renderMap,load,open,action,mapDetail(kind,id){const db=load(),r=(kind==='alarm'?db.alarms:db.orders).find(r=>r.id===id);return r?`<div class="ops-map-detail"><h3>${esc(r.name)}</h3><p>${badge(r.status)}</p><p>${esc(r.id)}</p><p>关联对象：${esc(r.hostId)}</p><button class="app-button app-button-primary" data-action="ops-open-record" data-kind="${kind}" data-value="${esc(id)}">打开业务处理</button>${logs(r)}</div>`:'<div class="app-empty">该记录为旧版演示样例，未形成可执行工单。请从工单管理新建。</div>';}};
  };
})();
