const {chromium}=require('C:/Users/yjf95/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'../artifacts/model-review');fs.mkdirSync(dir,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:898}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function login(){await page.locator('#loginAccount').fill('admin');await page.locator('#loginPassword').fill('admin');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:'进入项目',exact:true}).first().click();}
 const go=async route=>{await page.goto('http://127.0.0.1:8765/index.html#'+route);await page.waitForTimeout(100);};
 const action=(a,id)=>page.locator(`[data-v2="${a}"]${id?`[data-id="${id}"]`:''}`).first().click();
 const storage=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const o=indexedDB.open('water-product-v2',1);o.onsuccess=()=>{const db=o.result,r=db.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>{resolve(r.result.find(d=>d.reviewPack));db.close();};r.onerror=()=>reject(r.error);};o.onerror=()=>reject(o.error);}));
 await page.goto('http://127.0.0.1:8765/index.html');await login();
 const original=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('water-editor:'))));
 await go('modelReview');await page.locator('[data-v2="review-compare"]').first().waitFor({timeout:30000});
 const db=await storage(),pack=db.reviewPack;assert.equal(pack.records.length,10);assert.equal(db.runs.length,14);assert(db.jobs.every(j=>j.status==='已完成'));
 assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('water-editor:')))),original);
 await page.waitForTimeout(3200);await page.screenshot({path:path.join(dir,'overview.png'),fullPage:true});
 for(const record of pack.records){
  await go('modelReview');await action('scene-result',record.sceneId);await page.locator('[data-map-workspace]').waitFor();assert(await page.locator('[name="resultVersion"] option').count()===record.runIds.length);
  assert.equal(await page.locator('.v2-error:visible').count(),0,record.name);await action('findings');assert(await page.locator('[data-map-slot="right"]').isVisible());
  if(['08','09','10'].includes(record.code))assert(!(await page.locator('[data-map-slot="right"]').textContent()).includes('事件泄漏量'));
  if(['01','07','08','09','10'].includes(record.code))await page.screenshot({path:path.join(dir,record.code+'-result.png')});
 }
 for(const code of ['02','03','07','09']){await go('modelReview');await action('review-compare',code);await page.locator('[name="compareA"]').waitFor();assert.equal(await page.locator('.v2-error:visible').count(),0);assert(await page.locator('.v2-table tbody tr').count()>0);}
 await go('modelReview');await action('scene-open',pack.records.find(r=>r.code==='10').sceneId);assert.equal(await page.locator('[name="target"]').inputValue(),pack.target.qualityUser);
 await action('scene-submit');await page.waitForFunction(()=>document.querySelectorAll('[data-v2="job-result"]').length===2,{},{timeout:20000});assert((await page.locator('#workspace').textContent()).includes('已完成'));
 await go('modelReview');await action('plan-detail',pack.planId);assert((await page.locator('[role="dialog"]').textContent()).includes('草稿'));await page.locator('button[data-v2="drawer-close"]').click();
 const ids=pack.records.map(r=>r.sceneId);await page.reload();await login();await go('modelReview');await page.locator('[data-v2="review-compare"]').first().waitFor();assert.deepEqual((await storage()).reviewPack.records.map(r=>r.sceneId),ids);
 await page.setViewportSize({width:1081,height:898});await page.locator('[data-theme-toggle]:visible').click();await page.waitForTimeout(3200);await page.screenshot({path:path.join(dir,'overview-dark-1081.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(dir,'pack.json'),JSON.stringify({pack,outcomes:db.runs.map(r=>({scene:r.name,time:r.calculationTime,impact:r.impact?{disconnected:r.impact.disconnected,remainingLeak:r.impact.remainingLeak}:null,findings:r.findings.filter(f=>f.reason!=='供水正常'&&f.reason!=='水质正常').length}))},null,2));
 console.log('PASS: 10 scenes, 14 prepared results, all result views, comparisons, re-computation, draft plan, persistence, source isolation, dark 1081.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
