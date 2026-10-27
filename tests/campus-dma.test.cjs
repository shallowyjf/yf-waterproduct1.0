const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
global.window={};global.document={addEventListener(){}};
const G=require('../dma-geometry.js');window.DMAGeometry=G;
require('../topology-editor.js');require('../topology-map-data.js');require('../dma-demo.js');
const D=require('../data/campus-dataset.js'),s=D.snapshot;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sorted=values=>[...values].sort();
const ids=text=>text.split(' ');

// Independently calculated by cutting source pipes 40, L007 and 34 in the
// unchanged 2026-10-26 NET. Pipe 34 belongs to DMA-04; its boundary node 1 is
// owned by DMA-03. Entrance pipes 40 and L007 remain in the common inlet area.
const expected=[
  {id:'DMA-01',nodes:ids('10 11 12 13 14 15 28 4 5 6 8 9 JS640'),pipes:ids('10 11 12 13 14 15 16 41 6 7 8 9'),length:577.774869851,root:'28',buildings:ids('4 5 6 15'),inlet:['40'],outlet:[]},
  {id:'DMA-02',nodes:ids('16 17 18 19 20 21 22 23 JS10-1 JS200 JS207 JS208 JS238 JS239 JS258 JS41 JS41-1 JS42 JS619 JS620 JS621 JS622 JS623 JS625 JS626 JS629 JS637 JS638'),pipes:ids('17 18 20 21 22 23 24 25 26 27 L006 L009 L030 L034 L035 L038 L039 L040 L041 L042 L043 L044 L045 L046 L047 L048 L049'),length:318.182432658,root:'JS258',buildings:ids('JS625 JS42 17 22'),inlet:['L007'],outlet:[]},
  {id:'DMA-03',nodes:ids('1 2 24 25 26 27 7 JS209 JS211 JS215 JS216 JS217 JS250 JS35 JS36 JS39 JS52 JS52-1 JS53 JS54 JS55 JS56 JS57 JS63 JS630 JS631 JS64 JS69 JS70 JS999'),pipes:ids('28 3 31 32 33 37 38 39 4 L012 L013 L014 L015 L016 L018 L019 L020 L021 L025 L026 L027 L028 L074 L075 L085 L088 L090 L091 L092'),length:633.330473511,root:'JS52-1',buildings:ids('JS39 2 7'),inlet:[],outlet:['34']},
  {id:'DMA-04',nodes:ids('3 JS2 JS27 JS3 JS4 JS5 JS6 JS606 JS607 JS608 JS609 JS610 JS611 JS612 JS614 JS615 JS618 JS632 JS633 JS634 JS645'),pipes:ids('34 5 L105 L106 L107 L108 L109 L116 L117 L118 L119 L120 L121 L122 L123 L124 L125 L126 L127 L128 L129'),length:329.078557272,root:'1',buildings:ids('JS615 JS608 JS612'),inlet:['34'],outlet:[]}
];
const nodes=new Map(s.nodes.map(n=>[n.id,n])),pipes=new Map(s.pipes.map(p=>[p.id,p]));
function editor(){
  global.localStorage={getItem(){return null;},setItem(){}};
  const e=new window.WaterTopologyEditor({render(){},toast(){},icon(){return '';}});e.use('dma-independent-test','',{data:s,preserve:true});return e;
}

test('four requested DMAs preserve every pre-partition node and pipe property',()=>{
  assert.equal(digest(s.nodes),'c88419c95ddff4a939a0e1cc2cc1a085775138eb41619b576aa76c24d01b8946');
  assert.equal(digest(s.pipes),'dfd0cd7ca232d94cfd9bd339af4368ac0d60fed6e6f6ede381e41a9a1509d0fa');
  assert.deepEqual(sorted(s.zones.map(z=>z.id)),expected.map(e=>e.id));
  for(const e of expected){
    const z=s.zones.find(z=>z.id===e.id);
    assert.deepEqual(sorted(z.nodeIds),sorted(e.nodes),e.id+' nodes');
    assert.deepEqual(sorted(z.pipeIds.map(id=>pipes.get(id)?.sourceId)),sorted(e.pipes),e.id+' pipes');
    assert.ok(Math.abs(z.pipeIds.reduce((sum,id)=>sum+pipes.get(id).length,0)-e.length)<1e-8,e.id+' length');
    assert.equal(z.definitionSource,'user');assert.equal(z.boundaryMetersInstalled,false);
    for(const id of e.buildings)assert.ok(z.buildingNodeIds.includes(id),e.id+' building '+id);
  }
});

