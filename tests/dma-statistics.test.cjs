const test=require('node:test'),assert=require('node:assert/strict'),D=require('../dma-statistics.js');
test('DMA previous calendar month and leap year boundaries',()=>{assert.equal(D.previous(Date.parse('2026-01-01T00:00:00+08:00')),'2025-12');assert.equal(D.days('2024-02'),29);});
test('night uses Beijing 02:00 inclusive to 05:00 exclusive, valid numeric mean',()=>{assert.equal(D.night([{time:'2026-09-01 01:59:59',value:900,quality:'GOOD'},{time:'2026-08-31T18:00:00Z',value:10,quality:'GOOD'},{time:'2026-09-01 03:00:00',value:20,quality:'GOOD'},{time:'2026-09-01 04:59:59',value:30,quality:'GOOD'},{time:'2026-09-01 05:00:00',value:800,quality:'GOOD'},{time:'2026-09-01 04:00:00',value:null,quality:'MISSING'}]),20);assert.equal(D.night([]),null);});
test('monthly sum and weighted ratio, version separation, no partial month totals',()=>{const zones=[{id:'Z',name:'区'}],db={balances:[]},now=Date.parse('2026-10-09T00:00:00+08:00');assert(D.seed(db,'T1',zones,now));assert(!D.seed(db,'T1',zones,now));const r=D.monthly(db,'T1',zones,'2026-09','2026-09')[0],daily=D.daily(db,'T1','Z','2026-09');assert.equal(r.inlet,daily.reduce((s,r)=>s+r.inlet,0));assert.equal(r.night,undefined);assert.equal(daily.length,30);assert.notEqual(daily[0].night,daily[1].night);assert.equal(r.rate,r.loss/r.basis*100);assert.equal(D.monthly(db,'T2',zones,'2026-09','2026-09')[0].rate,null);db.balances=db.balances.filter(r=>r.date!=='2026-09-01');assert.equal(D.monthly(db,'T1',zones,'2026-09','2026-09')[0].inlet,null);});


const zones=[{id:'Z',name:'测试分区'}];
const monthDb=()=>({balances:Array.from({length:30},(_,i)=>({topology:'T1',zoneId:'Z',date:'2026-09-'+String(i+1).padStart(2,'0'),inlet:100,outlet:20,quality:'GOOD'}))});
const monthRow=db=>D.monthly(db,'T1',zones,'2026-09','2026-09')[0];
const monthlyRevenue=extra=>({topology:'T1',zoneId:'Z',month:'2026-09',quality:'GOOD',source:'用户水表月汇总',...extra});
const meterReading=(meterId,startReading,endReading,extra={})=>({meterId,startReading,endReading,periodStart:'2026-09-01',periodEnd:'2026-10-01',quality:'GOOD',...extra});

test('DMA usage excludes storage and does not require legacy balance fields',()=>{
  const db=monthDb();db.balances.forEach(r=>r.storage=999);db.revenueRecords=[monthlyRevenue({volume:2000,meterCount:2,expectedMeterCount:2})];
  const r=monthRow(db);
  assert.equal(D.daily(db,'T1','Z','2026-09')[0].usage,80);
  assert.equal(r.usage,2400);assert.equal(r.revenue,2000);assert.equal(r.difference,400);
  assert.equal(r.revenueStatus,'完整');assert.equal(r.revenueSource,'用户水表月汇总');
  assert.equal(r.basis,null);assert.equal(r.rate,null);
});

test('independent monthly revenue takes precedence over legacy daily billing with topology/zone/month isolation',()=>{
  const db=monthDb();db.balances.forEach(r=>r.billed=10);
  db.revenueRecords=[monthlyRevenue({volume:2000}),monthlyRevenue({topology:'T2',volume:999}),monthlyRevenue({zoneId:'OTHER',volume:999}),monthlyRevenue({month:'2026-08',volume:999})];
  assert.equal(monthRow(db).revenue,2000);
  assert.equal(D.monthly(db,'T1',zones,'2026-08','2026-08')[0].revenue,999);
  assert.equal(D.monthly(db,'T1',zones,'2026-08','2026-08')[0].difference,null);
  db.revenueRecords=[];
  assert.equal(monthRow(db).revenue,300);assert.equal(monthRow(db).revenueSource,'历史日营收用量汇总');
  delete db.balances[0].billed;assert.equal(monthRow(db).revenue,null);
});

