/* Monthly DMA quantities and 02:00–05:00 flow statistics, Beijing time. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./standard-product.js'));else root.DMAStatistics=factory(root.WaterStandard);})(typeof window==='object'?window:globalThis,function(S){
  'use strict';
  const valid=v=>v!==''&&v!=null&&Number.isFinite(Number(v));
  const shift=(month,n)=>{const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7);};
  const previous=(now=Date.now())=>shift(new Date(now+8*3600000).toISOString().slice(0,7),-1);
  const days=month=>{const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate();};
  function night(samples){
    const byTime=new Map();for(const s of samples||[]){const t=Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s.time)?s.time:s.time.replace(' ','T')+'+08:00');if(!Number.isFinite(t))continue;const d=new Date(t+8*3600000),h=d.getUTCHours();if(h>=2&&h<5)byTime.set(t,s);}
    const values=[...byTime.values()].filter(s=>['GOOD','PARTIAL'].includes(s.quality)&&valid(s.value)).map(s=>Number(s.value));return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  }
  function daily(db,version,zone,month){return (db.balances||[]).filter(r=>r.topology===version&&r.zoneId===zone&&r.date.slice(0,7)===month).sort((a,b)=>a.date.localeCompare(b.date)).map(r=>({...S.balance(r),night:night(r.nightSamples)}));}
  function monthly(db,version,zones,start,end){const result=[];for(let month=start;month<=end;month=shift(month,1)){for(const z of zones){const rows=daily(db,version,z.id,month),count=days(month),unique=new Set(rows.map(r=>r.date));const complete=rows.length===count&&unique.size===count;
    const totals={};for(const k of ['inlet','outlet','storage','billed','unbilled'])totals[k]=complete&&rows.every(r=>['GOOD','PARTIAL'].includes(r.quality)&&valid(r[k]))?rows.reduce((a,r)=>a+Number(r[k]),0):null;
    const b=S.balance(totals);
    result.push({...b,id:z.id+'|'+month,zoneId:z.id,zoneName:z.name,date:month,days:unique.size,totalDays:count});
  }}return result;}
  function seed(db,version,zones,now=Date.now()){
    const end=previous(now),marker=version+'|'+end;db.dmaMonthlyExamples||={};if(db.dmaMonthlyExamples[marker])return false;db.balances||=[];
    for(let month=shift(end,-2);month<=end;month=shift(month,1))for(const [i,z] of zones.entries())for(let d=1;d<=days(month);d++){
      const date=month+'-'+String(d).padStart(2,'0');if(db.balances.some(r=>r.topology===version&&r.zoneId===z.id&&r.date===date))continue;
      const inlet=+(1200+i*100+55*Math.sin(d/4+Number(month.slice(5)))).toFixed(3),outlet=200+i*12,storage=10,billed=+( (inlet-outlet-storage)*(0.88-i*.012)).toFixed(3);
      db.balances.push({id:'HZ-MON-'+version+'-'+z.id+'-'+date,topology:version,zoneId:z.id,zoneName:z.name,date,inlet,outlet,storage,billed,unbilled:20,quality:'GOOD',source:'杭州月度示例',nightSamples:[2,3,4].map(h=>({time:date+' '+String(h).padStart(2,'0')+':00:00',value:+(8+i*3+Math.sin(d/4)+h*.3).toFixed(3),quality:'GOOD'}))});
    }db.dmaMonthlyExamples[marker]=true;return true;
  }
  return {previous,shift,days,night,daily,monthly,seed};
});
