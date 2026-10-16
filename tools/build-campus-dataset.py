"""Import the supplied campus topology and reproducibly build four hypothetical DMAs.

The source is never changed. INP connectivity and DBF metadata are checked before
writing. No hydraulic result or installed meter is inferred from this partition.
"""
from __future__ import annotations

import argparse
from collections import defaultdict, deque
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import subprocess

from campus_boundaries import create_corridor_boundaries


DEFAULT_SOURCE = Path(r"D:\workyf\3.项目工作\3. 上海技术学院漏损控制项目\outputs\20261013_sources")
APP = Path(__file__).resolve().parents[1]
DATASET_ID = "sh-campus-20261013"
PIPE_PREFIX = "CAMPUS-P-"


def read_dbf(path):
    """Read the UTF-8 DBF attributes using only the Python standard library."""
    raw = path.read_bytes()
    count, header_length, record_length = struct.unpack_from("<IHH", raw, 4)
    fields = []
    offset = 32
    while raw[offset] != 13:
        field = raw[offset:offset + 32]
        fields.append((field[:11].split(b"\0")[0].decode("ascii"), chr(field[11]), field[16]))
        offset += 32
    rows = []
    for number in range(count):
        record = raw[header_length + number * record_length:header_length + (number + 1) * record_length]
        if record[:1] == b"*":
            continue
        cursor = 1
        result = {}
        for name, kind, length in fields:
            value = record[cursor:cursor + length].decode("utf-8").strip()
            cursor += length
            result[name] = (None if not value or set(value) == {"*"} else float(value)) if kind in "NF" else value
        rows.append(result)
    return rows


def read_inp(path):
    sections = defaultdict(list)
    section = None
    for original in path.read_text(encoding="gbk").splitlines():
        line = original.split(";", 1)[0].strip()
        if not line:
            continue
        if line.startswith("["):
            section = line.upper()
        elif section:
            sections[section].append(line.split())
    return sections


def close(a, b):
    return a == b if a is None or b is None else math.isclose(float(a), float(b), rel_tol=1e-10, abs_tol=1e-7)


def cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def convex_hull(points):
    points = sorted(set(tuple(p) for p in points))
    lower, upper = [], []
    for sequence, output in [(points, lower), (list(reversed(points)), upper)]:
        for p in sequence:
            while len(output) > 1 and cross(output[-2], output[-1], p) <= 1e-9:
                output.pop()
            output.append(p)
    return lower[:-1] + upper[:-1]


def polygon_edges(poly):
    return zip(poly, poly[1:] + poly[:1])


def polygon_area(poly):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in polygon_edges(poly)) / 2)


def segment_intersection(a, b, c, d):
    rx, ry, sx, sy = b[0] - a[0], b[1] - a[1], d[0] - c[0], d[1] - c[1]
    denominator = rx * sy - ry * sx
    if abs(denominator) < 1e-10:
        return None
    dx, dy = c[0] - a[0], c[1] - a[1]
    t, u = (dx * sy - dy * sx) / denominator, (dx * ry - dy * rx) / denominator
    if -1e-9 <= t <= 1 + 1e-9 and -1e-9 <= u <= 1 + 1e-9:
        return t, u, (a[0] + t * rx, a[1] + t * ry)
    return None


def inside_convex(point, poly):
    return all(cross(a, b, point) >= -1e-8 for a, b in polygon_edges(poly))


def inside_polygon(point, poly):
    inside = False
    for a, b in polygon_edges(poly):
        # Touching a boundary is allowed, including the shared DMA-03/04 inlet.
        if (abs(cross(a, b, point)) <= 1e-7 * max(1, math.dist(a, b))
                and min(a[0], b[0]) - 1e-7 <= point[0] <= max(a[0], b[0]) + 1e-7
                and min(a[1], b[1]) - 1e-7 <= point[1] <= max(a[1], b[1]) + 1e-7):
            return True
        if ((a[1] > point[1]) != (b[1] > point[1])
                and point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]):
            inside = not inside
    return inside


