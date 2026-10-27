"""The user's four DMA ranges on the unchanged 2026-10-26 campus NET.

Membership uses undirected graph cuts at the explicitly supplied boundaries.
The directions called inlet/outlet describe the user's administrative scope;
they are not hydraulic results or a reconstruction of missing source elements.
"""
from __future__ import annotations

from collections import defaultdict
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys

REVISION = 'campus-dma-20261027-v1'
UPDATED = '2026-10-27'
PLAN_NAME = '校园 DMA 四分区方案（2026-10-27）'
APP = Path(__file__).resolve().parents[1]


def _libraries():
    directory = APP.parent / '.report-build/campus-deps'
    if directory.is_dir():
        sys.path.insert(0, str(directory))
    import shapely
    from shapely.geometry import LineString, Point, Polygon
    from shapely.ops import unary_union
    return shapely, LineString, Point, Polygon, unary_union


def _stamp(snapshot):
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node.js is required to validate the displayed DMA geometry')
    script = '''
const fs=require('node:fs'),G=require(process.argv[1]);
const s=JSON.parse(fs.readFileSync(0,'utf8'));
for(const z of s.zones)z.boundarySignature=G.boundarySignature(s,z);
const issues=G.validateZones(s);
if(issues.length)throw Error(JSON.stringify(issues));
process.stdout.write(JSON.stringify(s.zones.map(z=>({id:z.id,signature:z.boundarySignature}))));
'''
    result = subprocess.run([node, '-e', script, str(APP / 'dma-geometry.js')],
                            input=json.dumps(snapshot, ensure_ascii=False), encoding='utf-8',
                            capture_output=True)
    if result.returncode:
        raise RuntimeError('DMA geometry rejected by the application validator:\n'+result.stderr)
    signatures = {r['id']: r['signature'] for r in json.loads(result.stdout)}
    for zone in snapshot['zones']:
        zone['boundarySignature'] = signatures[zone['id']]


