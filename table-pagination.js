(() => {
 'use strict';
 const states=new Map();
 function enhance(){document.querySelectorAll('table').forEach((table,index)=>{
  if(table.dataset.autoPaged||!table.tBodies.length||!table.tHead||table.closest('.hy-ledger,.product-bottom-drawer-body,.user-floors'))return;
  // Historical maps already paginate their backing data before rendering.
  let ancestor=table.parentElement;for(let i=0;i<4&&ancestor;i++,ancestor=ancestor.parentElement)if(ancestor.querySelector('[data-action="history-page"],.product-bottom-pagination'))return;
  table.dataset.autoPaged='true';
  const rows=[...table.tBodies].flatMap(b=>[...b.rows]).filter(r=>!(r.cells.length===1&&r.cells[0].colSpan>1));
  const key=[location.hash,document.querySelector('#projectSelect')?.value,index,table.tHead.textContent].join('|'),signature=rows.map(r=>r.textContent).join('|');
  let state=states.get(key);if(!state)states.set(key,state={page:1,size:10,signature});if(state.signature!==signature){state.page=1;state.signature=signature;}
  const bar=document.createElement('nav');bar.className='global-table-pagination';bar.setAttribute('aria-label','表格分页');
  const host=table.closest('.product-configurable-table')||table.parentElement;host.append(bar);
  function paint(){const pages=Math.max(1,Math.ceil(rows.length/state.size));state.page=Math.min(Math.max(1,state.page),pages);rows.forEach((r,i)=>r.hidden=i<(state.page-1)*state.size||i>=state.page*state.size);
   bar.innerHTML=`<span>共 ${rows.length} 条</span><button type="button" class="app-button app-button-small" data-pager="prev" ${state.page===1?'disabled':''}>上一页</button><span>${state.page} / ${pages}</span><button type="button" class="app-button app-button-small" data-pager="next" ${state.page===pages?'disabled':''}>下一页</button><label>每页 <select aria-label="每页条数">${[10,20,50].map(n=>`<option value="${n}" ${state.size===n?'selected':''}>${n} 条</option>`).join('')}</select></label><label>跳至 <input aria-label="跳转页码" type="number" min="1" max="${pages}" value="${state.page}"></label>`;
  }
  bar.addEventListener('click',e=>{const action=e.target.dataset.pager;if(!action)return;state.page+=action==='next'?1:-1;paint();});
  bar.addEventListener('change',e=>{if(e.target.tagName==='SELECT'){state.size=+e.target.value;state.page=1;}else if(e.target.tagName==='INPUT'){state.page=Math.floor(Number(e.target.value))||1;}else return;paint();});paint();
 });}
 document.addEventListener('DOMContentLoaded',()=>{enhance();new MutationObserver(()=>enhance()).observe(document.body,{childList:true,subtree:true});});
})();