def convex_difference(outer, cut):
    """A single concave ring where the cut hull intersects the outer boundary.

    Split both CCW boundaries at crossings, keep outer pieces outside the cut,
    and traverse cut pieces in reverse. Reject multiple rings rather than drop
    an island/hole or silently draw an incomplete boundary.
    """
    segments = []
    for is_outer, poly, other in [(True, outer, cut), (False, cut, outer)]:
        for a, b in polygon_edges(poly):
            splits = [(0.0, a), (1.0, b)]
            for c, d in polygon_edges(other):
                intersection = segment_intersection(a, b, c, d)
                if intersection:
                    splits.append((intersection[0], intersection[2]))
            splits.sort()
            for (_, start), (_, end) in zip(splits, splits[1:]):
                if math.dist(start, end) < 1e-8:
                    continue
                midpoint = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
                covered = inside_convex(midpoint, other)
                if (is_outer and not covered) or (not is_outer and covered):
                    segments.append((start, end) if is_outer else (end, start))
    assert segments, "Empty polygon difference"
    ordered = [segments.pop(0)]
    while segments:
        index = next((i for i, s in enumerate(segments) if math.dist(s[0], ordered[-1][1]) < 1e-7), None)
        assert index is not None, "DMA polygon difference has disconnected rings"
        ordered.append(segments.pop(index))
    assert math.dist(ordered[-1][1], ordered[0][0]) < 1e-7
    return [s[0] for s in ordered]


def triangulate(poly):
    remaining, triangles = list(poly), []
    while len(remaining) > 3:
        for i, b in enumerate(remaining):
            a, c = remaining[i - 1], remaining[(i + 1) % len(remaining)]
            if cross(a, b, c) <= 1e-9:
                continue
            triangle = [a, b, c]
            if any(inside_convex(p, triangle) for j, p in enumerate(remaining)
                   if j not in {i, (i - 1) % len(remaining), (i + 1) % len(remaining)}):
                continue
            triangles.append(triangle)
            remaining.pop(i)
            break
        else:
            raise AssertionError("Boundary is not a simple polygon")
    triangles.append(remaining)
    assert abs(sum(polygon_area(t) for t in triangles) - polygon_area(poly)) < 1e-6
    return triangles


def convex_intersection(subject, clip):
    output = list(subject)
    for a, b in polygon_edges(clip):
        original, output = output, []
        for p, q in polygon_edges(original):
            cp, cq = cross(a, b, p), cross(a, b, q)
            pin, qin = cp >= -1e-9, cq >= -1e-9
            if pin:
                output.append(p)
            if pin != qin:
                fraction = cp / (cp - cq)
                output.append((p[0] + fraction * (q[0] - p[0]), p[1] + fraction * (q[1] - p[1])))
    return output


def add_nonoverlapping_boundaries(zones, nodes, pipes, scale):
    node_map, pipe_map = {n["id"]: n for n in nodes}, {p["id"]: p for p in pipes}
    hulls = {}
    for zone in zones:
        points = [(node_map[nid]["x"], node_map[nid]["y"]) for nid in zone["nodeIds"]]
        points += [(p["x"], p["y"]) for pid in zone["pipeIds"] for p in pipe_map[pid]["geometry"]]
        hulls[zone["id"]] = convex_hull(points)
    boundaries = dict(hulls)
    # The sports supply main skirts the northern buildings. Its convex envelope
    # contains the north district; an inward boundary around that district keeps
    # both actual pipe paths and all original DMA memberships intact.
    boundaries["DMA-02"] = convex_difference(hulls["DMA-02"], hulls["DMA-01"])
    for zone in zones:
        boundary = boundaries[zone["id"]]
        for nid in zone["nodeIds"]:
            node = node_map[nid]
            assert inside_polygon((node["x"], node["y"]), boundary), (zone["id"], nid)
        for pid in zone["pipeIds"]:
            line = [(p["x"], p["y"]) for p in pipe_map[pid]["geometry"]]
            for a, b in zip(line, line[1:]):
                splits = [0.0, 1.0]
                for c, d in polygon_edges(boundary):
                    intersection = segment_intersection(a, b, c, d)
                    if intersection:
                        splits.append(intersection[0])
                splits = sorted(set(splits))
                samples = splits + [(t + u) / 2 for t, u in zip(splits, splits[1:])]
                for t in samples:
                    point = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
                    assert inside_polygon(point, boundary), (zone["id"], pid, "segment not enclosed")
        zone["boundary"] = [{"x": x, "y": y} for x, y in boundary]
        zone["boundaryMode"] = "enclosing-polygon"
        zone["boundaryAreaM2"] = polygon_area(boundary) / scale ** 2
        zone["boundaryNote"] = ("依据成员节点和完整管线几何生成外接多边形，允许共边和接触，不允许面积重叠。"
                                + ("体育馆厕所＋花房区沿北侧供水主线形成凹多边形，避让DMA-01；成员保持不变。" if zone["id"] == "DMA-02" else ""))
    triangles = {zid: triangulate(poly) for zid, poly in boundaries.items()}
    pair_checks = []
    for index, zone in enumerate(zones):
        for other in zones[index + 1:]:
            area = sum(polygon_area(convex_intersection(a, b))
                       for a in triangles[zone["id"]] for b in triangles[other["id"]])
            assert area < 1e-6, (zone["id"], other["id"], "overlapping boundaries", area)
            pair_checks.append({"zoneIds": [zone["id"], other["id"]], "overlapAreaM2": 0})
    return {"mode": "enclosing-polygon", "membershipUnchanged": True, "allMemberNodesEnclosed": True,
            "allMemberPipeSegmentsEnclosed": True, "allowsBoundaryTouch": True, "pairChecks": pair_checks}


