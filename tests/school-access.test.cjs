const test=require('node:test');
const assert=require('node:assert/strict');
const access=require('../school-access.js');

test('school account requires its own password',()=>{
  assert.equal(access.authenticate('school1','School@2026'),true);
  assert.equal(access.authenticate('school1','wrong'),false);
  assert.equal(access.authenticate('admin','School@2026'),false);
});
test('school navigation only exposes the four requested functions without modifying shared menus',()=>{
  const groups=[{id:'maps',items:['p02','p02dma','p10','p02asset'].map(page=>({page}))},{id:'analysis',items:['leakage','p08'].map(page=>({page}))},{id:'hydraulic',items:[{page:'hydraulic'}]}];
  const original=JSON.stringify(groups);
  assert.deepEqual(access.navigation(groups).flatMap(g=>g.items.map(i=>i.page)),['p02dma','p10','p02asset','leakage']);
  assert.equal(JSON.stringify(groups),original);
});
test('monitoring drill-down remains available, other routes are denied',()=>{
  for(const page of ['p02dma','p10','p02asset','leakage','p11','p10h'])assert.equal(access.canPage(page),true,page);
  for(const page of ['projects','p03','p04','hydraulic','qualityScenes','simulation','p15','unknown'])assert.equal(access.canPage(page),false,page);
});
test('school actions cannot edit topology, DMA plans or start work orders',()=>{
  for(const action of ['open-projects','create-map-workorder','select-map-alarm','topology-save','binding-save','dma-plan-save'])assert.equal(access.canAction(action),false,action);
  assert.equal(access.canAction('logout'),true);
});