test('incomplete or invalid monthly revenue never silently falls back to legacy billed',()=>{
  for(const [extra,status] of [
    [{volume:2000,meterCount:1,expectedMeterCount:2},'缺数'],
    [{volume:2000,meterCount:2},'缺数'],
    [{volume:2000,quality:'PARTIAL'},'缺数'],
    [{volume:2000,quality:'BAD'},'质量异常'],
    [{volume:-1},'缺数'],
    [{volume:' '},'缺数'],
    [{reading:9000},'缺数'],
    [{volume:2000,periodStart:'2026-08-25',periodEnd:'2026-09-25'},'统计周期不匹配']
  ]){
    const db=monthDb();db.balances.forEach(r=>r.billed=10);db.revenueRecords=[monthlyRevenue(extra)];
    const r=monthRow(db);assert.equal(r.usage,2400);assert.equal(r.revenue,null,JSON.stringify(extra));assert.equal(r.difference,null);assert.equal(r.revenueStatus,status);
  }
});

test('revenue sums same-month consumption from each user meter, not cumulative readings',()=>{
  const db=monthDb();db.revenueRecords=[monthlyRevenue({expectedMeterCount:2,expectedMeterIds:['A','B'],readings:[meterReading('A',1000,1060),meterReading('B',4000,4100)]})];
  const r=monthRow(db);assert.equal(r.revenue,160);assert.equal(r.revenueMeterCount,2);assert.equal(r.revenueExpectedMeterCount,2);assert.equal(r.difference,2240);
});

test('user-meter coverage, duplicate meters, bad readings and mismatched periods leave revenue unknown',()=>{
  const good=[meterReading('A',1000,1060),meterReading('B',4000,4100)];
  for(const extra of [
    {expectedMeterCount:3,readings:good},
    {readings:good},
    {expectedMeterCount:2,expectedMeterIds:['A','C'],readings:good},
    {expectedMeterCount:2,expectedMeterIds:['A','A','B'],readings:good},
    {expectedMeterCount:2,readings:[good[0],good[0]]},
    {expectedMeterCount:2,readings:[good[0],meterReading('B',4000,null)]},
    {expectedMeterCount:2,readings:[good[0],meterReading('B',4000,10)]},
    {expectedMeterCount:2,readings:[good[0],meterReading('B',4000,4100,{quality:'BAD'})]},
    {expectedMeterCount:2,readings:[good[0],meterReading('B',4000,4100,{periodStart:'2026-08-31'})]},
    {expectedMeterCount:2,readings:good,volume:999},
    {expectedMeterCount:2,readings:'invalid'}
  ]){
    const db=monthDb();db.revenueRecords=[monthlyRevenue(extra)];assert.equal(monthRow(db).revenue,null,JSON.stringify(extra));assert.equal(monthRow(db).difference,null);
  }
});

test('aggregate cumulative readings require both same-month endpoints and handle zero actual use',()=>{
  const db=monthDb();db.revenueRecords=[monthlyRevenue({readingStart:1000,readingEnd:1125,periodStart:'2026-08-31T16:00:00Z',periodEnd:'2026-10-01T00:00:00+08:00'})];
  assert.equal(monthRow(db).revenue,125);
  db.revenueRecords[0].readingEnd=1000;assert.equal(monthRow(db).revenue,0);
  delete db.revenueRecords[0].periodStart;assert.equal(monthRow(db).revenue,null);
});

