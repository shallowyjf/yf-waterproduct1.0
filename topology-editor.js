/* Shared, editable topology used by the map, object drawer, DMA and checks. */
(() => {
  "use strict";
  const lengthText = v => v == null || v === '' || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('en-US', {useGrouping:false, minimumFractionDigits:2, maximumFractionDigits:2});
  const copy = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const types = {node:"连接节点", valve:"阀门", pump:"泵站", plant:"水厂", user:"用户端", hydrant:"消火栓", cap:"堵头", pipe:"供水管线", zone:"DMA 分区"};
  const layers = {node:"nodes", valve:"valves", pump:"pumps", plant:"plants", user:"users", hydrant:"hydrants", cap:"caps", pipe:"pipes", zone:"dma"};
  const cross = (o,a,b) => (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  function hull(points) {
    const p = [...new Map(points.map(v=>[`${v.x},${v.y}`, {x:v.x,y:v.y}])).values()].sort((a,b)=>a.x-b.x||a.y-b.y);
    if(p.length<3) return [];
    const lo=[],hi=[];
    for(const v of p) {while(lo.length>1&&cross(lo.at(-2),lo.at(-1),v)<=0)lo.pop();lo.push(v);}
    for(const v of [...p].reverse()) {while(hi.length>1&&cross(hi.at(-2),hi.at(-1),v)<=0)hi.pop();hi.push(v);}
    const result=lo.slice(0,-1).concat(hi.slice(0,-1));return result.length>=3?result:[];
  }
  function inside(p,poly) {
    let result=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
      const a=poly[j],b=poly[i];
      if(Math.abs(cross(a,b,p))<0.001&&p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y))return true;
      if((b.y>p.y)!==(a.y>p.y)&&p.x<(a.x-b.x)*(p.y-b.y)/(a.y-b.y)+b.x)result=!result;
    }return result;
  }
  function segmentInside(a,b,poly) {
    if(!inside(a,poly)||!inside(b,poly))return false;
    // Test every interval split by polygon-edge intersections, including concave cuts.
    const cuts=[0,1],dx=b.x-a.x,dy=b.y-a.y;
    for(let i=0;i<poly.length;i++) {
      const c=poly[i],d=poly[(i+1)%poly.length],ex=d.x-c.x,ey=d.y-c.y,den=dx*ey-dy*ex;
      if(Math.abs(den)<1e-9)continue;
      const t=((c.x-a.x)*ey-(c.y-a.y)*ex)/den,u=((c.x-a.x)*dy-(c.y-a.y)*dx)/den;
      if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);
    }
    cuts.sort((x,y)=>x-y);
    return cuts.slice(1).every((t,i)=>inside({x:a.x+dx*(t+cuts[i])/2,y:a.y+dy*(t+cuts[i])/2},poly));
  }
  function simplePolygon(poly) {
    if(hull(poly).length<3)return false;
    for(let i=0;i<poly.length;i++)for(let j=i+1;j<poly.length;j++) {
      if(j===i+1||(i===0&&j===poly.length-1))continue;
      const a=poly[i],b=poly[(i+1)%poly.length],c=poly[j],d=poly[(j+1)%poly.length];
      if(cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))&&Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y)))return false;
    }
    return true;
  }
  class WaterTopologyEditor {
    constructor(config) {
      this.config=config;this.sessions=new Map();this.mode="topology";
      document.addEventListener("click",e=>this.click(e),true);
      document.addEventListener("change",e=>this.change(e),true);
      document.addEventListener("submit",e=>this.submit(e),true);
      window.addEventListener?.("beforeunload",e=>{if([...this.sessions.values()].some(s=>s.dirty)){e.preventDefault();e.returnValue="";}});
      document.addEventListener("keydown",e=>{if(!document.querySelector("[data-we-workspace]")||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(e.key==="Escape"){e.preventDefault();this.s.tool="select";this.s.vertices=[];this.s.start=null;this.refresh();}if(e.key==="Enter"&&this.s.tool==="polygon"){e.preventDefault();this.finishPolygon();}},true);
    }
    seed(markup,legacy=false) {
      if(window.createCityTopology&&!legacy)return window.createCityTopology();
      const doc=new DOMParser().parseFromString(markup,"text/html");
      const nodes=[];
      const cls={"product-water-plant":"plant","product-pump-station":"pump","product-junction-node":"node","product-valve-node":"valve","product-user-terminal":"user"};
      for(const [name,type] of Object.entries(cls))for(const el of doc.querySelectorAll(`.${name}`)) {
        const coords=el.getAttribute("transform").match(/[-\d.]+/g).map(Number),id=el.dataset.value;
        if(!id)continue;
        nodes.push({id,type,name:el.getAttribute("aria-label").replace(/^查看资产 /,""),x:coords[0]+(type==="plant"?44:0),y:coords[1]+(type==="plant"?28:0),elevation:id==="NODE-J04"?48.6:id==="VALVE-V402"?39.3:45,diameter:type==="pump"?600:null});
      }
      const pipes=[...doc.querySelectorAll(".product-topology-pipe")].map(el=>{
        const nums=el.getAttribute("d").match(/[-\d.]+/g).map(Number);
        const a={x:nums[0],y:nums[1]},b={x:nums[2],y:nums.length===3?nums[1]:nums[3]};
        const nearest=p=>nodes.find(n=>Math.hypot(n.x-p.x,n.y-p.y)<1)?.id||"";
        return {id:el.dataset.value,type:"pipe",name:el.getAttribute("aria-label").replace(/^选择管线 /,""),start:nearest(a),end:nearest(b),a,b,diameter:Number(el.dataset.diameter.replace("DN","")),material:el.dataset.material,length:el.dataset.value==="PIPE-2026-013"?112:+Math.hypot(b.x-a.x,b.y-a.y).toFixed(1),startElevation:el.dataset.value==="PIPE-2026-013"?48.6:45,endElevation:el.dataset.value==="PIPE-2026-013"?39.3:45};
      });
      const data={schema:"water-topology-v1",nodes,pipes,zones:[]};
      for(const [i,test] of [p=>p.a.y<275&&p.b.y<275,p=>p.a.y>=274&&p.b.y>=274].entries()) {
        const ps=pipes.filter(p=>test(p)&&Number(p.id.slice(-3))<18),ids=[...new Set(ps.flatMap(p=>[p.start,p.end]).filter(Boolean))];
        data.zones.push({id:`DMA-${i+1}`,type:"zone",name:i?"城南分区":"城北分区",nodeIds:ids,pipeIds:ps.map(p=>p.id),parent:""});
      }
      return data;
    }
    use(key,markup,options={}) {
      if(!this.sessions.has(key)) {
        let data=options.data||this.seed(markup);
        try {
          const saved=localStorage.getItem(`water-editor:${key}`);
          if(saved){const previous=this.validate(window.CampusProject?.decodeSnapshot?window.CampusProject.decodeSnapshot(saved):JSON.parse(saved));
            const backupKey=`water-editor-backup:${key}:before-${data.sampleRevision}`;
            if(!options.preserve&&data.sampleRevision&&previous.sampleRevision!==data.sampleRevision&&!localStorage.getItem(backupKey)){
              // Preserve the previous sample and any user edits before upgrading its fixture.
              localStorage.setItem(backupKey,saved);
              localStorage.setItem(`water-editor:${key}`,JSON.stringify(data));
            }else data=previous;
          }
        }catch(_){/* Keep the seed if a previous local file is invalid. */}
        this.sessions.set(key,{data,saved:copy(data),editing:false,dirty:false,history:[],selected:null,tool:"select",start:null,vertices:[],tab:"layers",category:"connectivity",issue:null,islands:[],query:"",tableType:"all",tablePage:1,tableSize:10,visible:Object.fromEntries(Object.keys(types).map(t=>[t,true])),view:[0,0,900,540],modal:null,defaults:{diameter:300,material:"球墨铸铁"}});
      }
      this.key=key;this.s=this.sessions.get(key);this.s.readOnly=!!options.readOnly;if(this.s.readOnly)this.s.editing=false;return this;
    }
    refresh(){this.config.dirty?.(this.s.dirty);this.config.render();}
    pause(){if(this.s){this.s.editing=false;this.s.tab="layers";this.s.tool="select";this.s.start=null;this.s.vertices=[];this.s.modal=null;}}
    message(text){this.config.toast(text);}
    indexes(){const d=this.s.data,c=this._index;if(c&&c.data===d&&c.nodes===d.nodes&&c.pipes===d.pipes&&c.zones===d.zones&&c.size===d.nodes.length+d.pipes.length+d.zones.length)return c;const objects=new Map([...d.nodes,...d.pipes,...d.zones].map(o=>[o.id,o])),incident=new Map(d.nodes.map(n=>[n.id,[]]));for(const p of d.pipes)for(const id of new Set([p.start,p.end])){if(!incident.has(id))incident.set(id,[]);incident.get(id).push(p);}return this._index={data:d,nodes:d.nodes,pipes:d.pipes,zones:d.zones,size:objects.size,objects,incident};}
    object(id){return this.indexes().objects.get(id);}
    coords(p){return [this.object(p.start)||p.a,this.object(p.end)||p.b];}
    zonePoints(z){if(window.DMAGeometry)return window.DMAGeometry.zonePolygon(this.s.data,z);return hull([...z.nodeIds.map(id=>this.object(id)).filter(Boolean),...z.pipeIds.flatMap(id=>{const p=this.object(id);return p?this.coords(p):[];})]);}
    mutate(fn) {
      if(!this.s.editing||this.s.readOnly)return;
      this.s.history.push(copy(this.s.data));
      fn();this._index=null;
      if(this.mode==='dma'&&['nodes','pipes'].some(k=>JSON.stringify(this.s.data[k])!==JSON.stringify(this.s.history.at(-1)[k]))){this.s.data=this.s.history.pop();this.message('分区编辑不能修改管网点线');this.refresh();return;}
      this.s.dirty=JSON.stringify(this.s.data)!==JSON.stringify(this.s.saved);this.s.issue=null;this.s.islands=[];this.refresh();
    }
    button(action,label,disabled=false,extra="") {if(this.s?.readOnly&&action==='edit'){disabled=true;label=this.key?.includes(':dma:')?'在用只读':'历史只读';}return `<button type="button" class="app-button ${extra}" data-we="${action}" ${disabled?"disabled":""}>${label}</button>`;}
    field(label,name,value,type="text",disabled=false) {return `<label class="app-form-item"><span class="app-form-label">${label}</span><input class="app-input" name="${name}" aria-label="${label}" type="${type}" value="${esc(name==="length"&&value!=null?lengthText(value):value)}" ${type==="number"?'step="any"':""} ${disabled||!this.s.editing?"disabled":""}></label>`;}
    render(dma=false,checkRequested=false) {
      const nextMode=dma?"dma":"topology";
      if(this.mode!==nextMode){this.s.editing=false;this.s.tab="layers";this.s.tool="select";this.s.start=null;this.s.vertices=[];this.s.selected=null;this.s.modal=null;}
      this.mode=nextMode;
      if(checkRequested&&!dma)this.s.tab="check";
      const s=this.s,data=s.data,edit=s.editing;
      const all=[...data.nodes,...data.pipes,...(dma?data.zones:[])], selected=this.object(s.selected);
      const list=(dma?data.zones:all).filter(o=>!s.query||`${o.id} ${o.name}`.toLowerCase().includes(s.query.toLowerCase()));
      const header=`<div class="product-page-header"><div><h1>${dma?"DMA 分区管理":"拓扑编辑器"}</h1><span class="we-mode">${edit?"编辑中":"查看"}${s.dirty?" · 未保存":""}</span></div><div class="we-actions">${this.button(edit?"view":"edit",edit?"退出编辑":"编辑",false,edit?"":"app-button-primary")}${this.button("save","保存",!edit||!s.dirty)}${this.button("undo","撤销",!edit||(!s.history.length&&!s.vertices.length))}${this.button("clear","清空",!edit,"app-button-danger")}${this.button("import","导入",!edit)}${this.button("export","导出")}${!dma?this.button("run-check","拓扑检查"):""}</div></div>`;
      const M=window.WaterMapLayout;
      const layerUI=`<div class="we-layer-list">${Object.entries(types).filter(([t])=>dma||t!=="zone").map(([t,label])=>`<label><input type="checkbox" data-we-layer="${t}" ${s.visible[t]?"checked":""}>${label}<span>${all.filter(o=>(window.WaterStandard?.kind(o)||o.type)===t).length}</span></label>`).join("")}</div>`;
      const hint=s.tool==="pipe"?(s.start?"选择终点":"选择起点"):s.tool==="polygon"?`已绘制 ${s.vertices.length} 个顶点`:s.tool==="move"?(selected?"点击新的位置":"选择要移动的点"):s.tool.startsWith("add:")?`点击地图放置${types[s.tool.slice(4)]}`:"";
      const problem=dma?this.dmaIssueList():this.checkList();
      const left=`<aside data-map-slot="left" aria-label="图层与检查"><header class="map-panel-head"><strong>图层</strong>${M.toggle('left','图层')}</header><div class="map-layers">${layerUI}</div>${dma?'':this.checkTools()}${M.issues(problem,dma?this.dmaIssues().length:this.issues().length)}</aside>`;
      return `<div class="product-page product-page-stack we-workspace" data-we-workspace>${header}<div class="we-layout" data-map-workspace="${dma?'dma-editor':'topology-editor'}"><section class="we-map" data-map-slot="canvas" aria-label="${dma?"DMA 分区地图":"拓扑地图"}">${this.map()}<div class="we-map-toolbar">${this.button("zoom-in","＋",false,"app-button-icon")}${this.button("zoom-out","−",false,"app-button-icon")}${this.button("extent","全图")}${hint?`<span role="status">${hint}</span>`:""}${s.tool==="polygon"?this.button("finish-polygon","完成圈选",s.vertices.length<3):""}${s.tool!=="select"?this.button("cancel-tool","取消"):""}</div></section>${left}${edit?`<details class="we-edit-tools" open><summary>编辑工具</summary>${this.tools(dma)}</details>`:''}${selected||s.issue?`<aside class="we-right" data-map-slot="right" aria-label="详情表单">${s.issue?`<header class="map-panel-head"><strong>问题详情</strong>${this.button('close-detail','关闭')}</header>${dma?this.dmaIssueDetail():this.issueDetail()}`:this.detail(selected,dma)}</aside>`:""}${this.objectTable(dma)}</div><input type="file" id="weImport" accept=".json,application/json" hidden>${s.modal?this.dialog():""}</div>`;
    }
    objectTable(dma){
      if(!window.WaterTable)return this.legacyObjectTable(dma);
      const s=this.s,all=[...s.data.nodes,...s.data.pipes,...(dma?s.data.zones:[])];s.tableType=s.tableType||'all';
      const zone=s.data.zones.find(z=>z.id===s.memberZone),members=new Set([...(zone?.nodeIds||[]),...(zone?.pipeIds||[])]);
      const rows=all.filter(o=>(!s.issueObjectIds||s.issueObjectIds.includes(o.id))&&(s.tableType==='all'||s.tableType==='members'&&members.has(o.id)||s.tableType===(window.WaterStandard?.kind(o)||o.type)));
      const tabs=[['all','全部对象'],...Object.entries(types).filter(([t])=>dma||t!=='zone'),...(zone?[['members',zone.name+'成员']]:[])];
      const columns=[{label:'对象编号',value:o=>o.id},{label:'名称',value:o=>o.name},{label:'类型',value:o=>window.WaterStandard?.label(o)||types[o.type]},{label:'管径 / mm',value:o=>o.diameter},{label:'高程 / m',value:o=>o.elevation},{label:'管长 / m',value:o=>o.length},{label:'成员点 / 线',value:o=>o.type==='zone'?o.nodeIds.length+' / '+o.pipeIds.length:null},{label:'操作',filterable:false,sortable:false}];
      const renderRow=o=>`<tr class="${s.selected===o.id?'is-selected':''}"><td>${esc(o.id)}</td><td>${esc(o.name)}</td><td>${esc(window.WaterStandard?.label(o)||types[o.type])}</td><td>${esc(o.diameter??'—')}</td><td>${esc(o.elevation??'—')}</td><td>${lengthText(o.length)}</td><td>${o.type==='zone'?o.nodeIds.length+' / '+o.pipeIds.length:'—'}</td><td><button type="button" class="app-button app-button-link" data-we="object" data-value="${esc(o.id)}">查看 / 定位</button>${s.editing&&s.tableType==='members'?`<button type="button" class="app-button app-button-link" data-we="remove-member" data-value="${esc(o.id)}">移出分区</button>`:''}</td></tr>`;
      return `<section data-map-slot="bottom" aria-label="对象列表"><header class="map-panel-head"><strong>${dma?'分区与拓扑对象':'拓扑对象'} · ${rows.length}</strong>${window.WaterMapLayout.toggle('bottom','对象列表')}</header><nav class="map-object-tabs" role="tablist" aria-label="对象类别">${tabs.map(([id,label])=>`<button role="tab" aria-selected="${s.tableType===id}" class="${s.tableType===id?'is-active':''}" data-we="table-type" data-value="${id}">${label}</button>`).join('')}</nav>${window.WaterTable.render({key:['topology-objects',this.key,dma?'dma':'topology',s.tableType,s.tableType==='members'?s.memberZone:'',s.issueObjectIds?.join(',')||'all'].join('|'),columns,rows,renderRow,pageSize:10,className:'app-table'})}</section>`;
    }
    legacyObjectTable(dma){
      const s=this.s,all=[...s.data.nodes,...s.data.pipes,...(dma?s.data.zones:[])];s.tableType=s.tableType||'all';s.tableSize=s.tableSize||10;s.tablePage=s.tablePage||1;
      const zone=s.data.zones.find(z=>z.id===s.memberZone),members=new Set([...(zone?.nodeIds||[]),...(zone?.pipeIds||[])]);
      const rows=all.filter(o=>(!s.issueObjectIds||s.issueObjectIds.includes(o.id))&&(s.tableType==='all'||s.tableType==='members'&&members.has(o.id)||s.tableType===(window.WaterStandard?.kind(o)||o.type))&&(!s.query||`${o.id} ${o.name}`.toLowerCase().includes(s.query.toLowerCase()))),pages=Math.max(1,Math.ceil(rows.length/s.tableSize));s.tablePage=Math.min(s.tablePage,pages);
      const tabs=[['all','全部对象'],...Object.entries(types).filter(([t])=>dma||t!=='zone'),...(zone?[['members',zone.name+'成员']]:[])];
      return `<section data-map-slot="bottom" aria-label="对象列表"><header class="map-panel-head"><strong>${dma?'分区与拓扑对象':'拓扑对象'} · ${rows.length}</strong>${window.WaterMapLayout.toggle('bottom','对象列表')}</header><nav class="map-object-tabs" role="tablist" aria-label="对象类别">${tabs.map(([id,label])=>`<button role="tab" aria-selected="${s.tableType===id}" class="${s.tableType===id?'is-active':''}" data-we="table-type" data-value="${id}">${label}</button>`).join('')}</nav><form class="map-query" data-we-search><input class="app-input" name="search" aria-label="搜索对象" placeholder="名称 / 编号" value="${esc(s.query)}"><button class="app-button" type="submit">查询</button>${this.button('table-reset','重置')}<span class="map-pager">共 ${rows.length} 条 ${this.button('table-prev','上一页',s.tablePage===1)} ${s.tablePage} / ${pages} ${this.button('table-next','下一页',s.tablePage===pages)}<select class="app-select" data-we-page-size aria-label="每页对象条数">${[10,20,50].map(n=>`<option value="${n}" ${s.tableSize===n?'selected':''}>${n} 条/页</option>`).join('')}</select></span></form><div class="map-table-scroll"><table class="app-table" data-auto-paged="true"><thead><tr><th>对象编号</th><th>名称</th><th>类型</th><th>管径 / mm</th><th>高程 / m</th><th>管长 / m</th><th>成员点 / 线</th><th>操作</th></tr></thead><tbody>${rows.slice((s.tablePage-1)*s.tableSize,s.tablePage*s.tableSize).map(o=>`<tr class="${s.selected===o.id?'is-selected':''}"><td>${esc(o.id)}</td><td>${esc(o.name)}</td><td>${window.WaterStandard?.label(o)||types[o.type]}</td><td>${esc(o.diameter??'—')}</td><td>${esc(o.elevation??'—')}</td><td>${lengthText(o.length)}</td><td>${o.type==='zone'?o.nodeIds.length+' / '+o.pipeIds.length:'—'}</td><td><button type="button" class="app-button app-button-link" data-we="object" data-value="${esc(o.id)}">查看 / 定位</button>${s.editing&&s.tableType==='members'?`<button type="button" class="app-button app-button-link" data-we="remove-member" data-value="${esc(o.id)}">移出分区</button>`:''}</td></tr>`).join('')||'<tr><td colspan="8">无匹配对象</td></tr>'}</tbody></table></div></section>`;
    }
    dmaIssues(){const data=this.s.data,all=new Set([...data.nodes,...data.pipes].map(n=>n.id)),assigned=new Map(),issues=[];for(const z of data.zones){const ids=[...z.nodeIds,...z.pipeIds],missing=ids.filter(id=>!all.has(id));if(missing.length)issues.push({id:'dma-invalid:'+z.id,objectId:z.id,title:'存在 '+missing.length+' 个无效成员',objects:[z.id]});if(this.zonePoints(z).length<3)issues.push({id:'dma-empty:'+z.id,objectId:z.id,title:'成员不足，无法形成分区面',objects:[z.id]});for(const id of ids){if(assigned.has(id))issues.push({id:'dma-overlap:'+z.id+':'+id,objectId:id,title:'重复归属 '+assigned.get(id)+' / '+z.id,objects:[id]});else assigned.set(id,z.id);}}for(const problem of (window.DMAGeometry?.validateZones(data)||[]).filter(i=>i.type!=='overlap'))issues.push({id:'dma-boundary:'+problem.type+':'+problem.zoneId,objectId:problem.zoneId,title:problem.message,objects:[problem.zoneId]});for(const hit of window.DMAGeometry?.findOverlaps(data)||[])issues.push({id:'dma-spatial:'+hit.a+':'+hit.b,objectId:hit.a+' / '+hit.b,title:'分区范围存在空间重叠，请调整外接多边形或成员',objects:[hit.a,hit.b]});const missing=[...all].filter(id=>!assigned.has(id));if(missing.length)issues.push({id:'dma-unassigned',objectId:'未分配对象',title:missing.length+' 个对象尚未划入分区',objects:missing});return issues;}
    dmaIssueList(){const rows=this.dmaIssues();return rows.map(i=>`<button type="button" class="product-list-row" data-we="dma-issue" data-value="${esc(i.id)}"><span class="product-list-row-main"><strong>${esc(i.objectId)}</strong><small>${esc(i.title)}</small></span></button>`).join('')||'<div class="we-empty">未发现分区问题</div>';}
    dmaIssueDetail(){const i=this.dmaIssues().find(i=>i.id===this.s.issue);return i?`<div class="we-form"><strong>${esc(i.objectId)}</strong><p>${esc(i.title)}</p><button type="button" class="app-button" data-we="issue-objects">查看问题对象</button></div>`:'';}

    tools(dma) {
      const s=this.s;
      const tool=(id,label)=>`<button class="app-button ${s.tool===id?"is-active":""}" data-we="tool" data-value="${id}" ${!s.editing?"disabled":""}>${label}</button>`;
      if(dma)return `<div class="product-tool-group"><strong>分区面</strong><div class="product-tool-grid">${tool("polygon","新建分区面")}${this.button("replace-members","重新圈选成员",!s.editing||this.object(s.selected)?.type!=="zone")}${this.button("select-tool","选择 / 修改属性",!s.editing)}${this.button("delete","删除分区",!s.editing||this.object(s.selected)?.type!=="zone","app-button-danger")}</div></div>`;
      return `<div class="product-tool-group"><strong>新增点要素</strong><div class="product-tool-grid">${Object.entries(types).filter(([t])=>!["pipe","zone"].includes(t)).map(([t,label])=>tool(`add:${t}`,label)).join("")}</div></div><div class="product-tool-group"><strong>新增线要素</strong><div class="product-tool-grid">${tool("pipe","供水管线")}</div><label class="app-form-item"><span class="app-form-label">默认管径（mm）</span><input type="number" min="1" class="app-input" aria-label="默认管径" data-we-default="diameter" value="${s.defaults.diameter}"></label><label class="app-form-item"><span class="app-form-label">默认材质</span><select class="app-select" aria-label="默认材质" data-we-default="material">${["球墨铸铁","钢管","PE","PVC"].map(v=>`<option ${v===s.defaults.material?"selected":""}>${v}</option>`).join("")}</select></label></div><div class="product-tool-group"><strong>修改</strong><div class="product-tool-grid">${tool("select","选择 / 修改属性")}${tool("move","移动点")}${this.button("delete","删除对象",!s.editing||!s.selected,"app-button-danger")}</div></div>`;
    }
    map(external=false,options={}) {
      const s=this.s,issue=external||!this.s.issue?null:(this.mode==='dma'?this.dmaIssues():this.issues()).find(i=>i.id===s.issue);
      const selected=this.object(s.selected),zone=selected?.type==="zone"?selected:null;
      const highlight=new Set(external?(options.selectedIds||[]):issue||zone?[...(issue?.objects||[]),...(zone?.nodeIds||[]),...(zone?.pipeIds||[])]:[s.selected,s.start]);
      const visible=t=>external?(!options.layers||options.layers[layers[t]]!==false):s.visible[t];
      const attr=o=>external?`data-action="${o.type==="pipe"?"select-pipe":o.type==="zone"?"select-dma":"select-asset"}" data-value="${esc(o.id)}"`:`data-we-object="${esc(o.id)}"`;
      const zones=(external?options.dma:this.mode==="dma")&&visible("zone")?s.data.zones.map(z=>`<polygon class="we-zone ${selected?.id===z.id?"is-selected":""}" style="${z.color?`fill:${esc(z.color)}25;stroke:${esc(z.color)}`:''}" points="${this.zonePoints(z).map(p=>`${p.x},${p.y}`).join(" ")}" ${attr(z)} role="button" tabindex="0" aria-label="${esc(z.name)}"></polygon>`).join(""):"";
      const pipes=visible("pipe")?s.data.pipes.map(p=>{const[a,b]=this.coords(p),d=p.geometry?.length?'M'+p.geometry.map(n=>n.x+' '+n.y).join('L'):`M${a.x} ${a.y}L${b.x} ${b.y}`;return `<g class="we-pipe product-topology-pipe ${highlight.has(p.id)&&!external?"we-selected":""}" style="--we-pipe-width:${p.diameter>=1000?4.5:p.diameter>=800?3.5:p.diameter>=600?2.5:1.8}px;--we-pipe-color:${p.diameter>=1000?'#3379b8':p.diameter>=600?'#579aca':'#8bb6d0'}" ${attr(p)} data-pipe-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.name)} ${esc(p.id)}"><path class="we-pipe-visible" d="${d}"/><path class="map-pipe-hit" d="${d}" style="stroke-opacity:0!important;stroke-width:8px!important"/><title>${esc(p.name)} · DN${p.diameter}</title></g>`;}).join(""):"";
      const nodes=s.data.nodes.filter(n=>visible(window.WaterStandard?.kind(n)||n.type)).map(n=>{
        const glyph={node:'<circle r="3.5"/>',valve:'<path d="M-5.5 0 0-5.5 5.5 0 0 5.5Z"/>',pump:'<circle r="8"/><path d="M-4 3Q0-7 5 2H-4"/>',plant:'<rect x="-18" y="-12" width="20" height="26" rx="2"/><path d="M-14 9V-4l5 3v-6l6 4v12"/>',cap:'<path d="M-5-6V6M-5 0H6"/>',user:'<path d="M-6 0 0-6 6 0V8H-6Z"/>'}[n.type];const nodeGlyph=n.userSubtype==='FIRE_HYDRANT'?'<path d="M-4 8V-5Q0-10 4-5V8ZM-8-2H8M-6 8H6"/>':glyph;
        const labelVisible=["plant","pump","user"].includes(n.type)||s.view[2]<480||highlight.has(n.id);
        const anchor=n.x>760?"end":"start",labelY=n.type==="pump"?24:n.type==="plant"?-17:-12;
        return `<g class="we-node we-${window.WaterStandard?.kind(n)||n.type} ${highlight.has(n.id)&&!external?"we-selected":""}" transform="translate(${n.x} ${n.y})${s.data.sourceDataset&&s.data.displayScale!==1?' scale('+(n.type==='plant'?.35:.2)+')':''}" ${attr(n)} tabindex="0" role="button" aria-label="${esc(n.name)} ${esc(n.id)}">${nodeGlyph}${labelVisible?`<text x="${anchor==='end'?-8:8}" y="${labelY}" text-anchor="${anchor}">${esc(n.name)}</text>`:""}<title>${esc(n.id)} · ${esc(n.name)}</title></g>`;
      }).join("");
      return `<div class="product-network"><svg class="product-topology-svg we-svg" data-imported="${!!s.data.sourceDataset}" data-campus="${s.data.sourceDataset==='sh-campus-20261013'}" viewBox="${external?"0 0 900 540":s.view.join(" ")}" preserveAspectRatio="xMidYMid meet" aria-label="供水管网拓扑" ${external?"":"data-we-map"}><g>${zones}</g><g>${pipes}</g><g>${nodes}</g>${!external&&s.vertices.length?`<polyline class="we-selection" points="${s.vertices.map(p=>`${p.x},${p.y}`).join(" ")}"/>${s.vertices.map(p=>`<circle class="we-vertex" cx="${p.x}" cy="${p.y}" r="4"/>`).join("")}`:""}</svg></div>`;
    }
    detail(o,dma) {
      if(!o)return "";
      const disabled=dma&&o.type!=="zone";
      const select=(label,key,value)=>`<label class="app-form-item"><span class="app-form-label">${label}</span><select class="app-select" aria-label="${label}" name="${key}" ${!this.s.editing||disabled?"disabled":""}><option value="">空</option>${this.s.data.nodes.map(n=>`<option value="${esc(n.id)}" ${n.id===value?"selected":""}>${esc(n.id)} · ${esc(n.name)}</option>`).join("")}</select></label>`;
      let fields=this.field("对象编号","id",o.id,"text",true)+this.field("名称","name",o.name,"text",disabled)+`<div class="we-property"><span>类型</span><strong>${window.WaterStandard?.label(o)||types[o.type]}</strong></div>`;
      if(o.type==="pipe")fields+=select("上游节点","start",o.start)+select("下游节点","end",o.end)+this.field("管径（mm）","diameter",o.diameter,"number",disabled)+this.field("材质","material",o.material,"text",disabled)+this.field("管长（m）","length",o.length,"number",disabled)+this.field("起点高程（m）","startElevation",o.startElevation,"number",disabled)+this.field("终点高程（m）","endElevation",o.endElevation,"number",disabled);
      else if(o.type==="zone") fields+=`<div class="we-property"><span>成员点</span><strong>${o.nodeIds.length}</strong></div><div class="we-property"><span>成员线</span><strong>${o.pipeIds.length}</strong></div>${this.button('show-members','查看成员列表')}`;
      else fields+=this.field("X 坐标","x",o.x,"number",disabled)+this.field("Y 坐标","y",o.y,"number",disabled)+this.field("高程（m）","elevation",o.elevation,"number",disabled)+this.field("管径（mm）","diameter",o.diameter,"number",disabled)+`<div class="we-property"><span>连接管线</span><strong>${this.s.data.pipes.filter(p=>p.start===o.id||p.end===o.id).map(p=>esc(p.id)).join("<br>")||"空"}</strong></div>`;
      if(o.definitionSource==='user')fields+=`<div class="we-property"><span>方案性质</span><strong>用户指定范围 · 计量待接入</strong></div><div class="we-property"><span>包含建筑</span><strong>${esc((o.buildings||[]).join('、'))}</strong></div><div class="we-property"><span>起点节点 / 出口交界</span><strong>${esc((o.inletNodeIds||[]).join('、')||'—')} / ${esc((o.outletNodeIds||[]).join('、')||'无')}</strong></div><div class="we-property"><span>共用边界节点</span><strong>${esc((o.boundaryNodeIds||[]).join('、')||'无')}</strong></div><p>${esc(o.note||'')}</p>`;
      else if(o.hypothetical)fields+=`<div class="we-property"><span>方案性质</span><strong>假定分区 · 待现场核实</strong></div><div class="we-property"><span>包含建筑</span><strong>${esc((o.buildings||[]).join('、'))}</strong></div><div class="we-property"><span>假定入口 / 出口</span><strong>${esc((o.inletPipeIds||[]).join('、'))} / ${esc((o.outletPipeIds||[]).join('、')||'无')}</strong></div><p>${esc(o.note||'')}</p>`;
      if(o.nodeKind==='RESERVOIR')fields+=`<div class="we-property"><span>水源总水头</span><strong>${o.headStatus==='待设置'?'待设置':o.headM==null?'—':esc(o.headM)+' m'}</strong></div>`;
      return `<div class="product-pane-header"><strong>对象属性</strong>${this.button("close-detail","×")}</div><form class="we-form" data-we-properties>${fields}${this.s.editing&&!disabled?'<button class="app-button app-button-primary" type="submit">应用修改</button>':""}</form>`;
    }
    issues() {
      this._index=null;const index=this.indexes();
      const {nodes,pipes}=this.s.data,result=[];
      const add=(category,type,o,objects,fields,title)=>result.push({id:`${category}:${type}:${o.id}`,category,type,objectId:o.id,objects,fields,title:title||type});
      for(const p of pipes) {
        if(!p.start||!p.end||!this.object(p.start)||!this.object(p.end))add("connectivity","管线端点未连接节点",p,[p.id],[["上游节点",p.start||"空"],["下游节点",p.end||"空"]]);
        const slope=Number.isFinite(p.startElevation)&&Number.isFinite(p.endElevation)?Math.abs(p.endElevation-p.startElevation)/p.length*100:0;
        if(slope>5)add("elevation","管道坡度超过 5%",p,[p.id],[["上游节点",p.start||"空"],["下游节点",p.end||"空"],["起点高程（m）",p.startElevation],["终点高程（m）",p.endElevation],["管长（m）",lengthText(p.length)],["坡度",`${slope.toFixed(1)}%`]]);
      }
      for(const n of nodes) {
        const ps=index.incident.get(n.id)||[];
        if(['node','valve'].includes(n.type)&&ps.length===1)add('connectivity','末端缺少堵头或用户',n,[n.id],[['对象类型',types[n.type]],['连接管线数',ps.length],['连接管线',ps.map(p=>p.id).join('、')]]);
        if(['user','cap'].includes(n.type)&&ps.length>1)add('connectivity',(window.WaterStandard?.label(n)||types[n.type])+'连接多根管线',n,[n.id],[['对象类型',window.WaterStandard?.label(n)||types[n.type]],['连接管线数',ps.length],['连接管线',ps.map(p=>p.id).join('、')]]);
        if(!ps.length)add("connectivity","节点未连接管线",n,[n.id],[["连接管线数",0],["上游管线","空"],["下游管线","空"]]);
        if(ps.length===2&&Math.abs(ps[0].diameter-ps[1].diameter)>100)add("diameter","两通点管径突变",n,[n.id,...ps.map(p=>p.id)],[["连接度",2],...ps.flatMap(p=>[["连接管线",p.id],["管径（mm）",p.diameter]]),["管径差（mm）",Math.abs(ps[0].diameter-ps[1].diameter)]]);
        if(n.diameter!==null&&ps.some(p=>p.diameter!==n.diameter))add("diameter","点线管径不一致",n,[n.id],[["点管径（mm）",n.diameter],...ps.flatMap(p=>[["连接管线",p.id],["管径（mm）",p.diameter]])]);
      }
      const visited=new Set(),components=[];
      for(const n of nodes)if(!visited.has(n.id)) {
        const ids=[],queue=[n.id];visited.add(n.id);
        while(queue.length){const id=queue.pop();ids.push(id);for(const p of index.incident.get(id)||[])for(const next of [p.start,p.end])if(next&&this.object(next)&&!visited.has(next)){visited.add(next);queue.push(next);}}
        const ps=[...new Set(ids.flatMap(id=>index.incident.get(id)||[]))];components.push({ids,ps});
      }
      components.sort((a,b)=>b.ids.length-a.ids.length);
      for(const p of pipes)if(!this.object(p.start)&&!this.object(p.end))components.push({ids:[],ps:[p]});
      components.slice(1).filter(c=>!this.s.data.sourceDataset||!c.ids.some(id=>this.object(id)?.nodeKind==='RESERVOIR')).forEach((c,i)=>{const id=`ISLAND-${i+1}`;add("island","非主连通分量",{id},[...c.ids,...c.ps.map(p=>p.id)],[["成员点",c.ids.join(", ")],["成员线",c.ps.map(p=>p.id).join(", ")||"空"],["点数量",c.ids.length],["线数量",c.ps.length]],`${c.ids.length} 点 · ${c.ps.length} 线`);});
      return result;
    }
    checkTools() {
      const s=this.s;
      return `<section class="we-check-toolbox" aria-label="拓扑检查工具箱"><header><strong>拓扑检查工具箱</strong>${this.button('run-check','复检')}</header><div class="product-check-tool-grid">${[["connectivity","连通性"],["island","孤岛"],["diameter","管径"],["elevation","坡度"]].map(([id,label])=>`<button class="product-check-tool ${s.category===id?"is-active":""}" data-we="category" data-value="${id}">${this.config.icon(id)}<span>${label}</span></button>`).join("")}</div></section>`;
    }
    checkList() {
      const s=this.s,issues=this.issues().filter(i=>i.category===s.category);
      return `<div class="we-list-head">当前类型<span>${issues.length} 条</span></div>${s.category==="island"?this.button("delete-islands","删除所选孤岛",!s.editing||!s.islands.length,"app-button-danger"):""}<div class="we-object-list">${issues.map(i=>`<div class="we-issue-row">${s.category==="island"?`<input type="checkbox" data-we-island="${esc(i.id)}" aria-label="选择 ${i.objectId}" ${s.islands.includes(i.id)?"checked":""} ${s.editing?"":"disabled"}>`:""}<button class="product-list-row ${s.issue===i.id?"is-selected":""}" data-we="issue" data-value="${esc(i.id)}"><span class="product-list-row-main"><strong>${esc(i.objectId)}</strong><small>${i.title}</small></span></button></div>`).join("")||'<div class="we-empty">未发现问题</div>'}</div>`;
    }
    issueDetail() {
      const issue=this.issues().find(i=>i.id===this.s.issue);
      if(!issue)return '<div class="we-empty">选择问题查看属性</div>';
      return `<div class="product-pane-header"><strong>问题属性</strong></div><div class="product-check-field-table">${[["问题类型",issue.type],["对象编号",issue.objectId],...issue.fields].map(([k,v])=>`<div class="product-check-field-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("")}</div>`;
    }
    fit(ids) {
      const pts=ids.flatMap(id=>{const o=this.object(id);return !o?[]:o.type==="pipe"?this.coords(o):o.type==="zone"?this.zonePoints(o):[o];});
      if(!pts.length)return;
      const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y));
      const w=Math.max(300,maxX-minX+160),h=Math.max(230,maxY-minY+130);this.s.view=[(minX+maxX-w)/2,(minY+maxY-h)/2,w,h];
    }
    id(prefix){let i=1;while(this.object(`${prefix}-${String(i).padStart(3,"0")}`))i++;return `${prefix}-${String(i).padStart(3,"0")}`;}
    point(event,svg){const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());return {x:+p.x.toFixed(1),y:+p.y.toFixed(1)};}
    click(e) {
      if(!e.target.closest("[data-we-workspace]"))return;
      const action=e.target.closest("[data-we]"),svg=e.target.closest("[data-we-map]");
      if(!action&&!svg)return;
      e.preventDefault();e.stopImmediatePropagation();
      if(action){if(!action.disabled)this.action(action.dataset.we,action.dataset.value);return;}
      const s=this.s,id=e.target.closest("[data-we-object]")?.dataset.weObject,o=this.object(id),p=this.point(e,svg);
      if(s.editing&&s.tool.startsWith("add:")) {
        const businessType=s.tool.slice(4),type=businessType==="hydrant"?"user":businessType,id=this.id(businessType.toUpperCase());
        this.mutate(()=>{s.data.nodes.push({id,type,...(businessType==="hydrant"?{userSubtype:"FIRE_HYDRANT"}:{}),name:`${types[businessType]} ${id.split("-").at(-1)}`,...p,elevation:0,diameter:["valve","pump"].includes(type)?s.defaults.diameter:null});s.selected=id;});return;
      }
      if(s.editing&&s.tool==="polygon"){s.vertices.push(p);this.refresh();return;}
      if(s.editing&&s.tool==="pipe") {
        if(!o||["pipe","zone"].includes(o.type)){this.message("请选择一个点要素");return;}
        if(['user','cap'].includes(o.type)&&s.data.pipes.some(p=>p.start===id||p.end===id)){this.message('用户或堵头只能连接一根管线，请连接独立接入节点');return;}
        if(!s.start){s.start=id;this.refresh();return;}
        if(s.start===id){this.message("起点和终点不能相同");return;}
        const a=this.object(s.start),b=o,pipeId=this.id("PIPE-NEW");
        if(Math.hypot(a.x-b.x,a.y-b.y)<0.1){this.message("起点和终点位置重合，请先移动节点");return;}
        this.mutate(()=>{s.data.pipes.push({id:pipeId,type:"pipe",name:`新增供水管线 ${pipeId.split("-").at(-1)}`,start:a.id,end:b.id,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},diameter:s.defaults.diameter,material:s.defaults.material,length:+Math.hypot(b.x-a.x,b.y-a.y).toFixed(1),startElevation:a.elevation,endElevation:b.elevation});s.selected=pipeId;s.start=null;});return;
      }
      if(s.editing&&s.tool==="move"&&s.selected&&this.object(s.selected)&&!["pipe","zone"].includes(this.object(s.selected).type)) {
        this.mutate(()=>Object.assign(this.object(s.selected),p));return;
      }
      s.selected=id||null;s.issue=null;this.refresh();
    }
    action(action,value) {
      const s=this.s;
      const mutations=["save","undo","clear","import","tool","delete","replace-members","remove-member","delete-islands","finish-polygon"];
      if(mutations.includes(action)&&!s.editing)return;
      if(action==="edit"){if(s.readOnly){this.message(this.key.includes(':dma:')?'在用方案只读，请复制为试验方案后编辑':'历史拓扑只读，请切换当前拓扑后编辑');return;}s.editing=true;s.tab="edit";s.tool="select";}
      if(action==="view"){if(s.dirty){s.modal={kind:"leave"};}else{s.editing=false;s.tab="layers";s.tool="select";s.vertices=[];s.start=null;}}
      if(action==="save"){try{this.validateSpatial(s.data);this.config.onSave?.(this.key,s.data);localStorage.setItem(`water-editor:${this.key}`,JSON.stringify(s.data));s.saved=copy(s.data);s.dirty=false;s.history=[];this.message("已保存");}catch(error){this.message(error.message||"保存失败：浏览器存储空间不足");} }
      if(action==="undo"){if(s.vertices.length){s.vertices.pop();}else if(s.history.length){s.data=s.history.pop();s.dirty=JSON.stringify(s.data)!==JSON.stringify(s.saved);if(!this.object(s.selected))s.selected=null;s.issue=null;} }
      if(action==="clear")s.modal={kind:"clear"};
      if(action==="cancel-modal")s.modal=null;
      if(action==="discard"){s.data=copy(s.saved);s.dirty=false;s.history=[];s.editing=false;s.tab="layers";s.selected=null;s.tool="select";s.vertices=[];s.start=null;s.modal=null;}
      if(action==="confirm-clear"){s.modal=null;this.mutate(()=>{if(this.mode==="dma")s.data.zones=[];else{s.data.nodes=[];s.data.pipes=[];s.data.zones=[];}s.selected=null;});return;}
      if(action==="tab"){if(value==="edit"&&!s.editing)return;s.tab=value;s.tool="select";s.vertices=[];s.start=null;}
      if(action==="tool"){s.tool=value;s.start=null;s.vertices=[];s.replacing=null;if(value==="move")s.selected=null;}
      if(action==="select-tool"||action==="cancel-tool"){s.tool="select";s.start=null;s.vertices=[];}
      if(action==="object"){s.selected=value;s.issue=null;this.fit([value]);}
      if(action==="close-detail"){s.selected=null;s.issue=null;}
      if(action==="table-type"){s.tableType=value;s.tablePage=1;s.query="";s.issueObjectIds=null;}
      if(action==="table-prev")s.tablePage=Math.max(1,s.tablePage-1);
      if(action==="table-next")s.tablePage++;
      if(action==="table-reset"){s.query="";s.tablePage=1;s.issueObjectIds=null;}
      if(action==="show-members"){window.WaterMapLayout.open(document.querySelector("[data-we-workspace] [data-map-workspace]"),"bottom");s.issueObjectIds=null;s.memberZone=s.selected;s.tableType="members";s.query="";s.tablePage=1;}
      if(action==="dma-issue"){s.issue=value;s.selected=null;const issue=this.dmaIssues().find(i=>i.id===value);if(issue)this.fit(issue.objects);}
      if(action==="issue-objects"){window.WaterMapLayout.open(document.querySelector("[data-we-workspace] [data-map-workspace]"),"bottom");const issue=this.dmaIssues().find(i=>i.id===s.issue);if(issue){s.tableType="all";s.query="";s.issueObjectIds=issue.objects;s.tablePage=1;}}
      if(action==="member"){this.fit([value]);}
      if(action==="replace-members"){s.replacing=s.selected;s.tool="polygon";s.vertices=[];}
      if(action==="remove-member") {
        const z=this.object(s.tableType==="members"?s.memberZone:s.selected);if(!z||z.type!=="zone")return;const next=copy(z);next.nodeIds=next.nodeIds.filter(id=>id!==value);next.pipeIds=next.pipeIds.filter(id=>id!==value);
        if(this.zonePoints(next).length<3){this.message("剩余成员无法形成分区面");return;}
        this.mutate(()=>Object.assign(z,next));return;
      }
      if(action==="delete"&&s.selected)s.modal={kind:"delete",ids:[s.selected]};
      if(action==="delete-islands"){const ids=[...new Set(this.issues().filter(i=>s.islands.includes(i.id)).flatMap(i=>i.objects))];s.modal={kind:"delete",ids};}
      if(action==="confirm-delete"){const ids=s.modal.ids;s.modal=null;this.deleteObjects(ids);return;}
      if(action==="run-check"){
        s.tab="check";s.issue=null;s.islands=[];
        const count=this.issues().length;
        this.refresh();
        window.WaterMapLayout?.open(document.querySelector('[data-map-workspace="topology-editor"]'),'left');
        this.message(`拓扑检查完成：发现 ${count} 个问题`);
        return;
      }
      if(action==="category"){s.category=value;s.issue=null;s.selected=null;}
      if(action==="issue"){s.issue=value;s.selected=null;const i=this.issues().find(i=>i.id===value);if(i)this.fit(i.objects);}
      if(action==="finish-polygon"){this.finishPolygon();return;}
      if(['extent','zoom-in','zoom-out'].includes(action)){const camera=window.WaterMapViewport?.get(document.querySelector('[data-we-map]'));if(camera){action==='extent'?camera.reset():camera.zoom(action==='zoom-in'?.8:1.25);return;}if(action==='extent')s.view=[0,0,900,540];else{const [x,y,w,h]=s.view,k=action==='zoom-in'?.8:1.25;s.view=[x+w*(1-k)/2,y+h*(1-k)/2,w*k,h*k];}}
      if(action==="import"){document.getElementById("weImport").click();return;}
      if(action==="export") {
        const payload=this.mode==="dma"?{schema:"water-dma-v1",topologyKey:this.key.split(':dma:')[0],planId:this.key.split(':dma:')[1]||null,zones:s.data.zones}:s.data;
        const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`water-${this.mode}-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
      }
      if(action==="confirm-import"){const data=s.modal.data;s.modal=null;this.mutate(()=>{s.data=data;s.selected=null;s.view=[0,0,900,540];});return;}
      this.refresh();
    }
    deleteObjects(ids) {
      const s=this.s,deleted=new Set(ids),linked=s.data.pipes.filter(p=>deleted.has(p.start)||deleted.has(p.end));
      linked.forEach(p=>deleted.add(p.id));
      this.mutate(()=>{s.data.nodes=s.data.nodes.filter(n=>!deleted.has(n.id));s.data.pipes=s.data.pipes.filter(p=>!deleted.has(p.id));s.data.zones=s.data.zones.filter(z=>!deleted.has(z.id)).map(z=>({...z,nodeIds:z.nodeIds.filter(id=>!deleted.has(id)),pipeIds:z.pipeIds.filter(id=>!deleted.has(id))}));s.data.zones=s.data.zones.filter(z=>this.zonePoints(z).length>=3);s.selected=null;});
    }
    finishPolygon() {
      const s=this.s,poly=s.vertices;
      if(!s.editing||poly.length<3)return;
      if(!simplePolygon(poly)){this.message("圈选边界不能自交或退化，请重新绘制");return;}
      const ns=s.data.nodes.filter(n=>inside(n,poly)),ps=s.data.pipes.filter(p=>{const[a,b]=this.coords(p);return window.DMAGeometry?window.DMAGeometry.containsPolyline(poly,p.geometry?.length?p.geometry:[a,b]):segmentInside(a,b,poly);});
      const z={id:s.replacing||this.id("DMA"),type:"zone",name:s.replacing?this.object(s.replacing).name:`新增分区 ${s.data.zones.length+1}`,parent:"",nodeIds:ns.map(n=>n.id),pipeIds:ps.map(p=>p.id)};
      if(this.zonePoints(z).length<3){this.message("请选择至少三个不共线的成员位置");return;}
      if(window.DMAGeometry){z.boundary=copy(poly);z.boundaryMode="enclosing-polygon";z.boundarySignature=window.DMAGeometry.boundarySignature(s.data,z);}
      this.mutate(()=>{if(s.replacing){const previous=this.object(s.replacing);for(const key of ["boundaryWidthM","boundaryRevision","boundaryAreaM2","boundaryPreviousAreaM2","boundaryAreaReductionPercent","boundaryWidthException","boundaryNote"])delete previous[key];Object.assign(previous,z);}else s.data.zones.push(z);s.selected=z.id;s.tool="select";s.vertices=[];s.replacing=null;});
    }
    async change(e) {
      const el=e.target;
      if(!el.closest("[data-we-workspace]"))return;
      if(el.hasAttribute("data-we-page-size")){this.s.tableSize=+el.value;this.s.tablePage=1;this.refresh();}
      if(el.dataset.weLayer){this.s.visible[el.dataset.weLayer]=el.checked;this.refresh();}
      if(el.dataset.weDefault){const key=el.dataset.weDefault;if(key==="diameter"&&(!Number.isFinite(+el.value)||+el.value<=0)){el.value=this.s.defaults.diameter;return;}this.s.defaults[key]=key==="diameter"?+el.value:el.value;}
      if(el.dataset.weIsland){this.s.islands=el.checked?[...new Set([...this.s.islands,el.dataset.weIsland])]:this.s.islands.filter(id=>id!==el.dataset.weIsland);this.refresh();}
      if(el.id==="weImport"&&el.files[0]) {
        const session=this.s;
        try {if(el.files[0].size>5*1024*1024)throw Error("文件不能超过 5 MB");const raw=JSON.parse(await el.files[0].text());if(session!==this.s||!session.editing)return;const data=this.mode==="dma"?this.validateDma(raw):this.validate(raw);session.modal={kind:"import",data};this.refresh();}catch(err){this.message(`导入失败：${err.message}`);}
      }
    }
    submit(e) {
      if(e.target.matches("[data-we-search]")){e.preventDefault();e.stopImmediatePropagation();this.s.query=new FormData(e.target).get("search").trim();this.s.tablePage=1;this.refresh();return;}
      if(!e.target.matches("[data-we-properties]"))return;
      e.preventDefault();e.stopImmediatePropagation();if(!this.s.editing)return;
      const o=this.object(this.s.selected),form=Object.fromEntries(new FormData(e.target));
      if("length" in form && form.length===lengthText(o.length))form.length=o.length;
      if(!form.name?.trim()){this.message("名称不能为空");return;}
      for(const key of ["x","y","elevation","diameter","length","startElevation","endElevation"])if(key in form){form[key]=form[key]===""&&(key==="diameter"||this.s.data.sourceDataset&&["elevation","startElevation","endElevation"].includes(key))?null:Number(form[key]);if(form[key]!==null&&!Number.isFinite(form[key])||["diameter","length"].includes(key)&&form[key]!==null&&form[key]<=0){this.message("请输入有效的属性值，管径和管长须大于 0");return;}}
      if(o.type==="pipe"&&form.start&&form.start===form.end){this.message("上游节点和下游节点不能相同");return;}
      this.mutate(()=>{if(o.type==="pipe"){const[a,b]=this.coords(o);o.a={x:a.x,y:a.y};o.b={x:b.x,y:b.y};}Object.assign(o,form);});this.message("属性已应用");
    }
    validate(data) {
      if(data?.schema!=="water-topology-v1"||![data.nodes,data.pipes,data.zones].every(Array.isArray))throw Error("请选择本产品导出的拓扑 JSON 文件");
      if(data.nodes.length+data.pipes.length+data.zones.length>50000)throw Error("对象数量超过 50000");
      const ids=new Set(),pointIds=new Set(data.nodes.map(n=>n.id)),pipeIds=new Set(data.pipes.map(p=>p.id));
      for(const o of [...data.nodes,...data.pipes,...data.zones]){if(typeof o.id!=="string"||!o.id||ids.has(o.id)||typeof o.name!=="string")throw Error("对象编号重复或名称缺失");ids.add(o.id);}
      const validElevation=v=>Number.isFinite(v)||(!!data.sourceDataset&&v===null);
      for(const n of data.nodes)if(!["node","valve","pump","plant","user","cap"].includes(n.type)||![n.x,n.y].every(Number.isFinite)||!validElevation(n.elevation)||n.diameter!==null&&(!Number.isFinite(n.diameter)||n.diameter<=0))throw Error("点要素属性无效");
      for(const p of data.pipes)if(p.type!=="pipe"||![p.a?.x,p.a?.y,p.b?.x,p.b?.y,p.diameter,p.length].every(Number.isFinite)||![p.startElevation,p.endElevation].every(validElevation)||p.diameter<=0||p.length<=0||typeof p.material!=="string"||typeof p.start!=="string"||typeof p.end!=="string"||(p.start&&!pointIds.has(p.start))||(p.end&&!pointIds.has(p.end))||(p.start&&p.start===p.end))throw Error("管线属性或起终点引用无效");
      const nodeMap=new Map(data.nodes.map(n=>[n.id,n])),pipeMap=new Map(data.pipes.map(p=>[p.id,p]));
      for(const z of data.zones) {
        if(z.type!=="zone"||!Array.isArray(z.nodeIds)||!Array.isArray(z.pipeIds)||z.nodeIds.some(id=>!pointIds.has(id))||z.pipeIds.some(id=>!pipeIds.has(id))||new Set(z.nodeIds).size!==z.nodeIds.length||new Set(z.pipeIds).size!==z.pipeIds.length)throw Error("分区成员引用无效");
        const points=[...z.nodeIds.map(id=>nodeMap.get(id)),...z.pipeIds.flatMap(id=>{const p=pipeMap.get(id);return[nodeMap.get(p.start)||p.a,nodeMap.get(p.end)||p.b];})];
        if(hull(points).length<3)throw Error("分区成员无法形成有效面");
      }
      return copy(data);
    }
    validateSpatial(data){
      const duplicate=new Set();
      for(const z of data.zones)for(const id of [...z.nodeIds,...z.pipeIds]){if(duplicate.has(id))throw Error('存在重复归属的成员，请先修正');duplicate.add(id);}
      const errors=(window.DMAGeometry?.validateZones(data)||[]).filter(i=>i.type!=='overlap');
      if(errors.length)throw Error(errors[0].zoneId+'：'+errors[0].message+'，请重新圈选边界');
      const hits=window.DMAGeometry?.findOverlaps(data)||[];
      if(hits.length)throw Error('分区范围存在空间重叠：'+hits.map(h=>h.a+' / '+h.b).join('、')+'，请先调整边界或成员');
    }
    validateDma(raw) {
      if(raw?.schema!=="water-dma-v1"||raw.topologyKey?.split(':dma:')[0]!==this.key.split(':dma:')[0]||!Array.isArray(raw.zones))throw Error("请选择当前拓扑导出的 DMA JSON 文件");
      const data=this.validate({...this.s.data,zones:raw.zones});this.validateSpatial(data);return data;
    }
    dialog() {
      const m=this.s.modal;let title="",body="",buttons="";
      if(m.kind==="clear"){title="清空全部对象";body=this.mode==="dma"?`删除全部 ${this.s.data.zones.length} 个 DMA 分区，保留拓扑点线。`:`删除全部 ${this.s.data.nodes.length} 个点、${this.s.data.pipes.length} 条线及关联 DMA 分区。`;buttons=this.button("confirm-clear","确认清空",false,"app-button-danger");}
      if(m.kind==="leave"){title="有未保存的修改";body="退出编辑将恢复最近一次保存的数据。";buttons=this.button("discard","放弃修改并退出",false,"app-button-danger");}
      if(m.kind==="delete"){const linked=this.s.data.pipes.filter(p=>m.ids.includes(p.start)||m.ids.includes(p.end));title="删除所选对象";body=`删除 ${m.ids.length} 个所选对象${linked.length?`及 ${linked.length} 条相连管线`:""}，同步移除 DMA 成员；无法成面的分区将一并删除。`;buttons=this.button("confirm-delete","确认删除",false,"app-button-danger");}
      if(m.kind==="import"){title=this.mode==="dma"?"导入 DMA 分区":"导入拓扑";body=this.mode==="dma"?`已读取 ${m.data.zones.length} 个分区，替换当前分区集合，保留拓扑点线。`:`已读取 ${m.data.nodes.length} 个点、${m.data.pipes.length} 条线、${m.data.zones.length} 个分区。导入将替换当前拓扑数据，可在保存前撤销。`;buttons=this.button("confirm-import","确认导入",false,"app-button-primary");}
      return `<div class="we-modal-backdrop"><section class="we-modal" role="dialog" aria-modal="true" aria-label="${title}"><h2>${title}</h2><p>${body}</p><footer>${this.button("cancel-modal","取消")}${buttons}</footer></section></div>`;
    }
  }
  window.WaterTopologyEditor=WaterTopologyEditor;
})();