def _boundaries(snapshot, width_m=10):
    shapely, LineString, Point, Polygon, unary_union = _libraries()
    zones, nodes, pipes = snapshot['zones'], snapshot['nodes'], snapshot['pipes']
    by_node, by_pipe = {n['id']: n for n in nodes}, {p['id']: p for p in pipes}
    transform = snapshot['metadata']['displayTransform']
    arc_segments = 8
    radius = width_m / 2 / math.cos(math.pi / (4 * arc_segments))
    networks, points, raw = {}, {}, {}
    for zone in zones:
        zid = zone['id']
        networks[zid] = unary_union([LineString(by_pipe[pid]['sourceGeometry']) for pid in zone['pipeIds']])
        points[zid] = unary_union([Point(by_node[nid]['sourceX'], by_node[nid]['sourceY']) for nid in zone['nodeIds']])
        raw[zid] = unary_union([networks[zid], points[zid]]).buffer(radius, quad_segs=arc_segments)
        assert raw[zid].geom_type == 'Polygon' and not raw[zid].interiors, (zid, 'Disconnected or holed corridor')

    # Only DMA-03/04 share a junction. Divide their intersecting buffer by the
    # angular bisector of the kindergarten branch 1->7 and dormitory branch 1->3.
    # This also handles the nearby 28/31/37/38 corridors without moving a pipe.
    shared = by_node['1']
    joint = (shared['sourceX'], shared['sourceY'])

    def direction(nid):
        n = by_node[nid]
        x, y = n['sourceX'] - joint[0], n['sourceY'] - joint[1]
        length = math.hypot(x, y)
        return x / length, y / length

    u, v = direction('3'), direction('7')
    tangent = [u[0] + v[0], u[1] + v[1]]
    length = math.hypot(*tangent)
    tangent = [c / length for c in tangent]
    normal = [-tangent[1], tangent[0]]
    extent = 5000
    a = (joint[0] + tangent[0] * extent, joint[1] + tangent[1] * extent)
    b = (joint[0] - tangent[0] * extent, joint[1] - tangent[1] * extent)

    def half_plane(sign):
        return Polygon([a, b, (b[0] + sign * normal[0] * extent, b[1] + sign * normal[1] * extent),
                        (a[0] + sign * normal[0] * extent, a[1] + sign * normal[1] * extent)])

    overlap = raw['DMA-03'].intersection(raw['DMA-04'])
    shapes = dict(raw)
    shapes['DMA-03'] = raw['DMA-03'].difference(overlap.intersection(half_plane(1)))
    shapes['DMA-04'] = raw['DMA-04'].difference(overlap.intersection(half_plane(-1)))
    clip = {'nodeId':'1', 'zoneIds':['DMA-03','DMA-04'], 'ownerZoneId':'DMA-03',
            'sourcePoint':list(joint), 'method':'angular-bisector', 'branchNodeIds':['7','3'],
            'normal':normal, 'overlapBeforeSplitM2':overlap.area,
            'rule':'仅裁分节点1附近的重合缓冲区，幼儿园32/33仍属DMA-03，宿舍支管34属DMA-04。',
            'widthException':'共享界点及邻近管道交叠区按共同边界收口，局部不能同时保持两区每侧5米；原管线不移动。'}

    def display(x, y):
        return {'x':round(transform['width']/2 + (x-transform['centerX'])*transform['scale'], 6),
                'y':round(transform['height']/2 - (y-transform['centerY'])*transform['scale'], 6)}

    area_by_zone, display_shapes = {}, {}
    precision_m = 1e-7
    for zone in zones:
        zid = zone['id']
        shape = shapes[zid].simplify(1e-6, preserve_topology=True)
        assert shape.geom_type == 'Polygon' and shape.is_valid and not shape.interiors, zid
        # GEOS can classify a point exactly on the shared cut differently at
        # sub-nanometre precision. No source geometry is changed by this tolerance.
        assert shape.buffer(precision_m).covers(networks[zid]) and shape.buffer(precision_m).covers(points[zid]), (zid, 'Incomplete source coverage')
        coordinates = list(shape.exterior.coords)[:-1]
        if zid in ('DMA-03', 'DMA-04'):
            # Put the actual displayed shared node on both rings. This avoids a
            # six-decimal rounding offset when the node lies inside a long edge.
            for i, p in enumerate(coordinates):
                q = coordinates[(i+1) % len(coordinates)]
                edge = LineString([p, q])
                if edge.distance(Point(joint)) < precision_m and math.dist(p, joint) > precision_m and math.dist(q, joint) > precision_m:
                    coordinates.insert(i+1, joint)
                    break
        boundary = [display(*p) for p in coordinates]
        # Remove duplicated rounded vertices while preserving the ring shape.
        boundary = [p for i, p in enumerate(boundary) if p != boundary[i-1]]
        displayed = Polygon([(p['x'],p['y']) for p in boundary])
        # Boolean clipping can leave a sub-micrometre backtracking spur that
        # becomes a crossing when rounded. Repair only that numerical sliver,
        # then keep both shared rings on the same six-decimal precision grid.
        cleaned = shapely.set_precision(displayed.buffer(0), 1e-6)
        assert cleaned.geom_type == 'Polygon' and not cleaned.interiors
        assert abs(cleaned.area-displayed.area)<1e-4, (zid,'Non-numerical polygon repair')
        display_shapes[zid] = cleaned
        boundary = [{'x':round(x,6),'y':round(y,6)} for x,y in list(cleaned.exterior.coords)[:-1]]
        area_by_zone[zid] = shape.area
        zone.update(boundary=boundary, boundaryMode='pipe-corridor', boundaryWidthM=width_m,
                    boundaryRevision='corridor-10m-campus-20261027-v1', boundaryAreaM2=shape.area,
                    boundaryWidthException=[clip] if zid in ('DMA-03','DMA-04') else [],
                    boundaryNote='按完整成员管线生成10米走廊；坐标和连接保持源NET原值。'
                                 + ('节点1附近共享边界收口，局部宽度例外见分区说明。' if zid in ('DMA-03','DMA-04') else ''))
    pairs = []
    for i, zone in enumerate(zones):
        for other in zones[i+1:]:
            area = shapes[zone['id']].intersection(shapes[other['id']]).area
            assert area < 1e-7, (zone['id'], other['id'], area)
            assert display_shapes[zone['id']].intersection(display_shapes[other['id']]).area == 0, (zone['id'], other['id'], 'Rounded display overlap')
            pairs.append({'zoneIds':[zone['id'],other['id']], 'overlapAreaM2':0})
    return {'mode':'pipe-corridor', 'revision':'corridor-10m-campus-20261027-v1',
            'widthM':width_m, 'halfWidthM':width_m/2, 'bufferRadiusM':radius,
            'arcSegmentsPerQuadrant':arc_segments, 'displayCoordinateDecimals':6,
            'precisionCleanupToleranceM':1e-6,
            'sourceCoverageToleranceM':precision_m,
            'coordinateUnits':'metres', 'engine':'Shapely '+shapely.__version__,
            'allMemberNodesEnclosed':True, 'allMemberPipeSegmentsEnclosed':True,
            'allSingleSimplePolygons':True, 'holes':0, 'allowsBoundaryTouch':True,
            'pairChecks':pairs, 'junctionClips':[clip], 'areaM2ByZone':area_by_zone,
            'totalAreaM2':sum(area_by_zone.values()),
            'widthPolicy':'常规走廊中心线每侧至少5米；共享界点与近距相邻管段按共同边界裁剪，局部宽度例外记录。'}