test('meter multipliers apply before monthly aggregation and default to one',()=>{
  const db=monthDb();db.revenueRecords=[monthlyRevenue({expectedMeterCount:2,readings:[meterReading('A',1000,1060,{multiplier:10}),meterReading('B',4000,4100)]})];
  assert.equal(monthRow(db).revenue,700);assert.equal(monthRow(db).difference,1700);
  db.revenueRecords=[monthlyRevenue({readingStart:1000,readingEnd:1125,periodStart:'2026-09-01',periodEnd:'2026-10-01',multiplier:2})];
  assert.equal(monthRow(db).revenue,250);
});

test('invalid meter multipliers leave revenue and difference unknown',()=>{
  for(const multiplier of [0,-1,Infinity,NaN,' ',null,'invalid']){
    for(const extra of [
      {expectedMeterCount:1,readings:[meterReading('A',1000,1060,{multiplier})]},
      {readingStart:1000,readingEnd:1125,periodStart:'2026-09-01',periodEnd:'2026-10-01',multiplier}
    ]){
      const db=monthDb();db.revenueRecords=[monthlyRevenue(extra)];const r=monthRow(db);
      assert.equal(r.revenue,null);assert.equal(r.difference,null);assert.equal(r.revenueStatus,'倍率异常');
    }
  }
});

test('monthly difference requires a full unique calendar month while independent revenue remains visible',()=>{
  for(const mutate of [
    db=>db.balances.pop(),
    db=>db.balances.push({...db.balances[0]}),
    db=>db.balances[0].date='2026-09-31',
    db=>db.balances[0].quality='PARTIAL',
    db=>db.balances[0].outlet=null,
    db=>db.balances[0].inlet=-1
  ]){
    const db=monthDb();db.revenueRecords=[monthlyRevenue({volume:2000})];mutate(db);
    const r=monthRow(db);assert.equal(r.usage,null);assert.equal(r.revenue,2000);assert.equal(r.difference,null);
  }
  const db=monthDb();db.revenueRecords=[monthlyRevenue({volume:2000}),monthlyRevenue({volume:2000})];assert.equal(monthRow(db).revenueStatus,'重复数据');assert.equal(monthRow(db).difference,null);
});

test('hourly series is fixed-grid Beijing time, isolates boundaries and preserves missing intervals',()=>{
  const db={hourlyBalances:[
    {topology:'T1',zoneId:'Z',time:'2026-08-31T16:00:00Z',inlet:20,outlet:3,quality:'GOOD'},
    {topology:'T1',zoneId:'Z',time:'2026-09-01 02:00:00',inletStart:100,inletEnd:125,outletStart:20,outletEnd:25,quality:'GOOD'},
    {topology:'T1',zoneId:'Z',time:'2026-09-02 00:00:00',inlet:99,outlet:1,quality:'GOOD'},
    {topology:'T2',zoneId:'Z',time:'2026-09-01 01:00:00',inlet:99,outlet:1,quality:'GOOD'},
    {topology:'T1',zoneId:'OTHER',time:'2026-09-01 01:00:00',inlet:99,outlet:1,quality:'GOOD'}
  ]};
  const rows=D.hourly(db,'T1','Z','2026-09-01','2026-09-01');
  assert.equal(rows.length,24);assert.equal(rows[0].time,'2026-09-01 00:00:00');assert.equal(rows[23].time,'2026-09-01 23:00:00');
  assert.equal(rows[0].usage,17);assert.equal(rows[1].usage,null);assert.equal(rows[1].quality,'MISSING');assert.equal(rows[2].inlet,25);assert.equal(rows[2].outlet,5);assert.equal(rows[2].usage,20);
  assert.equal(D.hourly(db,'T1','Z','2026-09-01 01:00:00','2026-09-01 02:00:00').length,2);
});