def stamp_boundary_signatures(snapshot):
    """Use the application helper so signature number formatting is identical."""
    executable = shutil.which("node")
    assert executable, "Node.js is required to stamp and verify application boundary signatures"
    script = """
const fs = require('node:fs'), geometry = require(process.argv[1]);
const data = JSON.parse(fs.readFileSync(0, 'utf8'));
for (const zone of data.zones) {
  zone.boundarySignature = geometry.boundarySignature(data, zone);
  if (!geometry.containsZone(data, zone, zone.boundary)) throw Error(zone.id + ': incomplete enclosure');
}
const issues = geometry.validateZones(data);
if (issues.length) throw Error(JSON.stringify(issues));
if (geometry.findOverlaps(data).length) throw Error('Overlapping DMA polygons');
process.stdout.write(JSON.stringify(data.zones.map(z => ({id: z.id, signature: z.boundarySignature}))));
"""
    process = subprocess.run([executable, "-e", script, str(APP / "dma-geometry.js")],
                             input=json.dumps(snapshot, ensure_ascii=False), encoding="utf-8",
                             capture_output=True, check=True)
    signatures = {r["id"]: r["signature"] for r in json.loads(process.stdout)}
    for zone in snapshot["zones"]:
        zone["boundarySignature"] = signatures[zone["id"]]