test('node and pipe ownership is unique and only the stated north entrance area remains unassigned',()=>{
  const assignedNodes=s.zones.flatMap(z=>z.nodeIds),assignedPipes=s.zones.flatMap(z=>z.pipeIds);
  assert.equal(assignedNodes.length,92);assert.equal(new Set(assignedNodes).size,92);
  assert.equal(assignedPipes.length,89);assert.equal(new Set(assignedPipes).size,89);
  assert.deepEqual(sorted(s.nodes.filter(n=>!assignedNodes.includes(n.id)).map(n=>n.id)),['JS641','JS642','JS643','JS644']);
  assert.deepEqual(sorted(s.pipes.filter(p=>!assignedPipes.includes(p.id)).map(p=>p.sourceId)),['40','L003','L004','L005','L007']);
  const third=s.zones.find(z=>z.id==='DMA-03'),fourth=s.zones.find(z=>z.id==='DMA-04');
  assert.ok(third.nodeIds.includes('1'));assert.ok(!fourth.nodeIds.includes('1'));
  assert.deepEqual(fourth.boundaryNodeIds,['1']);
  for(const id of ['32','33'])assert.ok(third.pipeIds.includes('CAMPUS-P-'+id)&&!fourth.pipeIds.includes('CAMPUS-P-'+id));
  assert.ok(fourth.pipeIds.includes('CAMPUS-P-34')&&!third.pipeIds.includes('CAMPUS-P-34'));
});

test('each DMA is connected from its specified inlet and all graph cuts match the declared boundaries',()=>{
  for(const e of expected){
    const z=s.zones.find(z=>z.id===e.id),members=new Set(z.nodeIds),graph=new Map();
    for(const id of z.pipeIds){const p=pipes.get(id);assert.ok(p,id);for(const [a,b] of [[p.start,p.end],[p.end,p.start]]){if(!graph.has(a))graph.set(a,[]);graph.get(a).push(b);}}
    const seen=new Set(),pending=[e.root];while(pending.length){const id=pending.pop();if(seen.has(id))continue;seen.add(id);pending.push(...(graph.get(id)||[]));}
    assert.deepEqual(sorted(seen),sorted([...z.nodeIds,...(z.boundaryNodeIds||[])]),z.id+' connectivity');
    assert.deepEqual(sorted(s.pipes.filter(p=>members.has(p.start)!==members.has(p.end)).map(p=>p.sourceId)),sorted([...e.inlet,...e.outlet]));
    assert.deepEqual(sorted((z.inletPipeIds||[]).map(id=>pipes.get(id)?.sourceId)),e.inlet,z.id+' inlet');
    assert.deepEqual(sorted((z.outletPipeIds||[]).map(id=>pipes.get(id)?.sourceId)),e.outlet,z.id+' outlet');
  }
  assert.equal(nodes.get('JS52-1').nodeKind,'JUNCTION','business inlet name must not create a hydraulic source');
});

test('four corridor polygons contain complete member geometry and share no positive-area overlap',()=>{
  const renderer=editor(),model=window.TopologyMapData.build(s,renderer);
  assert.deepEqual(G.validateZones(s),[]);
  for(const z of s.zones){
    assert.equal(z.boundaryMode,'pipe-corridor');assert.equal(z.boundaryWidthM,10);
    assert.ok(z.boundary.length>=3&&z.boundary.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
    assert.equal(G.isSimplePolygon(z.boundary),true,z.id);
    assert.equal(z.boundarySignature,G.boundarySignature(s,z));
    assert.equal(G.containsZone(s,z,z.boundary),true,z.id);
    for(const id of z.pipeIds)assert.equal(G.containsPolyline(z.boundary,pipes.get(id).geometry),true,z.id+' encloses '+id);
    for(const id of [...z.nodeIds,...(z.boundaryNodeIds||[])])assert.equal(G.pointInPolygon(nodes.get(id),z.boundary),true,z.id+' encloses '+id);
    const rendered=model.zones.find(q=>q.id===z.id);assert.equal(G.pointInPolygon({x:rendered.labelX,y:rendered.labelY},z.boundary),true,z.id+' label');
  }
  for(let i=0;i<s.zones.length;i++)for(let j=i+1;j<s.zones.length;j++)assert.ok(G.intersectionArea(s.zones[i].boundary,s.zones[j].boundary)<=G.DEFAULT_AREA_TOLERANCE,s.zones[i].id+' overlaps '+s.zones[j].id);
  assert.deepEqual(G.findOverlaps(s),[]);
});

test('user-defined boundaries do not fabricate devices, readings or hydraulic flow directions',()=>{
  assert.deepEqual(s.metadata.monitoringPlan,[]);
  const model=window.TopologyMapData.build(s,editor());window.DMADemo.monitors(model);
  assert.deepEqual(model.monitors,[]);assert.deepEqual(model.events,[]);
  for(const z of model.zones)for(const field of ['inlet','outlet','pressure','minPressure','leakage'])assert.equal(z[field],'—',z.id+'.'+field);
  assert.ok(s.pipes.every(p=>!p.assumedSupplyStart&&!p.assumedSupplyEnd));
});

test('DMA details present the user-defined scope and expose node 1 as the outlet and shared boundary',()=>{
  const model=window.TopologyMapData.build(s,editor());
  for(const z of model.zones){
    assert.equal(z.status,'用户指定分区');
    const html=window.TopologyMapData.detail(model,'dma',z.id);
    assert.match(html,/用户指定范围/);assert.doesNotMatch(html,/假定分区|假定入口|假定出口/);
    assert.match(html,/起点节点/);
  }
  const third=window.TopologyMapData.detail(model,'dma','DMA-03'),fourth=window.TopologyMapData.detail(model,'dma','DMA-04');
  assert.match(third,/出口交界节点<\/div><div class="app-description-value">1<\/div>/);
  assert.match(fourth,/共用边界节点<\/div><div class="app-description-value">1<\/div>/);
});
