(() => {
  'use strict';
  const key='water-product-theme',root=document.documentElement;
  let theme='light';try{theme=localStorage.getItem(key)==='dark'?'dark':'light';}catch(_){}
  function sync(){document.querySelectorAll('[data-theme-toggle]').forEach(b=>{const label=theme==='dark'?'切换到浅色':'切换到暗色',text=theme==='dark'?'☀ 浅色':'☾ 暗色';b.setAttribute('aria-label',label);b.setAttribute('title',label);b.setAttribute('aria-pressed',String(theme==='dark'));if(b.textContent!==text)b.textContent=text;});}
  function apply(next,persist){theme=next==='dark'?'dark':'light';root.dataset.theme=theme;root.style.colorScheme=theme;if(persist)try{localStorage.setItem(key,theme);}catch(_){}sync();window.dispatchEvent(new Event('water-theme-change'));}
  apply(theme,false);
  document.addEventListener('click',e=>{if(e.target.closest('[data-theme-toggle]'))apply(theme==='dark'?'light':'dark',true);});
  document.addEventListener('DOMContentLoaded',()=>{sync();new MutationObserver(sync).observe(document.body,{childList:true,subtree:true});});
  window.addEventListener('storage',e=>{if(e.key===key)apply(e.newValue,false);});
})();