def build(source, width_m=10):
    model_path = source / "_work/model_final.json"
    inp_path = source / "campus_water_with_sources.inp"
    shape_dir = source / "学校管网_含水源_Shapefile"
    model = json.loads(model_path.read_text(encoding="utf-8"))
    original_nodes, original_pipes = model["points"], model["pipes"]
    by_node = {n["point_id"]: n for n in original_nodes}
    by_pipe = {p["line_id"]: p for p in original_pipes}
    assert len(by_node) == len(original_nodes) == 102
    assert len(by_pipe) == len(original_pipes) == 100

    inp = read_inp(inp_path)
    junctions = {row[0]: row for row in inp["[JUNCTIONS]"]}
    reservoirs = {row[0]: row for row in inp["[RESERVOIRS]"]}
    inp_pipes = {row[0]: row for row in inp["[PIPES]"]}
    coordinates = {row[0]: row for row in inp["[COORDINATES]"]}
    tags = {row[1]: " ".join(row[2:]) for row in inp["[TAGS]"] if row[0].upper() == "NODE"}
    assert set(junctions) | set(reservoirs) == set(by_node)
    assert len(junctions) == 100 and set(reservoirs) == {"JS52-1", "JS642"}
    assert not inp["[PUMPS]"] and not inp["[VALVES]"]
    assert set(inp_pipes) == set(by_pipe)
    for nid, node in by_node.items():
        assert all(close(a, b) for a, b in zip(node["coords"], coordinates[nid][1:3])), nid
        row = reservoirs[nid] if nid in reservoirs else junctions[nid]
        assert close(node["head_m"] if nid in reservoirs else node["epanet_elev"], row[1]), nid
        if nid not in reservoirs:
            assert close(node["demand"], row[2]), nid
        assert tags.get(nid, "") == node.get("tag", "").strip(), (nid, "tag")
    for pid, pipe in by_pipe.items():
        row = inp_pipes[pid]
        assert row[1:3] == [pipe["from_id"], pipe["to_id"]], pid
        assert all(close(a, b) for a, b in zip([pipe["length_m"], pipe["spec"], pipe["roughness"], pipe["minor_loss"]], row[3:7])), pid
        assert row[7].upper() == pipe["status"].upper(), pid

    point_dbfs = sorted(shape_dir.glob("点_*.dbf"))
    dbf_nodes = [row for path in point_dbfs for row in read_dbf(path)]
    dbf_pipes = read_dbf(shape_dir / "管线.dbf")
    assert len(dbf_nodes) == 102 and len(dbf_pipes) == 100
    assert {r["point_id"] for r in dbf_nodes} == set(by_node)
    assert {r["line_id"] for r in dbf_pipes} == set(by_pipe)
    for record in dbf_nodes:
        node = by_node[record["point_id"]]
        for key in ["tag", "pt_type", "comp_id", "node_kind"]:
            assert record[key] == node[key].strip(), (node["point_id"], key)
        for key in ["pipe_z_m", "ground_m", "depth_m", "head_m"]:
            assert close(record[key], node[key]), (node["point_id"], key)
        assert close(record["x_m"], node["coords"][0]) and close(record["y_m"], node["coords"][1])
    for record in dbf_pipes:
        pipe = by_pipe[record["line_id"]]
        for key in ["from_id", "to_id", "material"]:
            assert record[key] == pipe[key], (pipe["line_id"], key)
        for key in ["length_m", "spec", "start_z_m", "end_z_m"]:
            assert close(record[key], pipe[key]), (pipe["line_id"], key)

    adjacency = defaultdict(list)
    for pid, pipe in by_pipe.items():
        a, b = pipe["from_id"], pipe["to_id"]
        adjacency[a].append((b, pid))
        adjacency[b].append((a, pid))
    parents, source_for, supply_direction = {}, {}, {}
    for source_id in reservoirs:
        parents[source_id] = None
        source_for[source_id] = source_id
        queue = deque([source_id])
        while queue:
            nid = queue.popleft()
            for other, pid in adjacency[nid]:
                if other == parents[nid]:
                    continue
                assert other not in parents, "Source topology must remain two independent trees"
                parents[other] = nid
                source_for[other] = source_id
                supply_direction[pid] = (nid, other)
                queue.append(other)
    assert set(parents) == set(by_node)

    min_x = min(n["coords"][0] for n in original_nodes)
    max_x = max(n["coords"][0] for n in original_nodes)
    min_y = min(n["coords"][1] for n in original_nodes)
    max_y = max(n["coords"][1] for n in original_nodes)
    scale = min(820 / (max_x - min_x), 460 / (max_y - min_y))

    def xy(x, y):
        return {"x": round(450 + (x - (min_x + max_x) / 2) * scale, 6),
                "y": round(270 - (y - (min_y + max_y) / 2) * scale, 6)}

    def pipe_id(pid):
        return PIPE_PREFIX + pid

    user_aliases = {"17": "北教学楼", "2": "食堂直供", "5": "体育馆厕所2", "6": "体育馆厕所1"}
    kinds = {"水源": "plant", "用户": "user", "泵站": "pump", "阀门": "valve", "阀门井": "valve", "阀门孔": "valve"}
    nodes = []
    for n in original_nodes:
        nid = n["point_id"]
        friendly = user_aliases.get(nid) or (n["tag"] if n["pt_type"] in ("用户", "泵站") else n.get("source_no"))
        nodes.append({"id": nid, "sourceId": nid, "name": friendly or f'{n["pt_type"]} {nid}',
                      "type": kinds.get(n["pt_type"], "node"), **xy(*n["coords"]), "diameter": None,
                      "elevation": n["pipe_z_m"], "groundElevation": n["ground_m"], "depthM": n["depth_m"],
                      "epanetElevation": n["epanet_elev"], "elevationStatus": n["elev_status"],
                      "headM": n["head_m"], "headStatus": n["head_stat"], "nodeKind": n["node_kind"],
                      "sourceKind": n["pt_type"], "sourceTag": n["tag"], "sourceX": n["coords"][0],
                      "sourceY": n["coords"][1], "sourceIdForSupply": source_for[nid], "componentId": n["comp_id"],
                      "sourceDemandLps": n["demand"], "demandStatus": "占位，待设置",
                      "sourceDescription": n["description"], "nodeRole": n["node_role"],
                      "sourceUserType": n["user_type"], "sourceOriginalType": n["orig_type"]})
    normalized_nodes = {n["id"]: n for n in nodes}
    pipes = []
    for p in original_pipes:
        pid, a, b = p["line_id"], normalized_nodes[p["from_id"]], normalized_nodes[p["to_id"]]
        pipes.append({"id": pipe_id(pid), "sourceId": pid, "name": "管段 " + pid, "type": "pipe",
                      "start": p["from_id"], "end": p["to_id"], "a": {k: a[k] for k in ("x", "y")},
                      "b": {k: b[k] for k in ("x", "y")}, "diameter": p["spec"], "length": p["length_m"],
                      "material": p["material"], "startElevation": p["start_z_m"], "endElevation": p["end_z_m"],
                      "geometry": [xy(*c) for c in p["coords"]], "sourceGeometry": p["coords"],
                      "componentId": p["comp_id"], "roughness": p["roughness"], "minorLoss": p["minor_loss"],
                      "sourceStatus": p["status"], "sourceKind": p["src_kind"], "sourceTag": p["tag"],
                      "sourceChange": p["change"], "sourceDescription": p["description"],
                      "assumedSupplyStart": supply_direction[pid][0], "assumedSupplyEnd": supply_direction[pid][1]})

    # Each inlet identifies a unique downstream branch. DMA-03 is a through-fed
    # district: pipe 28 is owned by DMA-04, and is also DMA-03's export boundary.
    definitions = [
        ("DMA-01", "宿舍1、2、3＋北教学楼", "L007", [], ["22", "JS625", "JS42", "17"],
         ["宿舍1", "宿舍2", "宿舍3", "北教学楼"], "#1677ff"),
        ("DMA-02", "体育馆厕所＋花房", "6", [], ["6", "5", "4"],
         ["体育馆厕所1", "体育馆厕所2", "花房"], "#13a889"),
        ("DMA-03", "南教学楼＋食堂", "L088", ["28"], ["JS39", "2"],
         ["南教学楼", "食堂"], "#e89b18"),
        ("DMA-04", "宿舍4、5、6", "28", [], ["JS615", "JS608", "JS612"],
         ["宿舍4", "宿舍5", "宿舍6"], "#9254de"),
    ]
    zones, assigned_nodes, assigned_pipes, meter_plans = [], set(), set(), []
    for zid, name, inlet, exports, buildings_ids, buildings, color in definitions:
        upstream, root = supply_direction[inlet]
        member_nodes, member_pipes = set(), {inlet}
        queue = [root]
        while queue:
            nid = queue.pop()
            member_nodes.add(nid)
            for other, pid in adjacency[nid]:
                if other == parents[nid] or pid in exports:
                    continue
                member_pipes.add(pid)
                queue.append(other)
        assert set(buildings_ids).issubset(member_nodes), zid
        assert not member_nodes & assigned_nodes and not member_pipes & assigned_pipes, zid
        crossing = {pid for pid, p in by_pipe.items() if (p["from_id"] in member_nodes) != (p["to_id"] in member_nodes)}
        assert crossing == {inlet, *exports}, (zid, crossing)
        assigned_nodes.update(member_nodes)
        assigned_pipes.update(member_pipes)
        note = "按原拓扑的供水支路假定划分；入口计量点为规划位置，尚未确认或接入现场仪表。"
        if zid == "DMA-02":
            note += "原始标签为体育场厕所1、体育场厕所2；按用户分区名称显示为体育馆厕所，保留原始标签。"
        if exports:
            note += "本区向DMA-04串供，计量平衡应以L088入口量减去28出口量，不能把宿舍4、5、6用水计入本区。"
        zone = {"id": zid, "name": name, "type": "zone", "parent": "", "level": 1,
                "hypothetical": True, "status": "假定分区", "color": color,
                "nodeIds": [n["point_id"] for n in original_nodes if n["point_id"] in member_nodes],
                "pipeIds": [pipe_id(p["line_id"]) for p in original_pipes if p["line_id"] in member_pipes],
                "buildings": buildings, "buildingNodeIds": buildings_ids, "inletPipeIds": [pipe_id(inlet)],
                "outletPipeIds": [pipe_id(pid) for pid in exports], "inletSourcePipeIds": [inlet],
                "outletSourcePipeIds": exports, "sourceId": source_for[root], "componentId": by_node[root]["comp_id"],
                "lengthM": sum(by_pipe[pid]["length_m"] for pid in member_pipes), "note": note,
                "boundaryMetersInstalled": False, "partitionMethod": "原始连接关系＋用户指定服务建筑",
                "balanceFormula": "入口计量 − 出口计量" if exports else "入口计量",
                "meterPlanIds": ["PLAN-METER-" + zid[-2:]]}
        if exports:
            zone["meterPlanIds"].append("PLAN-METER-04")
        zones.append(zone)
        meter_plans.append({"id": "PLAN-METER-" + zid[-2:], "name": zid + "拟设入口计量点",
                            "pipeId": pipe_id(inlet), "sourcePipeId": inlet, "upstreamNodeId": upstream,
                            "downstreamNodeId": root, "inletZoneId": zid,
                            "outletZoneId": "DMA-03" if zid == "DMA-04" else None,
                            "hypothetical": True, "installed": False, "reading": None,
                            "status": "拟设，待现场确认"})

    shared_nodes = [n["point_id"] for n in original_nodes if n["point_id"] not in assigned_nodes]
    shared_pipes = [p["line_id"] for p in original_pipes if p["line_id"] not in assigned_pipes]
    assert "15" in shared_nodes, "Garbage house is outside the four requested districts"
    assert len(assigned_nodes) + len(shared_nodes) == 102 and len(assigned_pipes) + len(shared_pipes) == 100
    assert len({o["id"] for o in nodes + pipes + zones}) == len(nodes + pipes + zones)
    total_length = sum(p["length_m"] for p in original_pipes)
    assert close(total_length, model["summary"]["total_length_m"])
    add_nonoverlapping_boundaries(zones, nodes, pipes, scale)
    previous_boundary_by_zone = {zone["id"]: zone["boundary"] for zone in zones}
    boundary_validation = create_corridor_boundaries(
        zones, nodes, pipes,
        {"scale": scale, "centerX": (min_x + max_x) / 2, "centerY": (min_y + max_y) / 2},
        width_m=width_m)

    checked_files = [model_path, inp_path, source / "水源设置说明.txt", *point_dbfs, shape_dir / "管线.dbf"]
    file_hashes = [{"path": str(path.relative_to(source)).replace("\\", "/"),
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in checked_files]
    summary = {"nodes": 102, "pipes": 100, "zones": 4, "sources": 2,
               "sourceIds": list(reservoirs), "components": 2, "totalLengthM": total_length,
               "assignedNodes": len(assigned_nodes), "assignedPipes": len(assigned_pipes),
               "sharedNodes": len(shared_nodes), "sharedPipes": len(shared_pipes),
               "sharedLengthM": sum(by_pipe[pid]["length_m"] for pid in shared_pipes),
               "userNodes": sum(n["type"] == "user" for n in nodes), "targetBuildingNodes": 12,
               "unknownElevationNodes": sum(n["elevation"] is None for n in nodes),
               "hydraulicSimulationRun": False, "meterPlans": len(meter_plans), "actualMetersAdded": 0,
               "zonesDetail": [{"id": z["id"], "name": z["name"], "nodes": len(z["nodeIds"]),
                                "pipes": len(z["pipeIds"]), "lengthM": z["lengthM"]} for z in zones]}
    metadata = {"coordinateSystem": {"label": "原始测绘平面坐标（米），坐标系待确认", "crs": None,
                                      "units": "metre", "basemapAllowed": False},
                "displayTransform": {"width": 900, "height": 540, "scale": scale, "yFlipped": True,
                                     "centerX": (min_x + max_x) / 2, "centerY": (min_y + max_y) / 2},
                "bounds": {"minX": min_x, "minY": min_y, "maxX": max_x, "maxY": max_y},
                "sharedNodeIds": shared_nodes, "sharedPipeIds": [pipe_id(pid) for pid in shared_pipes],
                "sharedSourcePipeIds": shared_pipes, "sharedNote": "两处水源、上游公共管段及未指定归属的垃圾房/消防等支路保留为公共或待分配对象。",
                "boundaryMeterPlans": meter_plans, "dmaStatus": "假定分区，待现场确认",
                "boundaryValidation": boundary_validation,
                "boundaryGeneration": boundary_validation,
                "previousBoundaryByZone": previous_boundary_by_zone,
                "hydraulicStatus": "未计算；水源总水头与需水量仍为源文件占位值。",
                "idMapping": {"node": "原始点号不变", "pipe": "CAMPUS-P-前缀＋原始线号；sourceId保留原始线号", "reason": "原文件的数字点号与数字线号重名，界面要求对象ID全局唯一"},
                "notes": ["保持102个原始点及100条原始管段连接、坐标、管径、管长和材质。",
                          "各DMA同级、节点和管线不重复归属；边界入口管段归下游DMA，出口仅作为上游计量引用。",
                          "供水方向按两个源点的树形连接推定用于分区，非水力模拟结果或实际流向。",
                          "泵房为原始节点类型；原INP已把22、28两条泵连接转换为普通管段，本次未新增水力泵。",
                          "原Tag中的C01/C02是历史标签，连通分量以componentId及源点实际可达关系为准。"]}
    provenance = {"sourceDirectory": str(source), "inputFile": inp_path.name,
                  "attributeFile": "_work/model_final.json", "shapefileDirectory": shape_dir.name,
                  "importedAt": "2026-10-13", "files": file_hashes,
                  "checks": {"inpNodePipeIds": True, "inpConnections": True, "inpCoordinates": True,
                             "inpElevationsAndHeads": True, "inpChineseTags": True, "dbfPhysicalAttributes": True,
                             "sourceReachability": True, "dmaDisjointMembership": True,
                             "dmaBoundaries": True, "requestedBuildingsAssigned": True},
                  "sourceUntouched": True, "status": "原始拓扑已核对；DMA为假定方案"}
    snapshot = {"schema": "water-topology-v1", "sourceDataset": DATASET_ID,
                "sampleRevision": DATASET_ID, "displayScale": 1, "nodes": nodes, "pipes": pipes,
                "zones": zones, "metadata": metadata, "provenance": provenance}
    stamp_boundary_signatures(snapshot)
    dataset = {"id": DATASET_ID, "projectId": "PRJ-SH-CAMPUS", "topologyId": "T-SH-CAMPUS-20261013",
               "project": {"id": "PRJ-SH-CAMPUS", "name": "上海技术学院漏损控制项目", "province": "上海市",
                           "city": "上海市", "district": "待确认", "status": "建设中", "owner": "—", "updated": "2026-10-13"},
               "snapshot": snapshot, "provenance": provenance, "metadata": metadata, "summary": summary}
    return dataset


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--dma-width-m", type=float, default=10, help="DMA corridor total minimum width in metres (default: 10)")
    args = parser.parse_args()
    if not math.isfinite(args.dma_width_m) or args.dma_width_m <= 0:
        parser.error("--dma-width-m must be a positive finite number")
    data = build(args.source.resolve(), width_m=args.dma_width_m)
    output = APP / "data"
    output.mkdir(exist_ok=True)
    (output / "campus-topology.json").write_text(json.dumps(data["snapshot"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    (output / "campus-dataset.js").write_text(
        "/* Generated by tools/build-campus-dataset.py; INP and Shapefile DBF crosschecked. */\n"
        "(function(r){const d=" + text + ";r.CampusDataset=d;if(typeof module===\"object\"&&module.exports)module.exports=d;})(globalThis);\n",
        encoding="utf-8")
    print(json.dumps(data["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
