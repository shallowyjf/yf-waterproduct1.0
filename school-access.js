/* Prototype account scope. Production authentication belongs to the permission service. */
(function(root){
  'use strict';
  const account='school1',password='School@2026',projectId='PRJ-SH-CAMPUS',home='p02dma';
  const mainPages=['p02dma','p10','p02asset','leakage'];
  // Trend and archived monitoring remain drill-down views of SCADA, without extra menu entries.
  const detailPages=['p11','p10h'];
  const blockedActions=new Set(['open-projects','enter-project','create-project','edit-project','delete-project','save-project','confirm-delete-project','toggle-message-center','open-message','ops-open-record','create-map-workorder','create-workorder-center','create-inspection','select-workorder','open-dma-members','standard-device-data']);
  const api={account,password,projectId,home,mainPages,detailPages,
    isSchool:name=>name===account,
    authenticate:(name,value)=>name===account&&value===password,
    canPage:page=>mainPages.includes(page)||detailPages.includes(page),
    canAction:action=>!blockedActions.has(action)&&action!=='select-map-alarm'&&!action.startsWith('dma-plan-')&&!action.startsWith('topology-')&&!action.startsWith('binding-'),
    navigation:groups=>groups.map(g=>({...g,items:g.items.filter(i=>mainPages.includes(i.page)).map(i=>({...i,label:({p02dma:'DMA 分区计量一张图',p10:'数据监控一张图',p02asset:'资产管理一张图',leakage:'DMA 漏损分析'})[i.page]}))})).filter(g=>g.items.length)
  };
  root.SchoolAccess=api;if(typeof module==='object')module.exports=api;
})(globalThis);
