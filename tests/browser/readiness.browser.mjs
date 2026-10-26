import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fixtureCategory, fixtureProduct, adminFixtureResponse } from './overview-fixtures.mjs';
import { buildCandidateCsp } from '../../scripts/security/csp-values.mjs';
const require=createRequire(import.meta.url),pw=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const origin=process.env.QC_BROWSER_URL||'http://127.0.0.1:5175';assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
const browser=await pw.chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});after(()=>browser.close());
async function fixtures(context,role='guest',{csp=false}={}) {
  const calls=[];
  await context.route('**/*',async route=>{
    const request=route.request(),u=new URL(request.url());
    if(u.pathname.startsWith('/api/')){
      calls.push(u.pathname+u.search);let json;
      if(u.pathname.endsWith('/auth/me'))json={user:role==='guest'?null:{role,name:'Offline',email:'test@example.invalid'}};
      else if(u.pathname.startsWith('/api/admin/'))return route.fulfill(adminFixtureResponse(request,u)||{json:{}});
      else if(u.pathname.endsWith('/catalog/categories'))json={categories:[fixtureCategory]};
      else if(u.pathname.includes('/catalog/products'))json={items:[fixtureProduct],pagination:{page:1,pages:1,total:1}};
      else json={settings:{contact:{},policies:{}}};return route.fulfill({json});
    }
    if(u.origin!==origin)return route.abort();
    if(csp&&request.isNavigationRequest()) {const response=await route.fetch();return route.fulfill({response,headers:{...response.headers(),'Content-Security-Policy':buildCandidateCsp()}});}
    return route.continue();
  });return calls;
}
async function pageFor(t,path='/',role='guest',options={}){
  const {csp,...contextOptions}=options;const context=await browser.newContext({viewport:{width:1440,height:900},...contextOptions});t.after(()=>context.close());
  const calls=await fixtures(context,role,{csp});const page=await context.newPage();page.setDefaultTimeout(8000);
  await page.addInitScript(()=>{window.__violations=[];document.addEventListener('securitypolicyviolation',e=>window.__violations.push(e.violatedDirective));});
  await page.goto(origin+path);await page.locator('.brand-link').waitFor();return{page,calls,context};
}
test('public link intent loads route code while leaving protected data and modules untouched',async t=>{
  const{page,calls}=await pageFor(t);await page.locator('.qc-category-card').waitFor();
  const count=calls.filter(u=>u.startsWith('/api/catalog/products')).length;
  await page.locator('.desktop-links a[href="/shop"]').hover();
  await page.waitForFunction(()=>performance.getEntriesByType('resource').some(e=>/ShopPage-/.test(e.name)));
  assert.equal(calls.filter(u=>u.startsWith('/api/catalog/products')).length,count);
  assert.equal(calls.filter(u=>u.startsWith('/api/admin/')).length,0);
  assert.doesNotMatch(await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name).join('\n')),/CatalogAdmin|AdminOverview|AdminOrders/);
  await page.locator('.desktop-links a[href="/shop"]').click();await page.locator('.qc-product-card').first().waitFor();
});
test('hero scroll engine waits for scroll intent and releases animation on reduced motion',async t=>{
  const{page}=await pageFor(t);await page.locator('.qc-category-card').waitFor();
  assert.doesNotMatch(await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name).join('\n')),/ScrollTrigger/);
  await page.mouse.wheel(0,180);await page.waitForFunction(()=>performance.getEntriesByType('resource').some(e=>/ScrollTrigger/.test(e.name)));
  await page.waitForFunction(()=>document.querySelector('.hero-media').style.transform!=='');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('.hero-media').style.transform==='');
  await page.locator('.brand-link').click();await page.waitForFunction(()=>scrollY===0);
});
test('authorized admin intent preloads code only; tab data still waits for navigation',async t=>{
  const{page,calls}=await pageFor(t,'/','admin');await page.locator('.qc-category-card').waitFor();
  const link=page.locator('.header-actions a[href="/admin"]');await link.focus();
  await page.waitForFunction(()=>performance.getEntriesByType('resource').some(e=>/CatalogAdmin-.*\.js/.test(e.name)));
  assert.equal(calls.filter(u=>u.startsWith('/api/admin/')).length,0);
  await link.click();await page.locator('.qc-overview-metric').first().waitFor();
  const before=calls.length;await page.locator('.qc-admin-tabs button').nth(1).hover();
  await page.waitForFunction(()=>performance.getEntriesByType('resource').some(e=>/AdminOrders-/.test(e.name)));
  assert.equal(calls.length,before);await page.locator('.qc-admin-tabs button').nth(1).click();await page.locator('.qc-admin-list-item').first().waitFor();
});
for(const path of ['/','/ar/admin'])test(`candidate CSP permits current scripts, styles, media and dynamic chunks: ${path}`,async t=>{
  const{page}=await pageFor(t,path,path.includes('admin')?'admin':'guest',{csp:true});
  await page.locator(path.includes('admin')?'.qc-overview-metric':'.hero h1').first().waitFor();
  if(!path.includes('admin')){await page.locator('.desktop-links a[href="/shop"]').click();await page.locator('.qc-product-card').first().waitFor();}
  else {await page.locator('.qc-overview-periods button').nth(1).click();await page.locator('.qc-overview-metric').first().waitFor();}
  assert.deepEqual(await page.evaluate(()=>window.__violations),[]);
});
for(const lang of ['en','ar'])test(`forced colors, touch input and keyboard navigation: ${lang}`,async t=>{
  const{page}=await pageFor(t,lang==='ar'?'/ar/about':'/about','guest',{viewport:{width:390,height:844},isMobile:true,hasTouch:true,forcedColors:'active',reducedMotion:'reduce'});
  await page.locator('main h1').waitFor();await page.locator('.mobile-menu').tap();await page.locator('.mobile-drawer.is-open').waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.locator('.mobile-menu').evaluate(e=>e===document.activeElement),true);
  const box=await page.locator('.mobile-menu').boundingBox();assert.ok(box.width>=24&&box.height>=24);
  await page.locator('.qc-floating-language').tap();await page.waitForFunction(expected=>document.documentElement.lang===expected,lang==='ar'?'en':'ar');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.keyboard.press('Tab');await page.locator('.mobile-menu').focus();assert.notEqual(await page.locator('.mobile-menu').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
  assert.equal(await page.locator('.brand-link').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(16, 14, 12)');
  assert.equal(await page.locator('.qc-floating-language').evaluate(e=>getComputedStyle(e).backdropFilter),'none');
  assert.equal(await page.locator('.qc-floating-language').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  await page.screenshot({path:`.playwright/d2-forced-${lang}.png`});
});
test('generated HTML files and product CSR limitations remain explicit without JavaScript',async t=>{
  const context=await browser.newContext({javaScriptEnabled:false});t.after(()=>context.close());await fixtures(context);const page=await context.newPage();
  // Vite preview's SPA middleware is not the Pages native file resolver. Verify
  // actual generated files here; deployed pretty-URL routing is a handoff gate.
  for(const path of ['/about.html','/ar/shop.html']){await page.goto(origin+path);assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex,nofollow');assert.equal(await page.locator('#root').textContent(),'');assert.equal(await page.locator('html').getAttribute('lang'),path.startsWith('/ar')?'ar':'en');assert.match(await page.title(),path.startsWith('/ar')?/تسوق/:/Our Story/);}
  await page.goto(origin+'/products/fixture-coffee');assert.doesNotMatch(await page.title(),/fixture-coffee/);assert.equal(await page.locator('script[type="application/ld+json"]').count(),0);
  const robots=await context.request.get(origin+'/robots.txt');assert.match(robots.headers()['content-type'],/text\/plain/);assert.match(await robots.text(),/^User-agent: \*$/m);assert.doesNotMatch(await robots.text(),/^Sitemap:/im);
});
test('actual 200 percent browser zoom reflows English and Arabic public/admin pages',async t=>{
  const extension=resolve('.playwright/d2-zoom-extension');mkdirSync(extension,{recursive:true});
  writeFileSync(resolve(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Offline zoom verification',version:'1.0',permissions:['tabs'],background:{service_worker:'background.js'}}));
  writeFileSync(resolve(extension,'background.js'),'chrome.runtime.onInstalled.addListener(() => {});');
  const context=await pw.chromium.launchPersistentContext('',{headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,viewport:null,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--window-size=1440,1000']});t.after(()=>context.close());
  const calls=await fixtures(context,'admin');const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:8000});
  const page=await context.newPage();await page.goto(origin+'/about');await page.locator('main h1').waitFor();const initial=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio}));
  const zoom=await worker.evaluate(async url=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url===url);await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id);},page.url());assert.equal(zoom,2);
  await page.waitForFunction(width=>innerWidth<width*.6,initial.width);
  for(const path of ['/about','/ar/about','/admin','/ar/admin?tab=settings']){await page.goto(origin+path);await page.locator(path.includes('settings')?'.qc-admin-form':path.includes('admin')?'.qc-overview-metric':'main h1').first().waitFor();await page.locator('.brand-link').focus();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  assert.ok(calls.some(u=>u.startsWith('/api/admin/overview')));writeFileSync('.playwright/d2-zoom.json',JSON.stringify({zoom,initial,final:await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio}))},null,2));
});
const edgePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
test('installed Edge independently verifies storefront and Arabic admin navigation', {skip:!edgePath}, async t=>{
  const edge=await pw.chromium.launch({headless:true,executablePath:edgePath});t.after(()=>edge.close());
  for(const [width,path]of [[1440,'/about'],[390,'/ar/about']]){
    const context=await edge.newContext({viewport:{width,height:900},reducedMotion:'reduce'});t.after(()=>context.close());await fixtures(context,'admin');
    const page=await context.newPage();await page.goto(origin+path);await page.locator('main h1').waitFor();await page.locator('.brand-link').click();await page.locator('.hero h1').waitFor();
    await page.goto(origin+(path.startsWith('/ar')?'/ar/admin':'/admin'));await page.locator('.qc-overview-metric').first().waitFor();await page.locator('.qc-admin-tabs button').nth(3).click();await page.locator('.qc-admin-list-item').first().waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
});
