const {chromium}=require('C:/Users/yjf95/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));fs.mkdirSync('artifacts/dma-core',{recursive:true});
try{
 await page.goto('http://127.0.0.1:8765/index.html');await page.locator('#loginAccount').fill('viewer1');await page.locator('#loginPassword').fill('Viewer@2026');await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator('[data-action="enter-project"][data-project-id="PRJ-001"]').click();
 await page.goto('http://127.0.0.1:8765/index.html#leakage');
 await page.locator('[name="zone"]').selectOption('CITY-DMA-CE');await page.locator('[data-sp-form="analysis-query"] button').click();
 assert.equal(await page.locator('[name="analysisMetric"]').inputValue(),'comparison');
 const month=await page.evaluate(()=>window.DMAStatistics.previous());assert.equal(await page.locator('[name="end"]').inputValue(),month);
 const chartConfig=async()=>JSON.parse(decodeURIComponent(await page.locator('.dma-analysis-chart').getAttribute('data-echart-line')));
 let config=await chartConfig();assert.deepEqual(config.series.map(s=>s.name),['分区用水量','营收水量']);assert(config.series.every(s=>s.data.every(v=>typeof v==='number')));
 await page.locator('[data-sp="analysis-details"]').click();assert.equal(await page.locator('.sp-page .sp-panel .sp-table tbody tr').count(),3);
 await page.locator('[data-sp="finding"]').last().click();assert.equal(await page.locator('.sp-drawer tbody tr').count(),windowDays(month));assert(!(await page.locator('.sp-drawer thead').innerText()).includes('营收'));await page.locator('[data-sp="close-finding"]').click();
 await page.locator('.sp-heading').scrollIntoViewIfNeeded();await page.waitForFunction(()=>!document.querySelector('#toastRoot')?.children.length);await page.screenshot({path:'artifacts/dma-core/monthly-comparison.png',fullPage:true});
 await page.locator('[name="analysisMetric"]').selectOption('difference');config=await chartConfig();assert.equal(config.series[0].name,'月度差值');await page.locator('.sp-heading').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/dma-core/monthly-difference.png',fullPage:true});
 await page.locator('[name="analysisMetric"]').selectOption('hourly');config=await chartConfig();assert.equal(config.series.length,1);assert.equal(config.series[0].data.length,24);assert(config.series[0].data.some(v=>v!=null));assert.equal(await page.locator('.sp-page .sp-panel .sp-table tbody tr').count(),24);
 const download=page.waitForEvent('download');await page.locator('[data-sp="analysis-export"]').click();await(await download).saveAs('artifacts/dma-core/hourly.xlsx');
 await page.locator('.sp-heading').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/dma-core/hourly-usage.png',fullPage:true});
 await page.locator('[name="end"]').fill(month+'-01');await page.locator('[name="start"]').fill('2026-01-01');await page.locator('[data-sp-form="analysis-query"] button').click();assert((await page.locator('.sp-notice').innerText()).includes('31天'));
 await page.goto('http://127.0.0.1:8765/index.html#p02dma');await page.locator('[data-action="select-dma"][data-value="CITY-DMA-CE"]').first().press('Enter');
 const mapText=await page.locator('.product-gis-panel-right').innerText();for(const label of ['分区用水量','平均压力','分区营收水量','设备数量','系统设置'])assert(mapText.includes(label));
 await page.locator('#dmaZoneName').fill('中心东区 · 验证');await page.locator('[data-action="save-dma-metadata"]').click();assert.equal(await page.locator('#dmaZoneName').inputValue(),'中心东区 · 验证');assert.equal(await page.locator('#dmaZoneColor').count(),0);await page.locator('[data-action="open-layer-style"][data-style-layer="dma"]').click();await page.locator('[data-dma-zone-color][data-dma-id="CITY-DMA-CE"]').fill('#338877');await page.locator('[data-dma-zone-color][data-dma-id="CITY-DMA-CE"]').press('Tab');await page.locator('[data-action="close-layer-style"]').click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('water-topology-store:PRJ-001')));assert(Object.values(saved.dmaPlans).some(b=>b.items.some(p=>p.zones.some(z=>z.id==='CITY-DMA-CE'&&z.name==='中心东区 · 验证'&&z.color==='#338877'))));
 await page.locator('[data-action="dma-leakage-trend"][data-metric="hourly"]').click();assert.equal(await page.locator('[name="analysisMetric"]').inputValue(),'hourly');assert.equal(await page.locator('[name="zone"]').inputValue(),'CITY-DMA-CE');await page.goBack();await page.locator('[data-action="select-dma"][data-value="CITY-DMA-CE"]').first().press('Enter');await page.waitForFunction(()=>!document.querySelector('#toastRoot')?.children.length);
 await page.screenshot({path:'artifacts/dma-core/dma-map.png',fullPage:true});
 await page.locator('#projectSelect').selectOption('PRJ-SH-CAMPUS');await page.goto('http://127.0.0.1:8765/index.html#leakage');
 assert.equal(await page.locator('.dma-analysis-chart').count(),1);const campusChart=await chartConfig();assert(campusChart.series.every(s=>s.data.every(v=>typeof v==='number')));assert(!(await page.locator('.sp-page').innerText()).includes('口径'));await page.locator('[name="analysisMetric"]').selectOption('hourly');assert.equal((await chartConfig()).series[0].data.length,24);
 await page.setViewportSize({width:1081,height:898});await page.locator('[data-theme-toggle]:visible').click();await page.waitForFunction(()=>!document.querySelector('#toastRoot')?.children.length);await page.screenshot({path:'artifacts/dma-core/campus-dark-empty.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: monthly comparison/difference, hourly curve, matching details and export, range validation, campus demo data and clean UI, no browser exceptions');
}finally{await browser.close();}
function windowDays(month){const[y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate();}
})().catch(e=>{console.error(e);process.exitCode=1;});
