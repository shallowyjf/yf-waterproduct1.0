"""Narrow DMA corridors from the original physical pipe geometry (metres).

Shapely is loaded from the workspace-local build dependency directory. Install
with: python -m pip install --target .report-build/campus-deps shapely
"""
from __future__ import annotations

import math
from pathlib import Path
import sys


def create_corridor_boundaries(zones, nodes, pipes, transform, width_m=10):
    if not math.isfinite(width_m) or width_m <= 0:
        raise ValueError("DMA corridor width must be a positive finite number of metres")
    dependency_dir = Path(__file__).resolve().parents[2] / ".report-build/campus-deps"
    if dependency_dir.is_dir():
        sys.path.insert(0, str(dependency_dir))
    try:
        import shapely
        from shapely.geometry import LineString, Point, Polygon, box
        from shapely.ops import unary_union
    except ImportError as error:
        raise RuntimeError("Install local geometry dependencies: python -m pip install --target .report-build/campus-deps shapely") from error

    node_map, pipe_map = {n["id"]: n for n in nodes}, {p["id"]: p for p in pipes}
    # A polygonized circular cap would otherwise lie slightly inside the 5 m
    # circle between arc vertices. Circumscribe it instead, guaranteeing at
    # least width_m / 2 clearance before any documented common-junction split.
    arc_segments_per_quadrant = 8
    half_width = width_m / 2
    radius = half_width / math.cos(math.pi / (4 * arc_segments_per_quadrant))
    networks, point_sets, raw_corridors = {}, {}, {}
    for zone in zones:
        zid = zone["id"]
        lines = [LineString(pipe_map[pid]["sourceGeometry"]) for pid in zone["pipeIds"]]
        points = [Point(node_map[nid]["sourceX"], node_map[nid]["sourceY"]) for nid in zone["nodeIds"]]
        networks[zid], point_sets[zid] = unary_union(lines), unary_union(points)
        raw = unary_union(lines + points).buffer(radius, quad_segs=arc_segments_per_quadrant)
        assert raw.geom_type == "Polygon" and not raw.interiors, (zid, "Corridor has holes or multiple parts")
        assert raw.is_valid and raw.covers(networks[zid]) and raw.covers(point_sets[zid])
        raw_corridors[zid] = raw

    corridors = dict(raw_corridors)
    joint = node_map["2"]
    split_x = joint["sourceX"]
    overlap = corridors["DMA-03"].intersection(corridors["DMA-04"])
    extent = max(max(abs(v) for v in shape.bounds) for shape in corridors.values()) + width_m + 1000
    west, east = box(-extent, -extent, split_x, extent), box(split_x, -extent, extent, extent)
    # Pipe 28 starts at the canteen junction. All DMA-03 pipe centres are west
    # of it, and all DMA-04 pipe centres east. Divide only their buffer overlap;
    # retain each corridor's unaffected footprint and every original line.
    assert networks["DMA-03"].bounds[2] <= split_x + 1e-8
    assert networks["DMA-04"].bounds[0] >= split_x - 1e-8
    corridors["DMA-03"] = corridors["DMA-03"].difference(overlap.intersection(east))
    corridors["DMA-04"] = corridors["DMA-04"].difference(overlap.intersection(west))
    joint_exception = {
        "nodeId": "2", "name": "食堂直供 / 宿舍4、5、6入口共用节点",
        "zoneIds": ["DMA-03", "DMA-04"], "sourcePipeIds": ["2", "3", "28", "29"],
        "splitAxis": "sourceX", "splitValueM": split_x,
        "sourcePoint": [joint["sourceX"], joint["sourceY"]],
        "overlapBeforeSplitM2": overlap.area,
        "rule": "仅将共同入口附近相交的缓冲面按节点2的X坐标分开：西侧归DMA-03，东侧归DMA-04。",
        "widthException": f"共享节点附近按共同边界收口，局部不能同时保证两区中心线每侧{half_width:g}米；其余管段保证至少{half_width:g}米。",
        "intersectionBoundsM": list(overlap.bounds),
    }
    scale, cx, cy = transform["scale"], transform["centerX"], transform["centerY"]

    def display(x, y):
        mapped_x = 450 + (x - cx) * scale
        # Node/pipe display coordinates were rounded by the base importer.
        # Keep the common split exactly coincident with that displayed node;
        # its sub-micrometre source-rounding difference is not a pipe move.
        if abs(x - split_x) < 1e-8:
            mapped_x = joint["x"]
        return {"x": mapped_x, "y": 270 - (y - cy) * scale}

    previous_areas, corridor_areas, clipped_areas = {}, {}, {}
    for zone in zones:
        zid = zone["id"]
        # Boolean clipping can leave a double-precision backtracking spike with
        # sub-nanometre width. Remove only numerical slivers, not shape detail;
        # all original centres and complete pipes must still be covered below.
        shape = corridors[zid].simplify(1e-9, preserve_topology=True)
        corridors[zid] = shape
        assert shape.is_valid and shape.geom_type == "Polygon" and not shape.interiors, (zid, "Invalid corridor after split")
        assert shape.covers(networks[zid]) and shape.covers(point_sets[zid]), (zid, "A source member is outside its corridor")
        previous_areas[zid] = zone["boundaryAreaM2"]
        corridor_areas[zid] = shape.area
        clipped_areas[zid] = raw_corridors[zid].area - shape.area
        zone.update({
            "boundary": [display(x, y) for x, y in list(shape.exterior.coords)[:-1]],
            "boundaryMode": "pipe-corridor", "boundaryWidthM": width_m,
            "boundaryRevision": f"corridor-{width_m:g}m-v1", "boundaryAreaM2": shape.area,
            "boundaryPreviousAreaM2": previous_areas[zid],
            "boundaryAreaReductionPercent": (1 - shape.area / previous_areas[zid]) * 100,
            "boundaryWidthException": joint_exception if zid in ["DMA-03", "DMA-04"] else None,
            "boundaryNote": f"按原始管线和节点生成总宽至少{width_m:g}米的供水走廊（中心线每侧{half_width:g}米）；"
                            "以外接圆弧折线保留最小宽度，原始拓扑和分区成员不变。"
                            + ("与相邻区共用入口附近按共同边界收口，该局部不适用每侧最小宽度。" if zid in ["DMA-03", "DMA-04"] else ""),
        })
    pair_checks = []
    for index, zone in enumerate(zones):
        for other in zones[index + 1:]:
            area = corridors[zone["id"]].intersection(corridors[other["id"]]).area
            assert area < 1e-7, (zone["id"], other["id"], "Corridor overlap", area)
            pair_checks.append({"zoneIds": [zone["id"], other["id"]], "overlapAreaM2": 0})
    return {
        "mode": "pipe-corridor", "revision": f"corridor-{width_m:g}m-v1",
        "widthM": width_m, "halfWidthM": half_width, "bufferRadiusM": radius,
        "arcSegmentsPerQuadrant": arc_segments_per_quadrant,
        "precisionCleanupToleranceM": 1e-9,
        "widthPolicy": "正常走廊中心线每侧至少半宽；共用入口相交区域按共享边界收口，局部宽度例外明确记录。",
        "coordinateUnits": "metres", "engine": f"Shapely {shapely.__version__}",
        "membershipUnchanged": True, "allMemberNodesEnclosed": True,
        "allMemberPipeSegmentsEnclosed": True, "allSingleSimplePolygons": True, "holes": 0,
        "allowsBoundaryTouch": True, "pairChecks": pair_checks, "junctionClips": [joint_exception],
        "previousAreaM2ByZone": previous_areas, "areaM2ByZone": corridor_areas,
        "junctionClippedAreaM2ByZone": clipped_areas,
        "totalPreviousAreaM2": sum(previous_areas.values()), "totalAreaM2": sum(corridor_areas.values()),
    }
