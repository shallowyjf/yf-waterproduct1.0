/* Shared SVG camera: one paint per animation frame, no topology/table rebuild. */
(() => {
 'use strict';
 const controllers=new WeakMap(),symbolLimiters=new WeakMap(),pending=new Set();let active=null,suppressed=null;
 const read=svg=>svg.getAttribute('viewBox').trim().split(/[ ,]+/).map(Number);
 // Keep feature coordinates untouched; only shrink symbol-local geometry when
 // the camera would make a facility cover neighbouring features on screen.
 function symbolLimiter(svg){
  const groups=[...svg.querySelectorAll('g.we-node,g.ws-node,g.product-monitor-symbol,g.product-ops-marker,g.product-history-marker,g.product-water-plant,g.product-pump-station,g.product-junction-node,g.product-valve-node,g.product-user-terminal')].map(node=>{
   let matrix=new DOMMatrix();for(let i=0;i<node.transform.baseVal.numberOfItems;i++)matrix=matrix.multiply(node.transform.baseVal.getItem(i).matrix);
   const leader=node.querySelector('.unified-leader');
   return {node,original:node.getAttribute('transform')||'',scale:Math.max(Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d)),leader,leaderTransform:leader?.getAttribute('transform')||'',factor:1};
  });
  const circles=[...svg.querySelectorAll('circle[data-hy="object"]')].map(node=>({node,r:Number(node.getAttribute('r')),stroke:Number(node.getAttribute('stroke-width')||1),factor:1}));
  let previousScale=0;
  return ()=>{
   const matrix=svg.getScreenCTM();if(!matrix)return;
   const scale=Math.max(Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d));
   if(!Number.isFinite(scale)||scale<=0||Math.abs(scale-previousScale)<1e-6)return;previousScale=scale;
   for(const symbol of groups){const factor=Math.min(1,1.25/(scale*symbol.scale));if(Math.abs(factor-symbol.factor)<1e-6)continue;symbol.factor=factor;
    symbol.node.setAttribute('transform',symbol.original+(factor<1?` scale(${factor})`:''));
    // Monitor leaders keep their original endpoint at the attached asset.
    if(symbol.leader)symbol.leader.setAttribute('transform',symbol.leaderTransform+(factor<1?` scale(${1/factor})`:''));
   }
   for(const symbol of circles){const factor=Math.min(1,6/(scale*(symbol.r+symbol.stroke/2)));if(Math.abs(factor-symbol.factor)<1e-6)continue;symbol.factor=factor;symbol.node.setAttribute('r',symbol.r*factor);symbol.node.setAttribute('stroke-width',symbol.stroke*factor);}
  };
 }
 function limitMapSymbols(svg){if(!symbolLimiters.has(svg))symbolLimiters.set(svg,symbolLimiter(svg));symbolLimiters.get(svg)();}
 function attach(svg,options={}) {
  if(!svg)return null;if(controllers.has(svg))return controllers.get(svg);
  const base=(options.base||read(svg)).slice();let view=(options.view||read(svg)).slice(),painted=view.slice(),frame=0,settle=0,anchor=null;
  const composite=svg.dataset.imported==='true',originalTransform=svg.style.getPropertyValue('transform'),originalPriority=svg.style.getPropertyPriority('transform');
  const limitSymbols=()=>limitMapSymbols(svg);
  const valid=v=>v.length===4&&v.every(Number.isFinite)&&v[2]>0&&v[3]>0;
  function paint(){frame=0;if(!svg.isConnected){pending.delete(api);return;}
   if(composite&&anchor){const k=anchor.view[2]/view[2],tx=(1-k)*(anchor.matrix.e+anchor.matrix.a*anchor.view[0]-anchor.rect.x)+anchor.matrix.a*k*(anchor.view[0]-view[0]),ty=(1-k)*(anchor.matrix.f+anchor.matrix.d*anchor.view[1]-anchor.rect.y)+anchor.matrix.d*k*(anchor.view[1]-view[1]);svg.style.setProperty('transform',`translate3d(${tx}px,${ty}px,0) scale(${k})`,'important');}
   else svg.setAttribute('viewBox',view.join(' '));painted=view.slice();options.onChange?.(view.slice(),false);
  }
  function detail(){const zoom=base[2]/view[2],level=zoom>=4?'near':zoom>=2?'medium':'overview';if(svg.dataset.mapDetail!==level)svg.dataset.mapDetail=level;}
  function flush(){if(frame)cancelAnimationFrame(frame);frame=0;clearTimeout(settle);if(!svg.isConnected){pending.delete(api);return;}svg.setAttribute('viewBox',view.join(' '));if(originalTransform)svg.style.setProperty('transform',originalTransform,originalPriority);else svg.style.removeProperty('transform');anchor=null;painted=view.slice();detail();limitSymbols();svg.classList.remove('map-is-interacting');pending.delete(api);options.onChange?.(view.slice(),true);}
  function end(){flush();}
  function schedule(next){if(!valid(next))return;if(composite&&!anchor){const matrix=svg.getScreenCTM();if(matrix)anchor={view:read(svg),matrix,rect:svg.getBoundingClientRect()};}view=next;pending.add(api);if(!svg.classList.contains('map-is-interacting'))svg.classList.add('map-is-interacting');clearTimeout(settle);settle=setTimeout(end,160);if(!frame)frame=requestAnimationFrame(paint);}
  function zoom(factor,client){let k=Math.max(base[2]/(options.maxZoom||20),Math.min(base[2]/(options.minZoom||.4),view[2]*factor))/view[2];let at={x:view[0]+view[2]/2,y:view[1]+view[3]/2};
   if(client){const ctm=svg.getScreenCTM();if(ctm){const p=new DOMPoint(client.x,client.y).matrixTransform(ctm.inverse()),rendered=painted;at={x:view[0]+(p.x-rendered[0])/rendered[2]*view[2],y:view[1]+(p.y-rendered[1])/rendered[3]*view[3]};}}
   schedule([at.x+(view[0]-at.x)*k,at.y+(view[1]-at.y)*k,view[2]*k,view[3]*k]);
  }
  const api={svg,get:()=>view.slice(),set:schedule,flush,zoom,reset(){schedule(base.slice());},resize:limitSymbols,canPan:event=>options.canPan?.(event)!==false,end};
  controllers.set(svg,api);svg.dataset.mapViewport='true';svg.style.transformOrigin='0 0';detail();svg.setAttribute('viewBox',view.join(' '));limitSymbols();options.onChange?.(view.slice(),true);
  svg.addEventListener('wheel',e=>{if(e.ctrlKey)return;e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?500:1);zoom(Math.exp(Math.max(-.35,Math.min(.35,delta*.0015))),{x:e.clientX,y:e.clientY});},{passive:false});
  svg.addEventListener('pointerdown',e=>{if(e.button!==0||!api.canPan(e)||!e.isPrimary)return;if(pending.has(api))flush();const matrix=svg.getScreenCTM();if(!matrix)return;const inverse=matrix.inverse(),start=new DOMPoint(e.clientX,e.clientY).matrixTransform(inverse);active={api,id:e.pointerId,x:e.clientX,y:e.clientY,start,inverse,view:api.get(),moved:false};});
  return api;
 }
 document.addEventListener('pointermove',e=>{const d=active;if(!d||e.pointerId!==d.id)return;if(!d.api.svg.isConnected){active=null;return;}if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<4)return;if(!d.moved){d.moved=true;d.api.svg.setPointerCapture?.(d.id);}const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(d.inverse);d.api.set([d.view[0]+d.start.x-p.x,d.view[1]+d.start.y-p.y,d.view[2],d.view[3]]);});
 function finish(e){const d=active;if(!d||d.id!==e.pointerId)return;active=null;if(d.moved){suppressed={svg:d.api.svg,until:performance.now()+350};}if(d.api.svg.hasPointerCapture?.(d.id))d.api.svg.releasePointerCapture(d.id);d.api.end();}
 document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',finish);
 let resizeFrame=0;window.addEventListener('resize',()=>{if(!resizeFrame)resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;document.querySelectorAll('svg[data-map-viewport],svg.product-topology-svg').forEach(limitMapSymbols);});});
 document.addEventListener('click',e=>{if(!e.target.closest('[data-map-viewport],[data-action="map-view"],[data-we="zoom-in"],[data-we="zoom-out"],[data-we="extent"],[data-hy="zoom-in"],[data-hy="zoom-out"],[data-hy="extent"],[data-v2="ws-zoom"]'))for(const c of [...pending])c.flush();if(suppressed&&performance.now()<suppressed.until&&suppressed.svg.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();suppressed=null;}},true);
 window.WaterMapViewport={flush(){for(const c of [...pending])c.flush();},attach,get:svg=>controllers.get(svg),read,limitSymbols:limitMapSymbols};
})();
