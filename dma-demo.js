/* Presentation-only examples. Never persist these as imported site measurements. */
(() => {
  const source = 'DMA演示数据';
  window.DMADemo = {
    seed(db, version, zones) {
      const keys = ['balances', 'hourlyBalances', 'revenueRecords'];
      const sizes = Object.fromEntries(keys.map(k => [k, (db[k] || []).length]));
      window.DMAStatistics.seed(db, version, zones);
      for (const k of keys) for (const r of (db[k] || []).slice(sizes[k])) r.source = source;
    },
    monitors(model) {
      const stamp = new Date(Math.floor(Date.now() / 300000) * 300000).toISOString();
      const plan = model.data.metadata?.monitoringPlan;
      if (Array.isArray(plan)) {
        for (const point of plan) {
          const host = model.objects.get(point.hostId), pos = model.position(point.hostId);
          if (!host || !pos || model.monitors.some(m => m.hostId === point.hostId && m.type === point.type)) continue;
          const unit = point.type === 'pressure' ? 'MPa' : 'm³/h';
          model.monitors.push({...point, zoneIds:model.zoneFor(point.hostId), unit,
            value:point.numeric+' '+unit, quality:'GOOD', sampleTime:stamp, source,
            location:(host.sourceId || host.id)+' · '+host.name, x:pos[0], y:pos[1]});
        }
        return;
      }
      model.zones.forEach((z, i) => {
        const existing = model.monitors.filter(m => m.zoneIds?.includes(z.id));
        const types = existing.length ? ['pressure', 'pressure'] : ['pressure', 'pressure', 'flow', 'flow'];
        if (existing.some(m => m.type === 'pressure' && m.sampleTime && m.quality === 'GOOD')) return;
        types.forEach((type, j) => {
          const hostId = z.nodeIds?.[j % z.nodeIds.length];
          if (!hostId || !model.objects.has(hostId)) return;
          const pos = model.position(hostId), numeric = type === 'pressure' ? +(0.31 - i * .018 + j * .008).toFixed(3) : +(43 + i * 5 - j * 6).toFixed(3);
          const unit = type === 'pressure' ? 'MPa' : 'm³/h';
          model.monitors.push({id:'DEMO-'+z.id+'-'+j,type,hostId,zoneIds:[z.id],name:z.name+' · '+(type==='pressure'?'压力':'流量')+'设备 '+(j+1),numeric,unit,value:numeric+' '+unit,quality:'GOOD',sampleTime:stamp,source,location:hostId,x:pos?.[0],y:pos?.[1]});
        });
      });
    }
  };
})();