test('hourly duplicates, partial quality, missing outlet and meter reset cannot produce usage',()=>{
  const rows=[
    {time:'2026-09-01 00:00:00',inlet:20,outlet:3,quality:'PARTIAL'},
    {time:'2026-09-01 01:00:00',inlet:20,outlet:null,quality:'GOOD'},
    {time:'2026-09-01 02:00:00',inletStart:100,inletEnd:5,outlet:2,quality:'GOOD'},
    {time:'2026-09-01 03:00:00',inlet:20,outlet:3,quality:'GOOD'},
    {time:'2026-08-31T19:00:00Z',inlet:20,outlet:3,quality:'GOOD'}
  ].map(r=>({topology:'T1',zoneId:'Z',...r}));
  const result=D.hourly({hourlyBalances:rows},'T1','Z','2026-09-01','2026-09-01');
  assert(result.every(r=>r.usage===null));assert.equal(result[0].quality,'PARTIAL');assert.equal(result[3].quality,'BAD');
});

test('monthly and daily totals never generate artificial hourly usage or revenue',()=>{
  const db=monthDb();db.revenueRecords=[monthlyRevenue({volume:2000})];
  const rows=D.hourly(db,'T1','Z','2026-09-01','2026-09-02');
  assert.equal(rows.length,48);assert(rows.every(r=>r.usage===null&&!Object.hasOwn(r,'revenue')));
  assert.deepEqual(D.hourly(db,'T1','Z','2026-09-02','2026-09-01'),[]);
  assert.deepEqual(D.monthly(db,'T1',zones,'2026-13','2026-14'),[]);
});

test('demonstration hourly intervals aggregate to day/month and seed is idempotent',()=>{
  const db={balances:[]},now=Date.parse('2026-10-09T00:00:00+08:00');D.seed(db,'T1',zones,now);
  const month=monthRow(db),daily=D.daily(db,'T1','Z','2026-09'),hours=D.hourly(db,'T1','Z','2026-09-01','2026-09-30');
  assert.equal(hours.length,720);assert(new Set(hours.slice(0,24).map(r=>r.usage)).size>1);
  assert(Math.abs(hours.reduce((sum,r)=>sum+r.usage,0)-month.usage)<1e-6);
  assert(Math.abs(hours.slice(0,24).reduce((sum,r)=>sum+r.usage,0)-daily[0].usage)<1e-6);
  assert.equal(month.revenueSource,'杭州月度示例');assert.notEqual(month.revenue,month.billed);
  const counts=[db.balances.length,db.hourlyBalances.length,db.revenueRecords.length];
  assert.equal(D.seed(db,'T1',zones,now),false);
  assert.deepEqual([db.balances.length,db.hourlyBalances.length,db.revenueRecords.length],counts);
  // Even after a marker is dropped, existing measurements are not duplicated.
  delete db.dmaMonthlyExamples;D.seed(db,'T1',zones,now);
  assert.deepEqual([db.balances.length,db.hourlyBalances.length,db.revenueRecords.length],counts);
});

test('demo seeding never fills partially measured days or invents revenue for a mixed real/example month',()=>{
  const realHour={topology:'T1',zoneId:'Z',time:'2026-09-01 01:00:00',inlet:999,outlet:10,quality:'GOOD',source:'设备实测'};
  const realDay={topology:'T1',zoneId:'Z',date:'2026-09-02',inlet:2000,outlet:200,quality:'GOOD',source:'人工录入'};
  const db={balances:[realDay],hourlyBalances:[realHour]};D.seed(db,'T1',zones,Date.parse('2026-10-09T00:00:00+08:00'));
  assert.equal(db.hourlyBalances.filter(r=>r.time.startsWith('2026-09-01')).length,1);
  assert.equal(db.hourlyBalances.filter(r=>r.time.startsWith('2026-09-02')).length,0);
  assert.equal(db.balances.filter(r=>r.date==='2026-09-01').length,0);
  assert.equal(db.balances.find(r=>r.date==='2026-09-02'),realDay);
  assert.equal(db.hourlyBalances.find(r=>r.time===realHour.time),realHour);
  assert.equal(db.revenueRecords.filter(r=>r.month==='2026-09').length,0);
  assert.equal(monthRow(db).usage,null);assert.equal(monthRow(db).revenue,null);
});
