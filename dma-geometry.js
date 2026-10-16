/* Pure geometry for DMA envelopes; coordinates and areas use the topology's map units. */
(function(root,factory){
  'use strict';
  const api=factory();
  root.DMAGeometry=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis,function(){
  'use strict';
  const DEFAULT_AREA_TOLERANCE=1e-6;
  const COORDINATE_TOLERANCE=1e-9;
  // Bounded content-keyed caches tolerate editors mutating coordinates in place.
  // Public array results are copied below, so callers cannot poison cached data.
  const cacheLimit=96;
  function remember(cache,key,create){
    if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
    const value=create();cache.set(key,value);
    if(cache.size>cacheLimit)cache.delete(cache.keys().next().value);
    return value;
  }
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const point=value=>{
    const x=Array.isArray(value)?value[0]:value?.x,y=Array.isArray(value)?value[1]:value?.y;
    return typeof x==='number'&&typeof y==='number'&&Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
  };
  function unique(points){
    const result=[],seen=new Set();
    for(const value of points||[]){const p=point(value);if(!p)continue;const key=p.x+'|'+p.y;if(!seen.has(key)){seen.add(key);result.push(p);}}
    return result;
  }
  function polygonPoints(poly){
    if(!Array.isArray(poly))return [];
    const result=poly.map(point);if(result.some(p=>!p))return [];
    if(result.length>1&&result[0].x===result.at(-1).x&&result[0].y===result.at(-1).y)result.pop();
    return result;
  }
  const polygonKey=poly=>JSON.stringify(polygonPoints(poly));
  const clonePolygon=poly=>poly.map(p=>({...p}));
  function bounds(poly){
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const p of poly){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
    return {minX,minY,maxX,maxY};
  }
  const disjointBounds=(a,b)=>a.maxX<=b.minX||b.maxX<=a.minX||a.maxY<=b.minY||b.maxY<=a.minY;
  function pipeLine(pipe,nodes){
    const geometry=Array.isArray(pipe.geometry)?pipe.geometry:pipe.geometry?.coordinates;
    const points=[nodes.get(pipe.start)||pipe.a,...(Array.isArray(geometry)?geometry:[]),nodes.get(pipe.end)||pipe.b].map(point);
    return points.filter((p,i)=>!p||!i||!points[i-1]||p.x!==points[i-1].x||p.y!==points[i-1].y);
  }

  /**
   * Collect every finite member position, without changing the topology.
   * Includes member nodes, every vertex of each member pipe's geometry, and both
   * pipe endpoints. Connected node positions are authoritative; a/b are endpoint
   * fallbacks. Geometry can be an array of {x,y} / [x,y], or a LineString object.
   * Missing members are ignored here and remain the topology validator's concern.
   * @returns {{x:number,y:number}[]} Unique coordinates, including polyline bends.
   */
  function pointsForZone(data,zone){
    const nodes=new Map((data?.nodes||[]).map(n=>[n.id,n]));
    const pipes=new Map((data?.pipes||[]).map(p=>[p.id,p]));
    const points=(zone?.nodeIds||[]).map(id=>nodes.get(id));
    for(const id of zone?.pipeIds||[]){
      const p=pipes.get(id);if(!p)continue;
      points.push(nodes.get(p.start)||p.a,nodes.get(p.end)||p.b);
      const geometry=Array.isArray(p.geometry)?p.geometry:p.geometry?.coordinates;
      if(Array.isArray(geometry))points.push(...geometry);
    }
    return unique(points);
  }

  /** Counterclockwise convex hull with no repeated closing vertex; collinear input returns its two extrema. */
  function hull(points){
    const sorted=unique(points).sort((a,b)=>a.x-b.x||a.y-b.y);
    if(sorted.length<3)return sorted;
    const lower=[],upper=[];
    for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
    for(let i=sorted.length-1;i>=0;i--){const p=sorted[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
    return lower.slice(0,-1).concat(upper.slice(0,-1));
  }

  /**
   * Minimum-area oriented rectangle enclosing every input point. At an optimum,
   * one rectangle edge is parallel to a hull edge; all such orientations are
   * tested, in O(h²) time for h hull vertices. Tied orientations use the first
   * hull edge deterministically. Projection uses a local origin for stability.
   * No visual padding, shrinkage, or point exclusion is applied.
   * @returns {{x:number,y:number}[]} Four CCW corners; 0/1/2 points for degenerate input.
   */
  function minRectangle(points){
    const boundary=hull(points);
    if(boundary.length<3)return boundary;
    const origin=boundary[0];let best=null;
    for(let i=0;i<boundary.length;i++){
      const a=boundary[i],b=boundary[(i+1)%boundary.length],dx=b.x-a.x,dy=b.y-a.y;
      const length=Math.hypot(dx,dy);if(!length)continue;
      const ux=dx/length,uy=dy/length,vx=-uy,vy=ux;
      let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
      for(const p of boundary){
        const x=p.x-origin.x,y=p.y-origin.y,u=x*ux+y*uy,v=x*vx+y*vy;
        minU=Math.min(minU,u);maxU=Math.max(maxU,u);minV=Math.min(minV,v);maxV=Math.max(maxV,v);
      }
      const area=(maxU-minU)*(maxV-minV);
      const roundoff=best?32*Number.EPSILON*Math.max(1,area,best.area):0;
      if(best&&area>=best.area-roundoff)continue;
      const restore=(u,v)=>({x:origin.x+u*ux+v*vx,y:origin.y+u*uy+v*vy});
      best={area,points:[restore(minU,minV),restore(maxU,minV),restore(maxU,maxV),restore(minU,maxV)]};
    }
    return best?.points||boundary;
  }

  /** Signed area using a translated origin, avoiding cancellation at large global coordinates. */
  function signedArea(poly){
    if(poly.length<3)return 0;
    let twice=0;
    for(let i=1;i<poly.length-1;i++)twice+=cross(poly[0],poly[i],poly[i+1]);
    return twice/2;
  }
  /** Absolute polygon area in squared coordinate units; point/line inputs have zero area. */
  function polygonArea(poly){return Math.abs(signedArea(polygonPoints(poly)));}
  function ccw(poly){const result=polygonPoints(poly);return signedArea(result)<0?result.reverse():result;}

  function onSegment(p,a,b,tolerance=COORDINATE_TOLERANCE){
    if(p.x<Math.min(a.x,b.x)-tolerance||p.x>Math.max(a.x,b.x)+tolerance||p.y<Math.min(a.y,b.y)-tolerance||p.y>Math.max(a.y,b.y)+tolerance)return false;
    const length=Math.hypot(b.x-a.x,b.y-a.y);
    if(!length)return Math.hypot(p.x-a.x,p.y-a.y)<=tolerance;
    return Math.abs(cross(a,b,p))<=tolerance*length;
  }
  function segmentsIntersect(a,b,c,d){
    if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)||Math.max(a.y,b.y)<Math.min(c.y,d.y)||Math.max(c.y,d.y)<Math.min(a.y,b.y))return false;
    // Validity uses the actual represented segments: containment's permissive
    // boundary tolerance must not turn a tiny positive gap into a self-touch.
    if(onSegment(a,c,d,0)||onSegment(b,c,d,0)||onSegment(c,a,b,0)||onSegment(d,a,b,0))return true;
    return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0;
  }
  /** True for a finite, nondegenerate simple polygon; rejects self-touching/crossing boundaries. */
  function isSimplePolygon(poly){
    const p=polygonPoints(poly);if(p.length<3||polygonArea(p)===0)return false;
    for(let i=0;i<p.length;i++){
      const a=p[i],b=p[(i+1)%p.length],previous=p[(i+p.length-1)%p.length];
      if(a.x===b.x&&a.y===b.y)return false;
      if(cross(previous,a,b)===0&&(previous.x-a.x)*(b.x-a.x)+(previous.y-a.y)*(b.y-a.y)>0)return false;
      for(let j=i+1;j<p.length;j++){
        if(j===i+1||(i===0&&j===p.length-1))continue;
        if(segmentsIntersect(a,b,p[j],p[(j+1)%p.length]))return false;
      }
    }
    return true;
  }
  /** Boundary-inclusive point containment for a simple polygon, including concave boundaries. */
  function pointInPolygon(value,poly){
    const p=point(value),boundary=polygonPoints(poly);if(!p||boundary.length<3)return false;
    let inside=false;
    for(let i=0,j=boundary.length-1;i<boundary.length;j=i++){
      const a=boundary[j],b=boundary[i];
      if(onSegment(p,a,b))return true;
      if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }
    return inside;
  }
  /**
   * Checks every vertex and full segment, not only endpoints. Segments are split
   * at every polygon-edge crossing and tested between intersections, detecting
   * an exit/re-entry across a concavity. Contact with the boundary is allowed.
   */
  function containsPolyline(poly,line){
    const boundary=polygonPoints(poly),points=(line||[]).map(point);
    if(boundary.length<3||!points.length||points.some(p=>!p||!pointInPolygon(p,boundary)))return false;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy,cuts=[0,1];
      if(!length2)continue;
      for(let j=0;j<boundary.length;j++){
        const c=boundary[j],d=boundary[(j+1)%boundary.length],ex=d.x-c.x,ey=d.y-c.y,den=dx*ey-dy*ex;
        if(den!==0){
          const t=((c.x-a.x)*ey-(c.y-a.y)*ex)/den,u=((c.x-a.x)*dy-(c.y-a.y)*dx)/den;
          if(t>=0&&t<=1&&u>=0&&u<=1)cuts.push(t);
        }else if(onSegment(c,a,b)||onSegment(d,a,b)){
          for(const p of [c,d]){const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/length2;if(t>0&&t<1)cuts.push(t);}
        }
      }
      cuts.sort((a,b)=>a-b);
      for(let j=1;j<cuts.length;j++){
        const t=(cuts[j-1]+cuts[j])/2;
        if(!pointInPolygon({x:a.x+dx*t,y:a.y+dy*t},boundary))return false;
      }
    }
    return true;
  }
  /** Checks all member nodes and complete member pipe paths; missing members fail containment. */
  function containsZone(data,zone,poly){
    const nodes=new Map((data?.nodes||[]).map(n=>[n.id,n])),pipes=new Map((data?.pipes||[]).map(p=>[p.id,p]));
    if(!(zone?.nodeIds?.length||zone?.pipeIds?.length))return false;
    for(const id of zone.nodeIds||[])if(!pointInPolygon(nodes.get(id),poly))return false;
    for(const id of zone.pipeIds||[]){const p=pipes.get(id);if(!p||!containsPolyline(poly,pipeLine(p,nodes)))return false;}
    return true;
  }
  /** Ear-clipping triangulation of a simple polygon. Returned triangles preserve the original area. */
  function triangulate(poly){
    if(!isSimplePolygon(poly))return [];
    const p=ccw(poly),triangles=[];
    // Exact collinear intermediate vertices do not affect the represented area.
    for(let i=0;p.length>3&&i<p.length;){
      const before=p[(i+p.length-1)%p.length],after=p[(i+1)%p.length];
      if(cross(before,p[i],after)===0){p.splice(i,1);i=0;}else i++;
    }
    while(p.length>3){
      let found=false;
      for(let i=0;i<p.length;i++){
        const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length];
        if(cross(a,b,c)<=0)continue;
        const blocked=p.some((q,j)=>j!==i&&j!==(i+p.length-1)%p.length&&j!==(i+1)%p.length&&cross(a,b,q)>=0&&cross(b,c,q)>=0&&cross(c,a,q)>=0);
        if(blocked)continue;
        triangles.push([a,b,c]);p.splice(i,1);found=true;break;
      }
      if(!found)throw Error('分区多边形无法稳定三角剖分，请检查近重合边或顶点');
    }
    if(p.length===3)triangles.push(p);
    return triangles;
  }

  // SAT rejects disjoint/touching convex polygons before the clipping work.
  function separated(a,b){
    for(const poly of [a,b])for(let i=0;i<poly.length;i++){
      const p=poly[i],q=poly[(i+1)%poly.length],dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy);
      if(!length)continue;
      const nx=-dy/length,ny=dx/length;
      let aMin=Infinity,aMax=-Infinity,bMin=Infinity,bMax=-Infinity;
      for(const r of a){const value=(r.x-p.x)*nx+(r.y-p.y)*ny;aMin=Math.min(aMin,value);aMax=Math.max(aMax,value);}
      for(const r of b){const value=(r.x-p.x)*nx+(r.y-p.y)*ny;bMin=Math.min(bMin,value);bMax=Math.max(bMax,value);}
      if(aMax<=bMin||bMax<=aMin)return true;
    }
    return false;
  }

  /**
   * Intersection of two convex polygons (e.g. minRectangle results), using SAT
   * and Sutherland-Hodgman clipping. Either winding order is accepted. Inputs
   * must describe convex boundaries in perimeter order, not arbitrary point sets.
   * Touching edges/points and degenerate polygons return an empty array.
   */
  function intersectionPolygon(first,second){
    let subject=ccw(first);const clip=ccw(second);
    if(subject.length<3||clip.length<3||!polygonArea(subject)||!polygonArea(clip)||separated(subject,clip))return [];
    for(let i=0;i<clip.length&&subject.length;i++){
      const a=clip[i],b=clip[(i+1)%clip.length],output=[];
      let previous=subject.at(-1),previousDistance=cross(a,b,previous);
      for(const current of subject){
        const distance=cross(a,b,current),inside=distance>=0,previousInside=previousDistance>=0;
        if(inside!==previousInside){
          const t=Math.max(0,Math.min(1,previousDistance/(previousDistance-distance)));
          output.push({x:previous.x+(current.x-previous.x)*t,y:previous.y+(current.y-previous.y)*t});
        }
        if(inside)output.push(current);
        previous=current;previousDistance=distance;
      }
      subject=unique(output);
    }
    return polygonArea(subject)>0?subject:[];
  }
  /** Intersection area for simple convex or concave polygons; touching alone has zero area. */
  function intersectionArea(a,b){
    if(disjointBounds(bounds(polygonPoints(a)),bounds(polygonPoints(b))))return 0;
    const first=triangulate(a).map(points=>({points,bounds:bounds(points)})),second=triangulate(b).map(points=>({points,bounds:bounds(points)}));let area=0;
    for(const x of first)for(const y of second)if(!disjointBounds(x.bounds,y.bounds))area+=polygonArea(intersectionPolygon(x.points,y.points));
    return area;
  }
  /** Positive-area overlap above the area tolerance (default 1e-6); boundary contact is allowed. */
  function overlap(a,b,areaTolerance=DEFAULT_AREA_TOLERANCE){
    if(!Number.isFinite(areaTolerance)||areaTolerance<0)throw Error('面积容差必须为非负有限数');
    return intersectionArea(a,b)>areaTolerance;
  }
  /** Four-corner envelope for a zone, or fewer corners if all its member positions are degenerate. */
  function zoneRectangle(data,zone){return minRectangle(pointsForZone(data,zone));}
  /**
   * Stable geometry/member signature. Stamp after assigning boundary geometry.
   * Includes sorted member IDs, node coordinates, each pipe's connected/fallback
   * endpoints and every polyline vertex. It deliberately excludes boundary data.
   */
  function boundarySignature(data,zone){
    const nodes=new Map((data?.nodes||[]).map(n=>[n.id,n])),pipes=new Map((data?.pipes||[]).map(p=>[p.id,p]));
    return JSON.stringify({nodes:[...(zone?.nodeIds||[])].sort().map(id=>[id,point(nodes.get(id))]),pipes:[...(zone?.pipeIds||[])].sort().map(id=>{const p=pipes.get(id);return p?[id,p.start,p.end,pipeLine(p,nodes)]:[id,null];})});
  }
  /**
   * Uses an explicit simple boundary only if its saved signature is current and
   * it encloses all complete member paths. Otherwise falls back to the members'
   * convex hull; validateZones reports the rejected saved boundary separately.
   */
  function zonePolygon(data,zone){
    if(zone?.boundary&&zone.boundarySignature===boundarySignature(data,zone)&&isSimplePolygon(zone.boundary)&&containsZone(data,zone,zone.boundary))return ccw(zone.boundary);
    return hull(pointsForZone(data,zone));
  }
  /** A label anchor inside the polygon, including concave envelopes. */
  function labelPoint(poly){
    if(!poly?.length)return {x:0,y:0};
    const triangles=triangulate(poly);
    if(!triangles.length)return {...poly[0]};
    const triangle=triangles.reduce((best,t)=>polygonArea(t)>polygonArea(best)?t:best,triangles[0]);
    return {x:triangle.reduce((sum,p)=>sum+p.x,0)/3,y:triangle.reduce((sum,p)=>sum+p.y,0)/3};
  }
  /** Pairwise conflicts without changing members or trimming any envelope. */
  function findOverlaps(data,zones=data?.zones||[],areaTolerance=DEFAULT_AREA_TOLERANCE){
    if(!Number.isFinite(areaTolerance)||areaTolerance<0)throw Error('面积容差必须为非负有限数');
    const polygons=zones.map(zone=>({id:zone.id,points:zonePolygon(data,zone)})),conflicts=[];
    for(let i=0;i<polygons.length;i++)for(let j=i+1;j<polygons.length;j++){
      const area=intersectionArea(polygons[i].points,polygons[j].points);
      if(area>areaTolerance)conflicts.push({a:polygons[i].id,b:polygons[j].id,area});
    }
    return conflicts;
  }
  /** Read-only validation; stale/invalid boundaries remain visible as issues even when a fallback renders. */
  function validateZones(data,zones=data?.zones||[],areaTolerance=DEFAULT_AREA_TOLERANCE){
    const issues=[];
    for(const zone of zones){
      const add=(type,message)=>issues.push({type,zoneId:zone.id,message});
      if(zone.boundary){
        if(zone.boundarySignature!==boundarySignature(data,zone))add('stale-boundary','成员或坐标已变化，分区边界需重新确认');
        if(!isSimplePolygon(zone.boundary))add('invalid-boundary','分区边界必须是无自交的有效多边形');
        else if(!containsZone(data,zone,zone.boundary))add('outside-boundary','分区边界未完整包含成员节点或管道');
      }
      const poly=zonePolygon(data,zone);
      if(!isSimplePolygon(poly))add('degenerate','成员不足以形成有效分区面');
      else if(!containsZone(data,zone,poly))add('outside-boundary','分区成员缺失或完整管道未被边界包含');
    }
    for(const conflict of findOverlaps(data,zones,areaTolerance))issues.push({type:'overlap',zoneId:conflict.a,otherZoneId:conflict.b,area:conflict.area,message:'分区面存在面积重叠'});
    return issues;
  }
  // Coordinates are serialized on every call; reference identity alone is never
  // trusted. Keys include both the current members/geometry and saved boundary
  // signature, so edits immediately invalidate containment and rendered polygons.
  const simpleCache=new Map(),triangleCache=new Map(),areaCache=new Map(),containmentCache=new Map(),zoneCache=new Map();
  const simpleImplementation=isSimplePolygon,triangulateImplementation=triangulate,intersectionImplementation=intersectionArea,containsImplementation=containsZone,zoneImplementation=zonePolygon;
  isSimplePolygon=function(poly){return remember(simpleCache,polygonKey(poly),()=>simpleImplementation(poly));};
  triangulate=function(poly){return remember(triangleCache,polygonKey(poly),()=>triangulateImplementation(poly)).map(clonePolygon);};
  intersectionArea=function(a,b){
    const keys=[polygonKey(a),polygonKey(b)].sort();
    return remember(areaCache,JSON.stringify(keys),()=>intersectionImplementation(a,b));
  };
  containsZone=function(data,zone,poly){return remember(containmentCache,JSON.stringify([boundarySignature(data,zone),polygonKey(poly)]),()=>containsImplementation(data,zone,poly));};
  zonePolygon=function(data,zone){
    const key=JSON.stringify([boundarySignature(data,zone),!!zone?.boundary,zone?.boundarySignature,polygonKey(zone?.boundary)]);
    return clonePolygon(remember(zoneCache,key,()=>zoneImplementation(data,zone)));
  };
  return {DEFAULT_AREA_TOLERANCE,pointsForZone,hull,minRectangle,polygonArea,intersectionPolygon,intersectionArea,overlap,zoneRectangle,findOverlaps,boundarySignature,zonePolygon,pointInPolygon,containsPolyline,containsZone,isSimplePolygon,triangulate,validateZones,labelPoint};
});
