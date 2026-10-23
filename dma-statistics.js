/* DMA quantities in m³; calendar boundaries use Beijing time (UTC+08:00).
 *
 * balances: one {topology,zoneId,date:'YYYY-MM-DD',inlet,outlet,quality} per day.
 * inlet/outlet sum ALL boundary meters' interval volumes. usage=inlet-outlet;
 * storage/unbilled are never deducted from usage. Legacy basis/loss/rate remain.
 *
 * hourlyBalances: one {topology,zoneId,time:'YYYY-MM-DD HH:00:00',inlet,outlet,
 * quality,source?} per hour. inlet/outlet are measured interval volumes, not
 * instantaneous flow or cumulative readings. Alternatively use inletStart/
 * inletEnd and outletStart/outletEnd readings at the exact hour boundaries.
 * hourly(start,end) includes full dates, or hour starts within datetime bounds.
 * Missing, duplicate or bad intervals stay null. No daily/monthly interpolation.
 *
 * revenueRecords: one {topology,zoneId,month:'YYYY-MM',quality:'GOOD',source?,
 * volume,meterCount?,expectedMeterCount?} per month. volume explicitly means
 * calculated WHOLE CALENDAR MONTH user-meter consumption, never a single reading.
 * Optional coverage counts must match. Alternatively, replace volume with:
 * - readings:[{meterId,startReading,endReading,periodStart,periodEnd,quality,multiplier?}],
 *   with expectedMeterCount (required); optional expectedMeterIds validate IDs.
 *   Unique meters must cover the expected set/count; missing meters yield null.
 * - readingStart/readingEnd plus periodStart/periodEnd for an already reconciled
 *   aggregate of the SAME meters' cumulative readings.
 * All reading periods must span this month's start to next month's start.
 * Each meter's consumption is (endReading-startReading)*multiplier. The optional
 * multiplier defaults to 1 and must be finite and positive. Aggregate endpoint
 * records support the same multiplier field. Resets/replacements must be
 * reconciled upstream. A volume supplied
 * alongside readings must agree with their calculated sum.
 * An independent monthly record takes precedence, even if incomplete/invalid.
 * Only when absent may a complete month's legacy daily billed be summed.
 * Monthly usage reads daily balances; real hourly telemetry must first be
 * aggregated into complete daily records by the ingestion/aggregation layer.
 * difference=usage-revenue only with complete quantities for the SAME month.
 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./standard-product.js'));else root.DMAStatistics=factory(root.WaterStandard);})(typeof window==='object'?window:globalThis,function(S){
  'use strict';
  const HOUR=3600000,OFFSET=8*HOUR;
  const valid=v=>(typeof v==='number'||typeof v==='string')&&String(v).trim()!==''&&Number.isFinite(Number(v));
  const quantity=v=>valid(v)&&Number(v)>=0;
  const monthValid=m=>typeof m==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m);
  const shift=(month,n)=>{if(!monthValid(month))return '';const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7);};
  const previous=(now=Date.now())=>shift(new Date(now+OFFSET).toISOString().slice(0,7),-1);
  const days=month=>{if(!monthValid(month))return 0;const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate();};
  const dateValid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number(d.slice(8))>=1&&Number(d.slice(8))<=days(d.slice(0,7));
  function timestamp(value){
    if(typeof value!=='string'||!dateValid(value.slice(0,10)))return NaN;
    const s=value.replace(' ','T');return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s)?s:s+(s.length===10?'T00:00:00':'')+'+08:00');
  }
  const localTime=t=>new Date(t+OFFSET).toISOString().slice(0,19).replace('T',' ');
  const accepted=r=>r.quality==='GOOD';
  function night(samples){
    const byTime=new Map();for(const s of samples||[]){const t=timestamp(s.time);if(!Number.isFinite(t))continue;const h=new Date(t+OFFSET).getUTCHours();if(h>=2&&h<5)byTime.set(t,s);}
    const values=[...byTime.values()].filter(s=>['GOOD','PARTIAL'].includes(s.quality)&&valid(s.value)).map(s=>Number(s.value));return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  }
  function daily(db,version,zone,month){
    return (db.balances||[]).filter(r=>r.topology===version&&r.zoneId===zone&&dateValid(r.date)&&r.date.slice(0,7)===month).sort((a,b)=>a.date.localeCompare(b.date)).map(r=>({
      ...S.balance(r),usage:accepted(r)&&quantity(r.inlet)&&quantity(r.outlet)?Number(r.inlet)-Number(r.outlet):null,night:night(r.nightSamples)
    }));
  }
  function hourly(db,version,zone,start,end){
    const from=timestamp(start),last=timestamp(end),to=dateValid(end)?last+23*HOUR:last;
    if(!Number.isFinite(from)||!Number.isFinite(to)||from>to)return [];
    const grouped=new Map();
    for(const r of db.hourlyBalances||[]){
      if(r.topology!==version||r.zoneId!==zone)continue;
      const t=timestamp(r.time);if(!Number.isFinite(t)||t%HOUR!==0||t<from||t>to)continue;
      if(!grouped.has(t))grouped.set(t,[]);grouped.get(t).push(r);
    }
    const volume=(r,key)=>{
      if(Object.hasOwn(r,key+'Start')||Object.hasOwn(r,key+'End'))return quantity(r[key+'Start'])&&quantity(r[key+'End'])&&Number(r[key+'End'])>=Number(r[key+'Start'])?Number(r[key+'End'])-Number(r[key+'Start']):null;
      return quantity(r[key])?Number(r[key]):null;
    };
    const result=[];
    for(let t=Math.ceil(from/HOUR)*HOUR;t<=to;t+=HOUR){
      const records=grouped.get(t)||[],r=records.length===1?records[0]:null;
      const inlet=r&&accepted(r)?volume(r,'inlet'):null,outlet=r&&accepted(r)?volume(r,'outlet'):null;
      const usage=inlet!=null&&outlet!=null?inlet-outlet:null;
      const quality=records.length>1?'BAD':r&&!accepted(r)?(['BAD','PARTIAL'].includes(r.quality)?r.quality:'MISSING'):usage==null?'MISSING':'GOOD';
      result.push({id:zone+'|'+localTime(t),topology:version,zoneId:zone,time:localTime(t),inlet,outlet,usage,quality,source:r?.source||'',reason:records.length>1?'重复数据':usage==null?'缺少完整有效的小时进口或出口水量':''});
    }
    return result;
  }
  function revenueForMonth(db,version,zone,month,rows,complete){
    const records=(db.revenueRecords||[]).filter(r=>r.topology===version&&r.zoneId===zone&&r.month===month);
    if(!records.length){
      const validRows=complete&&rows.every(r=>accepted(r)&&quantity(r.billed));
      return {revenue:validRows?rows.reduce((s,r)=>s+Number(r.billed),0):null,revenueStatus:validRows?'完整':'待抄表',revenueSource:validRows?'历史日营收用量汇总':'',revenueMeterCount:null,revenueExpectedMeterCount:null};
    }
    const r=records[0],result={revenue:null,revenueStatus:'缺数',revenueSource:r.source||'月度用户水表用量',revenueMeterCount:r.meterCount??null,revenueExpectedMeterCount:r.expectedMeterCount??null};
    if(records.length!==1)return {...result,revenueStatus:'重复数据'};
    if(!accepted(r))return {...result,revenueStatus:r.quality==='BAD'?'质量异常':'缺数'};
    const samePeriod=x=>timestamp(x.periodStart)===timestamp(month+'-01')&&timestamp(x.periodEnd)===timestamp(shift(month,1)+'-01');
    const wholeCount=v=>quantity(v)&&Number.isInteger(Number(v));
    const multiplier=x=>!Object.hasOwn(x,'multiplier')?1:valid(x.multiplier)&&Number(x.multiplier)>0?Number(x.multiplier):null;
    const finish=volume=>r.volume!=null&&(!quantity(r.volume)||Math.abs(Number(r.volume)-volume)>1e-6)?{...result,revenueStatus:'读数异常'}:{...result,revenue:volume,revenueStatus:'完整'};
    if(Array.isArray(r.readings)){
      const ids=r.readings.map(x=>x.meterId),unique=new Set(ids);result.revenueMeterCount=unique.size;
      if(ids.some(id=>typeof id!=='string'||!id.trim()))return result;
      if(unique.size!==ids.length)return {...result,revenueStatus:'重复数据'};
      if(!wholeCount(r.expectedMeterCount)||unique.size!==Number(r.expectedMeterCount)||(r.meterCount!=null&&(!wholeCount(r.meterCount)||Number(r.meterCount)!==unique.size)))return result;
      if(r.expectedMeterIds!=null&&(!Array.isArray(r.expectedMeterIds)||r.expectedMeterIds.length!==unique.size||new Set(r.expectedMeterIds).size!==unique.size||r.expectedMeterIds.some(id=>!unique.has(id))))return result;
      if((r.periodStart!=null||r.periodEnd!=null)&&!samePeriod(r))return {...result,revenueStatus:'统计周期不匹配'};
      if(r.readings.some(x=>!samePeriod(x)))return {...result,revenueStatus:'统计周期不匹配'};
      if(r.readings.some(x=>!accepted(x)))return {...result,revenueStatus:r.readings.some(x=>x.quality==='BAD')?'质量异常':'缺数'};
      if(r.readings.some(x=>!quantity(x.startReading)||!quantity(x.endReading)))return result;
      if(r.readings.some(x=>Number(x.endReading)<Number(x.startReading)))return {...result,revenueStatus:'读数异常'};
      if(r.readings.some(x=>multiplier(x)==null))return {...result,revenueStatus:'倍率异常'};
      return finish(r.readings.reduce((sum,x)=>sum+(Number(x.endReading)-Number(x.startReading))*multiplier(x),0));
    }
    if(Object.hasOwn(r,'readings'))return result;
    if(r.meterCount!=null||r.expectedMeterCount!=null){
      if(!wholeCount(r.meterCount)||!wholeCount(r.expectedMeterCount)||Number(r.meterCount)!==Number(r.expectedMeterCount))return result;
    }
    const readings=Object.hasOwn(r,'readingStart')||Object.hasOwn(r,'readingEnd');
    if((readings||r.periodStart!=null||r.periodEnd!=null)&&!samePeriod(r))return {...result,revenueStatus:'统计周期不匹配'};
    if(readings){
      if(!quantity(r.readingStart)||!quantity(r.readingEnd))return result;
      if(Number(r.readingEnd)<Number(r.readingStart))return {...result,revenueStatus:'读数异常'};
      if(multiplier(r)==null)return {...result,revenueStatus:'倍率异常'};
      return finish((Number(r.readingEnd)-Number(r.readingStart))*multiplier(r));
    }
    return quantity(r.volume)?{...result,revenue:Number(r.volume),revenueStatus:'完整'}:result;
  }
  function monthly(db,version,zones,start,end){
    if(!monthValid(start)||!monthValid(end)||start>end)return [];
    const result=[];
    for(let month=start;month<=end;month=shift(month,1))for(const z of zones){
      const rows=daily(db,version,z.id,month),count=days(month),unique=new Set(rows.map(r=>r.date));
      const complete=rows.length===count&&unique.size===count;
      const totals={};for(const k of ['inlet','outlet','storage','billed','unbilled'])totals[k]=complete&&rows.every(r=>['GOOD','PARTIAL'].includes(r.quality)&&valid(r[k]))?rows.reduce((a,r)=>a+Number(r[k]),0):null;
      const usage=complete&&rows.every(r=>r.usage!=null)?totals.inlet-totals.outlet:null;
      const usageStatus=usage!=null?'完整':rows.length!==unique.size?'重复数据':rows.some(r=>r.quality==='BAD')?'质量异常':'缺数';
      const revenue=revenueForMonth(db,version,z.id,month,rows,complete),difference=usage!=null&&revenue.revenue!=null?usage-revenue.revenue:null;
      result.push({...S.balance(totals),...revenue,usage,usageStatus,difference,differenceStatus:difference==null?'待同期完整数据':difference<0?'负差值，需核对':'完整',id:z.id+'|'+month,zoneId:z.id,zoneName:z.name,date:month,days:unique.size,totalDays:count});
    }
    return result;
  }
  function seed(db,version,zones,now=Date.now()){
    const end=previous(now),marker='v2|'+version+'|'+end;db.dmaMonthlyExamples||={};if(db.dmaMonthlyExamples[marker])return false;
    db.balances||=[];db.hourlyBalances||=[];db.revenueRecords||=[];
    const key=r=>r.topology+'|'+r.zoneId+'|';
    const dayRecords=new Map(),hourDays=new Set();
    for(const r of db.balances){const k=key(r)+r.date;if(!dayRecords.has(k))dayRecords.set(k,[]);dayRecords.get(k).push(r);}
    for(const r of db.hourlyBalances){const t=timestamp(r.time),date=Number.isFinite(t)?localTime(t).slice(0,10):String(r.time||'').slice(0,10);if(dateValid(date))hourDays.add(key(r)+date);}
    const revenueKeys=new Set(db.revenueRecords.map(r=>key(r)+r.month));
    for(let month=shift(end,-2);month<=end;month=shift(month,1))for(const [i,z] of zones.entries()){
      for(let d=1;d<=days(month);d++){
        const date=month+'-'+String(d).padStart(2,'0'),dayKey=version+'|'+z.id+'|'+date;
        // Never fill a partially measured day with simulated intervals.
        if(dayRecords.has(dayKey)||hourDays.has(dayKey))continue;
        // Model each measured hourly interval independently, then sum for the day.
        let inlet=0,outlet=0;
        for(let h=0;h<24;h++){
          const time=date+' '+String(h).padStart(2,'0')+':00:00';
          const inVolume=+(50+i*4+7*Math.sin((h-6)*Math.PI/12)+2.3*Math.sin(d/4+Number(month.slice(5)))).toFixed(3);
          const outVolume=+(8+i*.5+.8*Math.cos(h*Math.PI/12)).toFixed(3);
          inlet+=inVolume;outlet+=outVolume;
          db.hourlyBalances.push({id:'HZ-HOUR-'+version+'-'+z.id+'-'+time,topology:version,zoneId:z.id,time,inlet:inVolume,outlet:outVolume,quality:'GOOD',source:'杭州月度示例'});
        }
        inlet=+inlet.toFixed(3);outlet=+outlet.toFixed(3);
        const storage=10,billed=+((inlet-outlet-storage)*(0.88-i*.012)).toFixed(3);
        const row={id:'HZ-MON-'+version+'-'+z.id+'-'+date,topology:version,zoneId:z.id,zoneName:z.name,date,inlet,outlet,storage,billed,unbilled:20,quality:'GOOD',source:'杭州月度示例',nightSamples:[2,3,4].map(h=>({time:date+' '+String(h).padStart(2,'0')+':00:00',value:+(8+i*3+Math.sin(d/4)+h*.3).toFixed(3),quality:'GOOD'}))};
        db.balances.push(row);dayRecords.set(dayKey,[row]);hourDays.add(dayKey);
      }
      const records=Array.from({length:days(month)},(_,d)=>dayRecords.get(version+'|'+z.id+'|'+month+'-'+String(d+1).padStart(2,'0'))||[]);
      const allExamples=records.every(items=>items.length===1&&items[0].source==='杭州月度示例'&&accepted(items[0])&&quantity(items[0].inlet)&&quantity(items[0].outlet));
      if(allExamples&&!revenueKeys.has(version+'|'+z.id+'|'+month)){
        const monthUsage=records.reduce((sum,items)=>sum+Number(items[0].inlet)-Number(items[0].outlet),0);
        db.revenueRecords.push({id:'HZ-REV-'+version+'-'+z.id+'-'+month,topology:version,zoneId:z.id,month,volume:+(monthUsage*(.87-i*.012)).toFixed(3),meterCount:120+i*16,expectedMeterCount:120+i*16,quality:'GOOD',source:'杭州月度示例'});
      }
    }
    db.dmaMonthlyExamples[marker]=true;return true;
  }
  return {previous,shift,days,night,daily,hourly,monthly,seed};
});
