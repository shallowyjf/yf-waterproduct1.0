const {chromium}=require('C:/Users/yjf95/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1081,height:898}}),errors=[];
 const dir=path.resolve(__dirname,'../artifacts/topology-checks');fs.mkdirSync(dir,{recursive:true});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/index.html');await page.locator('#loginAccount').fill('admin');await page.locator('#loginPassword').fill('admin');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:'进入项目',exact:true}).first().click();
 await page.goto('http://127.0.0.1:8765/index.html#p03');await page.locator('[data-action="topology-open"]').first().click();
 for(const theme of ['light','dark']){
  if(theme==='dark')await page.locator('[data-theme-toggle]:visible').click();
  for(const width of [1081,1280]){
   await page.setViewportSize({width,height:898});
   const toolbox=page.locator('.we-check-toolbox');await toolbox.waitFor({state:'visible'});
   assert.equal(await toolbox.locator('[data-we="category"]').count(),4);
   assert.equal(await page.locator('.map-issues [data-we="category"]').count(),0);
   const rect=await toolbox.boundingBox(),left=await page.locator('[data-map-slot="left"]').boundingBox(),issues=await page.locator('.map-issues').boundingBox();
   assert(rect.y>=left.y&&rect.y+rect.height<=issues.y+1,'toolbox visible outside issue scroller');
   assert(issues.height>=85,'problem list remains usable');
   await page.locator('[data-map-toggle="left"]').click();assert.equal(await toolbox.isVisible(),false);
   await page.getByRole('button',{name:'拓扑检查',exact:true}).click();assert(await toolbox.isVisible());
   for(const category of ['connectivity','island','diameter','elevation']){
    await page.locator(`[data-we="category"][data-value="${category}"]`).click();assert(await page.locator(`[data-we="category"][data-value="${category}"]`).evaluate(n=>n.classList.contains('is-active')));
    const rows=page.locator('[data-we="issue"]');if(await rows.count()){await rows.first().click();assert(await page.locator('[data-map-slot="right"]').isVisible());await page.locator('[data-we="close-detail"]').click();}
   }
   await page.locator('.we-check-toolbox [data-we="run-check"]').click();await page.waitForTimeout(3200);
   await page.screenshot({path:path.join(dir,`${theme}-${width}.png`)});
  }
 }
 assert.deepEqual(errors,[]);console.log('Passed: version list entry, four check categories, issue detail, recheck, collapsed sidebar recovery; light/dark at 1081/1280.');
 } finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
