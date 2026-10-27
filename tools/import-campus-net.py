"""Import the current campus NET verbatim, preserving the previous import as history.

Run from any directory. Source IDs, topology, descriptions and geometry come from
the NET; historical surveyed physical metadata is retained only at unmoved IDs.
No hydraulic sources, installed devices or flow directions are inferred. The
four DMA ranges are the user's explicit 2026-10-27 partition definition.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import shutil

from read_epanet_net import read_net

APP = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = APP / 'data/sources/campus_water_completed1026_管长_铸铁DN200.net'
ARCHIVE = APP / 'data/archives/campus-before-20261026'
DATE = '2026-10-26'


def build(source):
    raw = read_net(source)
    assert raw['header'] == '<EPANET2>'
    assert not raw['pumps'] and not raw['valves'] and not raw['tanks'], 'Unsupported element type: import stopped'
    old = json.loads((ARCHIVE / 'campus-topology.json').read_text(encoding='utf-8'))
    old_nodes = {n['id']: n for n in old['nodes']}
    old_pipes = {p['sourceId']: p for p in old['pipes']}
    raw_nodes = raw['junctions'] + raw['reservoirs']
    by_id = {n['id']: n for n in raw_nodes}
    assert len(by_id) == len(raw_nodes)
    assert len({p['id'] for p in raw['pipes']}) == len(raw['pipes'])
    assert all(p['node1'] in by_id and p['node2'] in by_id for p in raw['pipes'])
    xs, ys = [n['x'] for n in raw_nodes], [n['y'] for n in raw_nodes]
    scale = min(820 / (max(xs) - min(xs)), 460 / (max(ys) - min(ys)))
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2

    def xy(x, y):
        return {'x': round(450 + (x - cx) * scale, 6), 'y': round(270 - (y - cy) * scale, 6)}

    graph = defaultdict(list)
    for p in raw['pipes']:
        graph[p['node1']].append(p['node2'])
        graph[p['node2']].append(p['node1'])
    components = {}
    count = 0
    for n in raw_nodes:
        if n['id'] in components:
            continue
        count += 1
        queue = [n['id']]
        while queue:
            nid = queue.pop()
            if nid in components:
                continue
            components[nid] = f'C{count:02d}'
            queue.extend(graph[nid])

    nodes = []
    reservoir_ids = {n['id'] for n in raw['reservoirs']}
    for r in raw_nodes:
        prior = old_nodes.get(r['id'], {})
        n = deepcopy(prior)
        kind = 'RESERVOIR' if r['id'] in reservoir_ids else 'JUNCTION'
        unchanged_location = prior and math.isclose(prior['sourceX'], r['x'], abs_tol=1e-7) and math.isclose(prior['sourceY'], r['y'], abs_tol=1e-7)
        description = r['description']
        object_type = prior.get('type', 'node')
        if kind == 'RESERVOIR':
            object_type = 'plant'
        elif object_type == 'plant':
            object_type = 'node'
        name = prior.get('name') or r['tag'] or f"节点 {r['id']}"
        if prior.get('nodeKind') == 'RESERVOIR' and kind == 'JUNCTION':
            name = f"入口连接点 {r['id']}"
        elevation = float(r['elevation']) if kind == 'JUNCTION' else None
        physical_elevation = None if 'ZMISS' in r['tag'] or 'ELEV_MISSING' in description else elevation
        n.update(id=r['id'], sourceId=r['id'], name=name, type=object_type,
                 diameter=prior.get('diameter'),
                 **xy(r['x'], r['y']), sourceX=r['x'], sourceY=r['y'],
                 nodeKind=kind, sourceDescription=description, sourceTag=r['tag'],
                 sourceKind=prior.get('sourceOriginalType', '连接点') if kind == 'JUNCTION' else '水源',
                 epanetElevation=elevation, elevation=physical_elevation,
                 elevationStatus='源NET数值' if physical_elevation is not None else '待补标高',
                 headM=float(r['head']) if kind == 'RESERVOIR' else None,
                 headStatus='源NET数值' if kind == 'RESERVOIR' else '',
                 sourceDemandLps=float(r['demand']) if kind == 'JUNCTION' else None,
                 demandStatus='源NET数值，待现场确认', nodeRole='',
                 componentId=components[r['id']], sourceIdForSupply=None)
        for field in ['groundElevation', 'depthM']:
            n[field] = prior.get(field) if unchanged_location else None
        n['physicalMetadataSource'] = '2026-10-13测绘属性（同编号同坐标保留）' if unchanged_location else ''
        if '二级表' in description:
            n['installationStatus'] = ('开挖待选位置' if '待选' in description else '开挖标注，安装条件待现场核实') if '开挖' in description else '二级表标注，安装状态待核实'
        nodes.append(n)

    normalized = {n['id']: n for n in nodes}
    pipes = []
    for r in raw['pipes']:
        prior = old_pipes.get(r['id'], {})
        a, b = normalized[r['node1']], normalized[r['node2']]
        coords = [[a['sourceX'], a['sourceY']], *r['vertices'], [b['sourceX'], b['sourceY']]]
        description = r['description']
        material = '铸铁管' if 'CAST_IRON' in description or 'CAST_IRON' in r['tag'] or '铸铁管' in description else prior.get('material', '')
        p = dict(id='CAMPUS-P-' + r['id'], sourceId=r['id'], name='管段 ' + r['id'], type='pipe',
                 start=r['node1'], end=r['node2'], a={k:a[k] for k in ('x','y')}, b={k:b[k] for k in ('x','y')},
                 diameter=float(r['diameter']), length=float(r['length']), material=material,
                 roughness=float(r['roughness']), minorLoss=float(r['minor_loss']), sourceStatus=r['status'],
                 sourceDescription=description, sourceTag=r['tag'], sourceKind='NET_PIPE',
                 sourceGeometry=coords, geometry=[xy(*c) for c in coords], componentId=components[r['node1']],
                 startElevation=a['elevation'], endElevation=b['elevation'],
                 sourceChange='2026-10-26新增' if not prior else '源NET保留或修改')
        if '二级表' in description:
            p['installationStatus'] = '二级表标注管段，沿线具体安装点待确认'
        pipes.append(p)

    installation = []
    for o in nodes + pipes:
        if '二级表' not in o['sourceDescription']:
            continue
        installation.append({'id': 'INSTALL-' + ('P-' if o['type'] == 'pipe' else 'N-') + o['sourceId'],
                             'objectId': o['id'], 'sourceId': o['sourceId'],
                             'objectType': 'pipe' if o['type'] == 'pipe' else 'node',
                             'sourceDescription': o['sourceDescription'], 'sourceTag': o['sourceTag'],
                             'excavationCandidate': '开挖' in o['sourceDescription'],
                             'selectionPending': '待选' in o['sourceDescription'],
                             'status': o['installationStatus'], 'installed': None})
    sha = raw['source_sha256']
    revision = 'campus-net-20261026-' + sha[:12] + '-v2'
    metadata = {'topologyRevision': revision, 'sourceCounts': raw['counts'],
                'coordinateSystem': deepcopy(old['metadata']['coordinateSystem']),
                'displayTransform': {'width':900, 'height':540, 'scale':scale, 'yFlipped':True, 'centerX':cx, 'centerY':cy},
                'bounds': {'minX':min(xs), 'minY':min(ys), 'maxX':max(xs), 'maxY':max(ys)},
                'sharedNodeIds': [n['id'] for n in nodes], 'sharedPipeIds': [p['id'] for p in pipes],
                'sharedSourcePipeIds': [p['sourceId'] for p in pipes],
                'sharedNote': '最新NET已导入；旧DMA及计量边界已归档，需按最新连接关系复核。',
                'dmaStatus': '最新拓扑的DMA分区待复核', 'boundaryMeterPlans': [], 'monitoringPlan': [],
                'installationPoints': installation, 'installationRevision': revision,
                'hydraulicStatus': '未计算；源NET未设置水源边界，不能据此推定供水方向或计算水力结果。',
                'legacyTopologyArchive': 'data/archives/campus-before-20261026/campus-topology.json',
                'idMapping': {'node':'原始点号不变','pipe':'CAMPUS-P-前缀＋原始线号；sourceId保留原始线号'}}
    provenance = {'sourceDirectory': str(source.parent), 'sourceFile': source.name,
                  'sourceSha256': sha, 'sourceBytes': raw['source_bytes'], 'importedAt': DATE,
                  'sourceUntouched': True, 'consumedBytes': raw['consumed_bytes'],
                  'files': [{'path':'sources/'+source.name,'sha256':sha}],
                  'status': '源NET全字节解析；安装标注逐字保留；旧DMA归档待复核',
                  'sourceTitle': raw['title'], 'sourceNotes': raw['notes'],
                  'note': '源标题/备注仍写102节点100管段，实际元素为96节点94管段，以实际元素为准。'}
    snapshot = {'schema':'water-topology-v1', 'sourceDataset':old['sourceDataset'], 'sampleRevision':revision,
                'displayScale':1,'nodes':nodes,'pipes':pipes,'zones':[], 'metadata':metadata,'provenance':provenance}
    summary = {'nodes':len(nodes),'pipes':len(pipes),'zones':0,'sources':len(reservoir_ids),'sourceIds':list(reservoir_ids),
               'components':count,'totalLengthM':sum(p['length'] for p in pipes),'assignedNodes':0,'assignedPipes':0,
               'sharedNodes':len(nodes),'sharedPipes':len(pipes),'sharedLengthM':sum(p['length'] for p in pipes),
               'userNodes':sum(n['type']=='user' for n in nodes),'hydraulicSimulationRun':False,
               'meterPlans':0,'actualMetersAdded':0,'zonesDetail':[], 'installationAnnotations':len(installation),
               'excavationCandidates':sum(i['excavationCandidate'] for i in installation),
               'selectionPending':sum(i['selectionPending'] for i in installation),'demonstrationMonitorPoints':0}
    assert len({o['id'] for o in nodes+pipes}) == len(nodes)+len(pipes)
    dataset = {'id':old['sourceDataset'],'projectId':'PRJ-SH-CAMPUS','topologyId':'T-SH-CAMPUS-20261013',
            'project':{'id':'PRJ-SH-CAMPUS','name':'上海技术学院漏损控制项目','province':'上海市','city':'上海市',
                       'district':'待确认','status':'建设中','owner':'—','updated':DATE},
            'snapshot':snapshot,'metadata':metadata,'provenance':provenance,'summary':summary}
    from campus_dma_20261027 import apply_dma
    return apply_dma(dataset)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=DEFAULT_SOURCE)
    args=parser.parse_args()
    source=args.source.resolve()
    data=build(source)
    (APP/'data/sources').mkdir(exist_ok=True)
    dest=APP/'data/sources'/source.name
    if source != dest.resolve():
        shutil.copy2(source,dest)
    assert hashlib.sha256(dest.read_bytes()).hexdigest()==data['provenance']['sourceSha256']
    (APP/'data/campus-topology.json').write_text(json.dumps(data['snapshot'],ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (APP/'data/campus-dataset.js').write_text('/* Generated from the 2026-10-26 NET by tools/import-campus-net.py. */\n(function(r){const d='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';r.CampusDataset=d;if(typeof module==="object"&&module.exports)module.exports=d;})(globalThis);\n',encoding='utf-8')
    print(json.dumps(data['summary'],ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
