/* Shared table query, column filters, stable sorting and pagination.
 * Model tables keep all records in memory and render only the selected page.
 * DOM adapters expect record changes to replace the table; use render() for model updates. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.WaterTable=api;})(typeof window==='object'?window:globalThis,function(root){
  'use strict';
  const states=new Map(),models=new Map(),controllers=new WeakMap(),collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=value=>value==null||typeof value==='number'&&!Number.isFinite(value)?'':String(value).replace(/\s+/g,' ').trim();
  const empty=value=>value==null||typeof value==='number'&&!Number.isFinite(value)||['','—','--','暂无'].includes(text(value));
  function number(value){if(typeof value==='number')return Number.isFinite(value)?value:null;const s=text(value).replace(/,/g,'').replace(/^DN\s*/i,'');const m=s.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*(?:m³\/h|m³|MPa|kPa|m\/s|m|km|mm|%|dB|mg\/L|NTU|个|台|条|天|次|年|户))?$/i);return m?Number(m[1]):null;}
  function date(value){const s=text(value);return /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(s)?Date.parse(s.replace(' ','T')+(s.length===10?'T00:00:00+08:00':'+08:00')):null;}
  function compare(a,b,direction='asc'){
    if(empty(a)||empty(b))return empty(a)?empty(b)?0:1:-1;
    const an=number(a),bn=number(b),ad=date(a),bd=date(b),sign=direction==='desc'?-1:1;
    return sign*(an!=null&&bn!=null?an-bn:ad!=null&&bd!=null?ad-bd:collator.compare(text(a),text(b)));
  }
  function select(rows,columns,state={}){
    const query=text(state.query).toLocaleLowerCase(),filters=state.filters||{};
    const values=(row,index)=>columns.map((column,i)=>column.value?column.value(row,index):row[i]);
    const matched=rows.map((row,index)=>({row,index,values:values(row,index)})).filter(item=>{
      if(query&&!item.values.some((value,i)=>columns[i].searchable!==false&&text(value).toLocaleLowerCase().includes(query)))return false;
      return Object.entries(filters).every(([index,filter])=>{
        if(columns[index]?.filterable===false)return true;const value=item.values[index],s=text(value);
        if(filter.text&&!s.toLocaleLowerCase().includes(text(filter.text).toLocaleLowerCase()))return false;
        if(Array.isArray(filter.values)&&!filter.values.includes(s))return false;
        if(filter.min!==''&&filter.min!=null){const n=filter.kind==='date'?date(value):number(value),min=filter.kind==='date'?date(filter.min):Number(filter.min);if(n==null||!Number.isFinite(min)||n<min)return false;}
        if(filter.max!==''&&filter.max!=null){const n=filter.kind==='date'?date(value):number(value),max=filter.kind==='date'?date(filter.max)+(String(filter.max).length===10?86399999:0):Number(filter.max);if(n==null||!Number.isFinite(max)||n>max)return false;}
        return true;
      });
    });
    const sort=state.sort;if(sort&&columns[sort.column]?.sortable!==false)matched.sort((a,b)=>compare(a.values[sort.column],b.values[sort.column],sort.direction)||a.index-b.index);
    return matched.map(item=>item.row);
  }
  function scope(key){const d=root.document;return [root.location?.hash||'',d?.querySelector('#projectSelect')?.value||'',d?.querySelector('.unified-version-control select')?.value||'',key].join('|');}
  function stateFor(key,size=10){const full=scope(key);if(!states.has(full))states.set(full,{query:'',filters:{},sort:null,page:1,size});return states.get(full);}
  function query(key,rows,columns){return select(rows,columns,stateFor(key));}
  function reset(key){const s=stateFor(key);Object.assign(s,{query:'',filters:{},sort:null,page:1});}
  function render({key,columns,rows,renderRow,pageSize=10,className='app-table'}){
    const model={key,columns,rows,renderRow,pageSize},full=scope(key);models.set(full,model);
    const s=stateFor(key,pageSize),filtered=select(rows,columns,s),pages=Math.max(1,Math.ceil(filtered.length/s.size));s.page=Math.min(s.page,pages);
    return `<div class="product-configurable-table water-table"><div class="product-configurable-table-scroll"><table class="${escape(className)}" data-water-table-key="${escape(key)}" data-water-table-model="${escape(full)}"><thead><tr>${columns.map(c=>`<th${c.filterable===false?' data-water-filter="false"':''}${c.sortable===false?' data-water-sort="false"':''}>${escape(c.label)}</th>`).join('')}</tr></thead><tbody>${filtered.slice((s.page-1)*s.size,s.page*s.size).map(renderRow).join('')||`<tr><td colspan="${columns.length}">无匹配记录</td></tr>`}</tbody></table></div></div>`;
  }
  let menu=null,anchor=null;
  function closeMenu(){if(menu){menu.remove();menu=null;}if(anchor){anchor.setAttribute('aria-expanded','false');anchor=null;}}
  function menuPosition(){if(!menu||!anchor?.isConnected){closeMenu();return;}const rect=anchor.getBoundingClientRect(),width=Math.min(320,root.innerWidth-24);menu.style.width=width+'px';menu.style.left=Math.max(12,Math.min(rect.right-width,root.innerWidth-width-12))+'px';menu.style.top=Math.max(8,Math.min(rect.bottom+6,root.innerHeight-menu.offsetHeight-12))+'px';}
  function columnMenu(control,index,button){
    if(anchor===button){closeMenu();return;}closeMenu();anchor=button;button.setAttribute('aria-expanded','true');
    const {columns,state}=control,column=columns[index],current=state.filters[index]||{},values=control.all.map((r,i)=>column.value(r,i));
    const valid=values.filter(v=>!empty(v)),kind=valid.length&&valid.every(v=>number(v)!=null)?'number':valid.length&&valid.every(v=>date(v)!=null)?'date':'text';
    const choices=[...new Set(values.map(text))].sort(collator.compare).slice(0,100),selected=new Set(current.values??choices),allSelected=current.values==null;
    menu=root.document.createElement('div');menu.className='water-column-menu';menu.setAttribute('role','dialog');menu.setAttribute('aria-label',column.label+'筛选与排序');
    menu.innerHTML=`<strong>${escape(column.label)}</strong>${column.sortable===false?'':`<div class="water-sort-actions"><button type="button" data-direction="asc">升序</button><button type="button" data-direction="desc">降序</button><button type="button" data-direction="none">取消排序</button></div>`}<form><label>包含内容<input class="app-input" name="contains" value="${escape(current.text||'')}" placeholder="输入筛选内容"></label>${kind==='text'?'':`<div class="water-filter-range"><label>最小值<input class="app-input" name="min" type="${kind==='date'?'date':'number'}" step="any" value="${escape(current.min||'')}"></label><label>最大值<input class="app-input" name="max" type="${kind==='date'?'date':'number'}" step="any" value="${escape(current.max||'')}"></label></div>`}<div class="water-filter-options"><div><button type="button" data-values="all">全选</button><button type="button" data-values="none">清空</button><small>${choices.length===100?'最多显示100个值，可用内容筛选':''}</small></div><div class="water-filter-values">${choices.map((v,i)=>`<label><input type="checkbox" name="choice" value="${i}" ${selected.has(v)?'checked':''}>${escape(v||'（空值）')}</label>`).join('')}</div></div><footer><button type="button" class="app-button" data-clear-column>重置本列</button><button type="submit" class="app-button app-button-primary">确定</button></footer></form>`;
    root.document.body.append(menu);let choicesChanged=false;
    menu.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.direction){state.sort=b.dataset.direction==='none'?null:{column:index,direction:b.dataset.direction};state.page=1;control.paint();closeMenu();}
      if(b.dataset.values){choicesChanged=true;menu.querySelectorAll('[name="choice"]').forEach(c=>c.checked=b.dataset.values==='all');}
      if(b.hasAttribute('data-clear-column')){delete state.filters[index];state.page=1;control.paint();closeMenu();}
    });
    menu.addEventListener('change',event=>{if(event.target.name==='choice')choicesChanged=true;});
    menu.querySelector('form').addEventListener('submit',event=>{event.preventDefault();const f=new FormData(event.target),checked=[...event.target.querySelectorAll('[name="choice"]:checked')].map(c=>choices[Number(c.value)]);state.filters[index]={text:f.get('contains')||'',min:f.get('min')||'',max:f.get('max')||'',kind,values:choicesChanged?(checked.length===choices.length?null:checked):allSelected?null:current.values};state.page=1;control.paint();closeMenu();});
    menuPosition();menu.querySelector('input')?.focus();
  }
  function enhance(rootNode=root.document){
    if(!rootNode?.querySelectorAll)return;
    for(const [index,table]of [...rootNode.querySelectorAll('table')].entries()){
      if(controllers.has(table)||table.dataset.waterSkip==='true'||!table.tHead||!table.tBodies.length)continue;
      const headers=[...table.tHead.rows[table.tHead.rows.length-1].cells];if(!headers.length||headers.some(h=>h.colSpan>1))continue;
      let component=table.closest('.water-table');
      if(!component){component=root.document.createElement('div');component.className='product-configurable-table water-table';table.before(component);const scroll=root.document.createElement('div');scroll.className='product-configurable-table-scroll';component.append(scroll);scroll.append(table);}
      const labels=headers.map(h=>h.dataset.waterLabel||text(h.textContent)),key=table.dataset.waterTableKey||[rootNode.id||'root',table.closest('[data-floor-root]')?.dataset.floorRoot||'',table.closest('[aria-label]')?.getAttribute('aria-label')||'',index,labels.join('~')].join(':');
      table.dataset.waterTableKey=key;table.dataset.autoPaged='true';
      const model=models.get(table.dataset.waterTableModel),original=[...table.tBodies[0].rows].filter(r=>!(r.cells.length===1&&r.cells[0].colSpan>1)),columns=model?.columns||headers.map((header,i)=>({label:labels[i],value:row=>row.cells[i]?.dataset.waterValue??text(row.cells[i]?.textContent),filterable:header.dataset.waterFilter!=='false'&&!!labels[i]&&!header.querySelector('input[type=checkbox]')&&!/^(操作|选择|定位|勾选)$/.test(labels[i]),sortable:header.dataset.waterSort!=='false'&&!!labels[i]&&!header.querySelector('input[type=checkbox]')&&!/^(操作|选择|定位|勾选)$/.test(labels[i]),searchable:!!labels[i]&&!header.querySelector('input[type=checkbox]')&&!/^(操作|选择|定位|勾选)$/.test(labels[i])}));
      const state=stateFor(key,model?.pageSize||10),toolbar=root.document.createElement('form');toolbar.className='water-table-query';toolbar.setAttribute('role','search');toolbar.setAttribute('aria-label','表格查询');toolbar.innerHTML=`<input class="app-input" type="search" aria-label="搜索当前表格" placeholder="搜索当前表格" value="${escape(state.query)}"><button type="submit" class="app-button app-button-primary">查询</button><button type="button" class="app-button" data-water-reset>重置</button>`;component.prepend(toolbar);
      const pager=root.document.createElement('nav');pager.className='global-table-pagination water-table-pagination';pager.setAttribute('aria-label','表格分页');component.append(pager);
      const control={table,columns,state,all:model?.rows||original,matched:[],paint(){
        this.matched=select(this.all,columns,state);const pages=Math.max(1,Math.ceil(this.matched.length/state.size));state.page=Math.min(Math.max(1,state.page),pages);
        const pageRows=this.matched.slice((state.page-1)*state.size,state.page*state.size),body=table.tBodies[0];
        if(model)body.innerHTML=pageRows.map(model.renderRow).join('')||`<tr class="water-table-empty"><td colspan="${columns.length}">无匹配记录</td></tr>`;
        else{const selected=new Set(pageRows),fragment=root.document.createDocumentFragment();for(const row of this.matched)fragment.append(row);for(const row of original)if(!fragment.contains(row))fragment.append(row);body.replaceChildren(fragment);original.forEach(row=>row.hidden=!selected.has(row));if(!pageRows.length){const r=body.insertRow();r.className='water-table-empty';const c=r.insertCell();c.colSpan=columns.length;c.textContent='无匹配记录';}}
        headers.forEach((h,i)=>{const filter=state.filters[i],active=filter&&(filter.text||filter.min!==''&&filter.min!=null||filter.max!==''&&filter.max!=null||Array.isArray(filter.values));h.setAttribute('aria-sort',state.sort?.column===i?(state.sort.direction==='asc'?'ascending':'descending'):'none');const sortButton=h.querySelector('[data-water-sort]');if(sortButton){sortButton.classList.toggle('is-active',state.sort?.column===i);sortButton.textContent=state.sort?.column===i?(state.sort.direction==='asc'?'↑':'↓'):'↕';}h.querySelector('[data-water-filter]')?.classList.toggle('is-active',!!active);});
        const sizes=[...new Set([model?.pageSize||10,10,20,50])].sort((a,b)=>a-b);pager.innerHTML=`<span>共 ${this.matched.length} 条${this.matched.length!==this.all.length?' / 全部 '+this.all.length+' 条':''}</span><button type="button" class="app-button app-button-small" data-water-page="prev" ${state.page===1?'disabled':''}>上一页</button><span>${state.page} / ${pages}</span><button type="button" class="app-button app-button-small" data-water-page="next" ${state.page===pages?'disabled':''}>下一页</button><label>每页<select aria-label="每页条数">${sizes.map(n=>`<option value="${n}" ${state.size===n?'selected':''}>${n} 条</option>`).join('')}</select></label><label>跳至<input type="number" aria-label="跳转页码" min="1" max="${pages}" value="${state.page}"></label>`;
        table.dispatchEvent(new CustomEvent('water-table-change',{bubbles:true,detail:{key,total:this.all.length,matched:this.matched.length,page:state.page}}));
      }};
      controllers.set(table,control);
      headers.forEach((header,i)=>{const column=columns[i];header.dataset.waterLabel=column.label;if(column.filterable===false&&column.sortable===false)return;header.replaceChildren();const holder=root.document.createElement('div');holder.className='water-table-heading';holder.innerHTML=`<span>${escape(column.label)}</span>${column.sortable===false?'':`<button type="button" data-water-sort aria-label="排序：${escape(column.label)}" title="切换排序">↕</button>`}${column.filterable===false?'':`<button type="button" data-water-filter aria-label="筛选：${escape(column.label)}" title="筛选与排序" aria-expanded="false"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12L9 8v5l-2-1V8Z" fill="none" stroke="currentColor" stroke-width="1.3"/></svg></button>`}`;header.append(holder);header.querySelector('[data-water-sort]')?.addEventListener('click',event=>{event.stopPropagation();state.sort=state.sort?.column!==i?{column:i,direction:'asc'}:state.sort.direction==='asc'?{column:i,direction:'desc'}:null;state.page=1;control.paint();});header.querySelector('[data-water-filter]')?.addEventListener('click',event=>{event.stopPropagation();columnMenu(control,i,event.currentTarget);});});
      toolbar.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();state.query=toolbar.querySelector('input').value.trim();state.page=1;control.paint();});toolbar.querySelector('[data-water-reset]').addEventListener('click',()=>{reset(key);toolbar.querySelector('input').value='';control.paint();closeMenu();});
      pager.addEventListener('click',event=>{const action=event.target.closest('[data-water-page]')?.dataset.waterPage;if(!action)return;state.page+=action==='next'?1:-1;control.paint();});pager.addEventListener('change',event=>{if(event.target.tagName==='SELECT'){state.size=Number(event.target.value);state.page=1;}else if(event.target.tagName==='INPUT')state.page=Math.floor(Number(event.target.value))||1;else return;control.paint();});control.paint();
    }
  }
  if(root.document){
    root.document.addEventListener('click',event=>{if(menu&&!menu.contains(event.target)&&!anchor?.contains(event.target))closeMenu();});root.document.addEventListener('keydown',event=>{if(event.key==='Escape'){const previous=anchor;closeMenu();previous?.focus();}});root.addEventListener('resize',menuPosition);root.addEventListener('scroll',menuPosition,true);
    const start=()=>{enhance();new MutationObserver(()=>{if(anchor&&!anchor.isConnected)closeMenu();enhance();}).observe(root.document.body,{childList:true,subtree:true});};
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start);else start();
  }
  return {render,enhance,query,reset,select,compare,number,scope,rows:table=>controllers.get(table)?.matched||[],getState:key=>stateFor(key)};
});