def apply_dma(dataset):
    s, metadata = dataset['snapshot'], dataset['metadata']
    before_nodes, before_pipes = json.dumps(s['nodes'],ensure_ascii=False), json.dumps(s['pipes'],ensure_ascii=False)
    graph = defaultdict(list)
    by_pipe = {p['sourceId']:p for p in s['pipes']}
    by_node = {n['id']:n for n in s['nodes']}
    for p in s['pipes']:
        graph[p['start']].append((p['end'],p['sourceId']))
        graph[p['end']].append((p['start'],p['sourceId']))

    def branch(root, blocked):
        nodes, pipes, queue = set(), set(), [root]
        while queue:
            nid = queue.pop()
            if nid in nodes:
                continue
            nodes.add(nid)
            for other, pid in graph[nid]:
                if pid not in blocked:
                    pipes.add(pid)
                    queue.append(other)
        return nodes, pipes

    definitions = [
        ('DMA-01','垃圾房＋体育馆厕所＋花房','28',{'40'},[],['15','6','5','4'],['垃圾房','体育馆厕所1','体育馆厕所2','花房'],'#13a889'),
        ('DMA-02','北教学楼＋宿舍1、2、3','JS258',{'L007'},[],['17','22','JS625','JS42'],['北教学楼','宿舍1','宿舍2','宿舍3'],'#1677ff'),
        ('DMA-03','南教学楼＋食堂＋幼儿园','JS52-1',{'34'},[],['JS39','2','7','25'],['南教学楼','食堂','幼儿园'],'#e89b18'),
        ('DMA-04','宿舍4、5、6','3',{'34'},['34'],['JS615','JS608','JS612'],['宿舍4','宿舍5','宿舍6'],'#9254de'),
    ]
    zones, assigned_nodes, assigned_pipes = [], set(), set()
    for zid,name,root,blocked,added,buildings_ids,buildings,color in definitions:
        member_nodes, member_pipes = branch(root,blocked)
        member_pipes.update(added)
        assert not assigned_nodes & member_nodes and not assigned_pipes & member_pipes
        assert set(buildings_ids) <= member_nodes
        assigned_nodes.update(member_nodes)
        assigned_pipes.update(member_pipes)
        boundary_nodes = sorted({by_pipe[pid][key] for pid in member_pipes for key in ('start','end')} - member_nodes)
        crossing = {p['sourceId'] for p in s['pipes'] if (p['start'] in member_nodes) != (p['end'] in member_nodes)}
        assert crossing == blocked, (zid,crossing,blocked)
        zone = {'id':zid,'name':name,'type':'zone','parent':'','level':1,'color':color,
                'definitionSource':'user','status':'用户指定分区','hypothetical':True,
                'nodeIds':[n['id'] for n in s['nodes'] if n['id'] in member_nodes],
                'pipeIds':[p['id'] for p in s['pipes'] if p['sourceId'] in member_pipes],
                'buildings':buildings,'buildingNodeIds':buildings_ids,
                'inletNodeIds':['1' if zid=='DMA-04' else root],
                'outletNodeIds':['1'] if zid=='DMA-03' else [],
                'boundaryNodeIds':boundary_nodes,
                'inletSourcePipeIds':[] if zid=='DMA-03' else sorted(blocked),
                'outletSourcePipeIds':['34'] if zid=='DMA-03' else [],
                'inletPipeIds':[] if zid=='DMA-03' else ['CAMPUS-P-'+pid for pid in sorted(blocked)],
                'outletPipeIds':['CAMPUS-P-34'] if zid=='DMA-03' else [],
                'componentId':by_node[root]['componentId'], 'sourceId':None,
                'lengthM':sum(p['length'] for p in s['pipes'] if p['sourceId'] in member_pipes),
                'boundaryMetersInstalled':False,'meterPlanIds':[],
                'partitionMethod':'用户指定边界节点＋无向拓扑连通切割',
                'flowDirectionInferred':False,
                'note':{
                    'DMA-01':'从节点28之后包含垃圾房、体育馆厕所和花房4；入口连接管40保留为公共管段。',
                    'DMA-02':'从JS258之后包含北教学楼17及宿舍1、2、3；入口连接管L007保留为公共管段。',
                    'DMA-03':'南侧入口JS52-1至节点1，包含南教学楼JS39、食堂及幼儿园7/25；管32、33归本区。用户所称水源2对应JS52-1，源NET仍为普通节点。',
                    'DMA-04':'从共同界点1沿管34至宿舍4、5、6；节点1成员唯一归DMA-03，本区仅引用其为界点，管34归本区。',
                }[zid]+'分区边界按用户指定范围记录，未推定实际水流方向或新增现场计量。'}
        zones.append(zone)
    s['zones'] = zones
    validation = _boundaries(s)
    _stamp(s)
    shared_nodes=[n['id'] for n in s['nodes'] if n['id'] not in assigned_nodes]
    shared_pipes=[p for p in s['pipes'] if p['sourceId'] not in assigned_pipes]
    metadata.update(dmaLayoutRevision=REVISION,dmaLayoutUpdatedAt=UPDATED,dmaPlanName=PLAN_NAME,
                    dmaPartitionDefinition={'definitionSource':'user','method':'undirected-graph-cut','flowDirectionInferred':False,
                        'entries':{'DMA-01':'28','DMA-02':'JS258','DMA-03':'JS52-1','DMA-04':'1'},
                        'cutSourcePipeIds':['40','L007','34'],
                        'southEntryConfirmation':'用户确认DMA3所称水源2为南侧入口JS52-1；不修改源NET节点类型。'},
                    dmaBoundaryNodeOwnership={'1':{'ownerZoneId':'DMA-03','referencedByZoneIds':['DMA-04']}},
                    sharedNodeIds=shared_nodes,sharedPipeIds=[p['id'] for p in shared_pipes],
                    sharedSourcePipeIds=[p['sourceId'] for p in shared_pipes],
                    sharedNote='北侧公共入口JS642至JS641及连接两个分区的管40、L007保留为未分配对象；无点线被删除。',
                    dmaStatus='用户指定四分区；现场计量边界待核实',
                    boundaryGeneration=validation,boundaryValidation=validation,
                    boundaryMeterPlans=[],monitoringPlan=[])
    dataset['project']['updated']=UPDATED
    dataset['summary'].update(zones=4,assignedNodes=len(assigned_nodes),assignedPipes=len(assigned_pipes),
        sharedNodes=len(shared_nodes),sharedPipes=len(shared_pipes),sharedLengthM=sum(p['length'] for p in shared_pipes),
        zonesDetail=[{'id':z['id'],'name':z['name'],'nodes':len(z['nodeIds']),'pipes':len(z['pipeIds']),'lengthM':z['lengthM']} for z in zones])
    assert json.dumps(s['nodes'],ensure_ascii=False)==before_nodes and json.dumps(s['pipes'],ensure_ascii=False)==before_pipes
    assert len(assigned_nodes)+len(shared_nodes)==len(s['nodes'])
    assert len(assigned_pipes)+len(shared_pipes)==len(s['pipes'])
    return dataset
