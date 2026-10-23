"""User-requested campus DMA and demonstration instrument layout, 2026-10-23."""
from copy import deepcopy

from campus_boundaries import create_corridor_boundaries


def revise_campus(dataset, stamp, width_m=10):
    s = dataset['snapshot']
    zones, metadata = s['zones'], s['metadata']
    by_id = {z['id']: z for z in zones}
    metadata['previousDMAMembership'] = {
        z['id']: {k: deepcopy(z[k]) for k in ['nodeIds', 'pipeIds']}
        for z in zones
    }
    north, south = by_id['DMA-01'], by_id['DMA-03']
    north['pipeIds'] += ['CAMPUS-P-' + p for p in ['L003', 'L004', 'L005']]
    north['nodeIds'] += ['JS641', 'JS642', 'JS643', 'JS644']
    north.update(inletPipeIds=[], inletSourcePipeIds=[], inletNodeIds=['JS642'],
                 outletPipeIds=['CAMPUS-P-L002'], outletSourcePipeIds=['L002'],
                 note='包含水源2及北教学楼、宿舍1、2、3供水支路；L002向垃圾房分区供水。',
                 balanceFormula='水源2入口计量 − L002出口计量')
    used = set(p for z in zones for p in z['pipeIds'])
    southern = [p for p in s['pipes'] if p['componentId'] == south['componentId'] and p['id'] not in used]
    south['pipeIds'] += [p['id'] for p in southern]
    used_nodes = set(n for z in zones for n in z['nodeIds'])
    south['nodeIds'] += [n['id'] for n in s['nodes'] if n['componentId'] == south['componentId'] and n['id'] not in used_nodes]
    south.update(inletPipeIds=[], inletSourcePipeIds=[], inletNodeIds=['JS52-1'],
                 note='包含水源1、左侧供水管道及南教学楼、食堂支路；经管段28向南泵房及宿舍4、5、6供水。',
                 balanceFormula='水源1入口计量 − 宿舍4、5、6出口计量')
    garbage = {
        'id': 'DMA-05', 'name': '垃圾房', 'type': 'zone', 'parent': '', 'level': 1,
        'hypothetical': True, 'status': '假定分区', 'color': '#e75f79',
        'nodeIds': ['JS640', '15'], 'pipeIds': ['CAMPUS-P-L002', 'CAMPUS-P-16'],
        'buildings': ['垃圾房'], 'buildingNodeIds': ['15'],
        'inletPipeIds': ['CAMPUS-P-L002'], 'outletPipeIds': ['CAMPUS-P-6'],
        'inletSourcePipeIds': ['L002'], 'outletSourcePipeIds': ['6'],
        'sourceId': 'JS642', 'componentId': north['componentId'],
        'note': 'L002和垃圾房支管16归本区；管段6继续向体育馆厕所＋花房供水。',
        'boundaryMetersInstalled': False, 'partitionMethod': '原始连接关系＋用户指定服务建筑',
        'balanceFormula': 'L002入口计量 − 管段6出口计量', 'meterPlanIds': []
    }
    zones.append(garbage)
    # Preserve the 10 m physical corridor convention and source geometry.
    for z in zones:
        z['lengthM'] = sum(p['length'] for p in s['pipes'] if p['id'] in z['pipeIds'])
    garbage['boundaryAreaM2'] = 1  # Replaced below by its actual buffered hull area.
    validation = create_corridor_boundaries(zones, s['nodes'], s['pipes'], metadata['displayTransform'], width_m)
    metadata['boundaryValidation'] = metadata['boundaryGeneration'] = validation
    # The current revision has no preceding generated polygon for the new zone.
    metadata['previousBoundaryByZone']['DMA-05'] = deepcopy(garbage['boundary'])
    metadata['dmaLayoutRevision'] = 'campus-dma-20261023-v1'
    metadata['sharedNodeIds'] = []
    metadata['sharedPipeIds'] = []
    metadata['sharedSourcePipeIds'] = []
    metadata['sharedNote'] = '两个水源及全部供水管线已归入五个分区。'
    plans = metadata['boundaryMeterPlans']
    for zid, host in [('DMA-01', 'JS642'), ('DMA-03', 'JS52-1')]:
        plan = next(p for p in plans if p['inletZoneId'] == zid)
        for key in ['pipeId', 'sourcePipeId', 'upstreamNodeId', 'downstreamNodeId']:
            plan.pop(key, None)
        plan['nodeId'] = host
    plans.append({'id': 'PLAN-METER-05', 'name': '垃圾房入口计量点', 'pipeId': 'CAMPUS-P-L002',
                  'sourcePipeId': 'L002', 'inletZoneId': 'DMA-05', 'outletZoneId': 'DMA-01',
                  'hypothetical': True, 'installed': False, 'reading': None})
    next(p for p in plans if p['inletZoneId'] == 'DMA-02')['outletZoneId'] = 'DMA-05'
    # 28 and 29 are a series connection without intervening user branches.
    next(p for p in plans if p['inletZoneId'] == 'DMA-04')['monitoringPipeId'] = 'CAMPUS-P-29'
    metadata['monitoringPlan'] = [
        {'id': 'Q-S2', 'type': 'flow', 'name': '水源2流量', 'hostId': 'JS642', 'numeric': 62.4},
        {'id': 'P-S2', 'type': 'pressure', 'name': '水源2压力', 'hostId': 'JS642', 'numeric': .326},
        {'id': 'Q-L002', 'type': 'flow', 'name': '垃圾房分区入口流量', 'hostId': 'CAMPUS-P-L002', 'numeric': 8.6},
        {'id': 'Q-25', 'type': 'flow', 'name': '宿舍1、2、3总流量', 'hostId': 'CAMPUS-P-25', 'numeric': 36.8},
        {'id': 'Q-S1', 'type': 'flow', 'name': '水源1流量', 'hostId': 'JS52-1', 'numeric': 73.2},
        {'id': 'P-S1', 'type': 'pressure', 'name': '水源1压力', 'hostId': 'JS52-1', 'numeric': .342},
        {'id': 'Q-29', 'type': 'flow', 'name': '南泵房至宿舍4、5、6流量', 'hostId': 'CAMPUS-P-29', 'numeric': 31.6},
        {'id': 'Q-3', 'type': 'flow', 'name': '食堂前方流量', 'hostId': 'CAMPUS-P-3', 'numeric': 42.8},
    ]
    for z in zones:
        z['meterPlanIds'] = [p['id'] for p in plans if z['id'] in [p.get('inletZoneId'), p.get('outletZoneId')]]
    assigned_nodes = [n for z in zones for n in z['nodeIds']]
    assigned_pipes = [p for z in zones for p in z['pipeIds']]
    assert len(set(assigned_nodes)) == len(assigned_nodes) == 102
    assert len(set(assigned_pipes)) == len(assigned_pipes) == 100
    stamp(s)
    dataset['summary'].update(zones=5, assignedNodes=102, assignedPipes=100, sharedNodes=0,
                              sharedPipes=0, sharedLengthM=0, meterPlans=5, demonstrationMonitorPoints=8,
                              targetBuildingNodes=13,
                              zonesDetail=[{'id': z['id'], 'name': z['name'], 'nodes': len(z['nodeIds']),
                                            'pipes': len(z['pipeIds']), 'lengthM': z['lengthM']} for z in zones])
    return dataset
