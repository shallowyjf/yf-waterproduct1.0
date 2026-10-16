/* City-scale demonstration network. Coordinates are schematic, not surveyed GIS. */
(() => {
  function cityTopology() {
    const data={schema:"water-topology-v1",sampleRevision:"city-20260910",nodes:[],pipes:[],zones:[]};
    const byId=new Map();let serial=0,valves=0;
    const node=(id,type,name,x,y,diameter=null)=>{
      const n={id,type,name,x,y,elevation:+(32+x*0.006+y*0.003).toFixed(2),diameter};
      data.nodes.push(n);byId.set(id,n);return n;
    };
    const pipe=(a,b,diameter,name)=>{
      const p={id:`CITY-P-${String(++serial).padStart(3,"0")}`,type:"pipe",name,start:a.id,end:b.id,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},diameter,material:diameter>=1000?"钢管":"球墨铸铁",length:+(Math.hypot(a.x-b.x,a.y-b.y)*12).toFixed(1),startElevation:a.elevation,endElevation:b.elevation};
      data.pipes.push(p);return p;
    };
    const gated=(a,b,d,name)=>{const v=node(`CITY-V-${String(++valves).padStart(3,"0")}`,"valve",`${name}阀`,+(a.x+(b.x-a.x)*0.32).toFixed(1),+(a.y+(b.y-a.y)*0.32).toFixed(1),d);pipe(a,v,d,name);pipe(v,b,d,name);return v;};
    const xs=[145,235,328,421,518,619,721,810],ys=[84,158,240,323,408,482];
    const roadNames=["北环路","科创大道","中心大道","人民路","南城大道","南环路"];
    const avenueNames=["西环路","建设路","文教路","中轴大道","商贸路","东城大道","滨江路","东环路"];
    const hd=[800,600,1000,600,800,800],vd=[800,600,600,1000,600,1000,600,800];
    const grid=ys.map((y,r)=>xs.map((x,c)=>node(`CITY-J-${r+1}${c+1}`,"node",`${roadNames[r]} / ${avenueNames[c]}`,x+(r===1?8:r===4?-7:0),y+(c===2?-8:c===6?9:0))));
    // East-west transmission corridors and district loops, with inline isolation valves.
    for(let r=0;r<6;r++)for(let c=0;c<7;c++)gated(grid[r][c],grid[r][c+1],hd[r],roadNames[r]);
    // North-south ties create many real graph cycles rather than drawn crossings.
    for(let c=0;c<8;c++)for(let r=0;r<5;r++) {
      if((c===2&&r===1)||(c===4&&r===3)||(c===6&&r===2))continue;
      if([0,3,5,7].includes(c)&&[1,3].includes(r))gated(grid[r][c],grid[r+1][c],vd[c],avenueNames[c]);
      else pipe(grid[r][c],grid[r+1][c],vd[c],avenueNames[c]);
    }
    // Three treatment works feed the meshed network through booster stations.
    const sources=[
      ["WEST","城西水厂",36,235,"城西加压泵站",86,240,grid[2][0],1000],
      ["NORTH","城北水厂",426,22,"城北加压泵站",421,52,grid[0][3],1000],
      ["EAST","城东水厂",878,350,"城东加压泵站",849,323,grid[3][7],800]
    ];
    sources.forEach(([id,name,x,y,pumpName,px,py,target,d])=>{const plant=node(`CITY-W-${id}`,"plant",name,x,y,d),pump=node(`CITY-B-${id}`,"pump",pumpName,px,py,d);pipe(plant,pump,d,`${name}出厂管`);pipe(pump,target,d,`${pumpName}输水干管`);});
    // Peripheral branches end in district delivery points, not arbitrary dangling geometry.
    const branches=[
      [0,0,105,45,"西北物流园"],[0,2,324,39,"北城居住区"],[0,5,619,40,"科创产业园"],[0,7,828,40,"东北工业园"],
      [1,0,88,153,"城西高区"],[3,0,84,321,"西城居住区"],[4,0,84,410,"西南片区"],
      [1,7,869,161,"滨江北区"],[2,7,871,240,"东城新城"],[4,7,866,426,"滨江南区"],
      [5,1,228,524,"南城居住区"],[5,4,511,524,"南部产业园"],[5,6,721,526,"东南片区"]
    ];
    branches.forEach(([r,c,x,y,name],i)=>{const a=grid[r][c],v=node(`CITY-BV-${i+1}`,"valve",`${name}边界阀`,+(a.x+(x-a.x)*0.55).toFixed(1),+(a.y+(y-a.y)*0.55).toFixed(1),400),u=node(`CITY-U-${i+1}`,"user",name,x,y);pipe(a,v,400,`${name}配水支管`);pipe(v,u,400,`${name}接入管`);});
    // Deliberate, small data-quality cases remain grounded in this same network.
    const end=node("CITY-END-01","node","科创园预留节点",578,122);
    const dangling=pipe(grid[1][4],end,300,"科创园预留支管");dangling.end="";dangling.b={x:558,y:130};
    const anomalyValve=byId.get("CITY-V-024");
    const anomalyPipe=data.pipes.find(p=>p.start===anomalyValve.id);anomalyPipe.diameter=800;
    byId.get("CITY-B-EAST").diameter=600;
    const slope=data.pipes.find(p=>p.name==="滨江南区接入管");slope.length=120;slope.endElevation=slope.startElevation-8.4;
    const islands=[[[43,61],[83,64],[76,97]],[[54,465],[89,480],[71,513]]];
    islands.forEach((points,i)=>{const ns=points.map(([x,y],j)=>node(`CITY-I-${i+1}${j+1}`,"node",`${i?"待接入管段":"旧城独立管段"}-${j+1}`,x,y));pipe(ns[0],ns[1],300,i?"待接入管段":"旧城独立管段");pipe(ns[1],ns[2],300,i?"待接入管段":"旧城独立管段");if(!i)pipe(ns[2],ns[0],300,"旧城独立管段");});
    // Demonstration DMA memberships use only fully contained pipe geometry.
    const districts=[['N','城北供水区',120,65,835,200],['CW','中心西区',120,201,465,367],['CE','中心东区',466,201,835,367],['S','城南供水区',120,368,835,535]];
    for(const [id,name,x0,y0,x1,y1] of districts){const within=n=>n.x>=x0&&n.x<=x1&&n.y>=y0&&n.y<=y1;data.zones.push({id:`CITY-DMA-${id}`,type:"zone",name,parent:"",nodeIds:data.nodes.filter(within).map(n=>n.id),pipeIds:data.pipes.filter(p=>within(byId.get(p.start)||p.a)&&within(byId.get(p.end)||p.b)).map(p=>p.id)});}
    return data;
  }
  window.createCityTopology=cityTopology;
  window.repairTopologyConnections=function(source){
    const data=JSON.parse(JSON.stringify(source)),nodes=new Map(data.nodes.map(n=>[n.id,n]));
    if(!nodes.size)return data;
    let serial=1;
    const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
    for(const p of data.pipes)for(const [field,pos] of [['start','a'],['end','b']])if(!nodes.has(p[field])){
      const preferred=p.id==='CITY-P-162'&&field==='end'?nodes.get('CITY-END-01'):null;
      const point=p[pos]||nodes.get(p[field==='start'?'end':'start'])||data.nodes[0];
      const target=preferred||data.nodes.filter(n=>n.id!==p[field==='start'?'end':'start']).sort((a,b)=>distance(a,point)-distance(b,point))[0]||data.nodes[0];
      p[field]=target.id;p[pos]={x:target.x,y:target.y};
    }
    const adjacency=new Map(data.nodes.map(n=>[n.id,[]]));
    data.pipes.forEach(p=>{adjacency.get(p.start).push(p.end);adjacency.get(p.end).push(p.start);});
    const seen=new Set(),components=[];
    for(const n of data.nodes)if(!seen.has(n.id)){const queue=[n.id],group=[];seen.add(n.id);while(queue.length){const id=queue.pop();group.push(nodes.get(id));for(const next of adjacency.get(id))if(!seen.has(next)){seen.add(next);queue.push(next);}}components.push(group);}
    components.sort((a,b)=>b.length-a.length);const main=components.shift();
    for(const group of components){let pair,best=Infinity;for(const a of main)for(const b of group){const d=distance(a,b);if(d<best){best=d;pair=[a,b];}}
      const [a,b]=pair;let id;do{id='REPAIR-P-'+String(serial++).padStart(3,'0');}while(data.pipes.some(p=>p.id===id));
      data.pipes.push({id,type:'pipe',name:'连通修复联络管',start:a.id,end:b.id,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},diameter:300,length:+(best*8).toFixed(1),material:'球墨铸铁',startElevation:a.elevation||0,endElevation:b.elevation||0});
      main.push(...group);
    }
    return data;
  };
  window.normalizeTopologyTerminals=function(source){
    const data=JSON.parse(JSON.stringify(source));
    const unique=prefix=>{let i=1;while([...data.nodes,...data.pipes].some(o=>o.id===prefix+i))i++;return prefix+i;};
    for(const n of [...data.nodes]){
      const linked=data.pipes.filter(p=>p.start===n.id||p.end===n.id);
      if(['user','cap'].includes(n.type)&&linked.length>1){
        const tee={...n,id:unique('TEE-'),type:'node',name:n.name+'接入节点',diameter:null};data.nodes.push(tee);
        linked.forEach(p=>{if(p.start===n.id)p.start=tee.id;if(p.end===n.id)p.end=tee.id;});
        n.x=Math.max(12,Math.min(888,n.x+18));n.y=Math.max(12,Math.min(528,n.y+18));
        const branch={id:unique('SERVICE-'),type:'pipe',name:n.name+'接入支管',start:tee.id,end:n.id,a:{x:tee.x,y:tee.y},b:{x:n.x,y:n.y},diameter:n.diameter||linked[0].diameter,material:'球墨铸铁',length:+(Math.hypot(n.x-tee.x,n.y-tee.y)*12).toFixed(1),startElevation:n.elevation,endElevation:n.elevation};data.pipes.push(branch);
        data.zones.filter(z=>z.nodeIds.includes(n.id)).forEach(z=>{z.nodeIds.push(tee.id);z.pipeIds.push(branch.id);});
      }else if(n.type==='node'&&linked.length===1){n.type='cap';n.name=n.name+'堵头';n.diameter=linked[0].diameter;}
      else if(n.type==='valve'&&linked.length===1){
        const cap={...n,id:unique('CAP-'),type:'cap',name:n.name+'末端堵头',x:n.x+12,diameter:linked[0].diameter};data.nodes.push(cap);
        const branch={id:unique('CAP-PIPE-'),type:'pipe',name:cap.name+'管段',start:n.id,end:cap.id,a:{x:n.x,y:n.y},b:{x:cap.x,y:cap.y},diameter:cap.diameter,material:'球墨铸铁',length:144,startElevation:n.elevation,endElevation:n.elevation};data.pipes.push(branch);
        data.zones.filter(z=>z.nodeIds.includes(n.id)).forEach(z=>{z.nodeIds.push(cap.id);z.pipeIds.push(branch.id);});
      }
    }
    return data;
  };
  window.addNorthwestUsers=function(source){
    const data=JSON.parse(JSON.stringify(source));
    for(const [hostId,id,name,x,y] of [['CITY-I-11','CITY-U-NW-1','西北仓储区用户',20,40],['CITY-I-13','CITY-U-NW-2','西北配套区用户',40,118]]){
      const host=data.nodes.find(n=>n.id===hostId);if(!host||data.nodes.some(n=>n.id===id))continue;
      const user={id,type:'user',name,x,y,elevation:host.elevation,diameter:null};
      const pipe={id:id+'-PIPE',type:'pipe',name:name+'接入支管',start:host.id,end:id,a:{x:host.x,y:host.y},b:{x,y},diameter:300,material:'球墨铸铁',length:+(Math.hypot(x-host.x,y-host.y)*12).toFixed(1),startElevation:host.elevation,endElevation:user.elevation};
      data.nodes.push(user);data.pipes.push(pipe);
      data.zones.filter(z=>z.nodeIds.includes(host.id)).forEach(z=>{z.nodeIds.push(id);z.pipeIds.push(pipe.id);});
    }
    return data;
  };
  window.addInteriorUsers=function(source){
    const data=JSON.parse(JSON.stringify(source));
    const roads={'科创大道':300,'人民路':250,'建设路':200,'文教路':300,'商贸路':250,'滨江路':300};
    const sizes=[80,100,150,200,250,300];
    for(const p of data.pipes){
      if(roads[p.name])p.diameter=roads[p.name];
      const branch=p.name.match(/^(.*)(配水支管|接入管)$/);
      if(branch){const user=data.nodes.find(n=>n.type==='user'&&/^CITY-U-\d+$/.test(n.id)&&n.name===branch[1]);if(user){p.diameter=sizes[(Number(user.id.slice(7))-1)%sizes.length];}}
    }
    const names=['文教新村','科创公寓','商贸中心','滨江社区','中心医院','市民服务中心','东城学校','中心花园','南城公寓','文化中心','体育中心','南苑社区'];
    let index=0;
    for(const row of [2,3,4])for(const col of [2,3,5,6]){
      const i=index++,host=data.nodes.find(n=>n.id===`CITY-J-${row}${col}`),id=`CITY-U-IN-${i+1}`;
      if(!host||data.nodes.some(n=>n.id===id))continue;
      const diameter=sizes[i%sizes.length],name=names[i];
      const valve={id:id+'-V',type:'valve',name:name+'接入阀',x:host.x+16,y:host.y+16,elevation:host.elevation,diameter};
      const user={id,type:'user',name,x:host.x+34,y:host.y+34,elevation:host.elevation,diameter};
      data.nodes.push(valve,user);
      const pipes=[[host,valve],[valve,user]].map(([a,b],j)=>({id:id+'-P'+(j+1),type:'pipe',name:name+(j?'接入管':'配水支管'),start:a.id,end:b.id,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},diameter,material:diameter<150?'PE':'球墨铸铁',length:+(Math.hypot(a.x-b.x,a.y-b.y)*12).toFixed(1),startElevation:a.elevation,endElevation:b.elevation}));
      data.pipes.push(...pipes);
      data.zones.filter(z=>z.nodeIds.includes(host.id)).forEach(z=>{z.nodeIds.push(valve.id,user.id);z.pipeIds.push(...pipes.map(p=>p.id));});
    }
    for(const n of data.nodes.filter(n=>['valve','user','cap'].includes(n.type))){const linked=data.pipes.filter(p=>p.start===n.id||p.end===n.id);if(linked.length&&linked.every(p=>p.diameter===linked[0].diameter))n.diameter=linked[0].diameter;}
    data.sampleRevision='city-interior-users-20260914';
    return data;
  };
  window.repairLogisticsBranch=function(source){
    const data=JSON.parse(JSON.stringify(source)),user=data.nodes.find(n=>n.id==='CITY-U-1'),main=data.nodes.find(n=>n.id==='CITY-J-11');
    if(!user||!main)return data;
    const service=data.pipes.find(p=>p.end===user.id&&p.id.startsWith('SERVICE-'));
    const tee=service&&data.nodes.find(n=>n.id===service.start&&n.id.startsWith('TEE-'));
    if(!tee)return data;
    const tie=data.pipes.find(p=>p.id==='REPAIR-P-001'&&p.start===tee.id);
    const inlet=data.pipes.find(p=>p.id==='CITY-P-137'&&p.end===tee.id);
    if(!tie||!inlet)return data;
    user.x=tee.x;user.y=tee.y;inlet.end=user.id;
    tie.start=main.id;tie.a={x:main.x,y:main.y};tie.startElevation=main.elevation;
    const end=data.nodes.find(n=>n.id===tie.end);tie.length=+(Math.hypot(main.x-end.x,main.y-end.y)*12).toFixed(1);
    data.pipes=data.pipes.filter(p=>p.id!==service.id);data.nodes=data.nodes.filter(n=>n.id!==tee.id);
    data.zones.forEach(z=>{z.nodeIds=z.nodeIds.filter(id=>id!==tee.id);z.pipeIds=z.pipeIds.filter(id=>id!==service.id);});
    return data;
  };
})();
