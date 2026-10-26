import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fixtureProduct, fixtureCategory, adminFixtureResponse } from './overview-fixtures.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const origin = process.env.QC_BROWSER_URL || 'http://127.0.0.1:5174';
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
after(() => browser.close());
async function pageFor(t, { path = '/', width = 390, role = 'guest', handler, setup, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion }); t.after(() => context.close());
  const page = await context.newPage(), calls = [];
  page.setDefaultTimeout(8000);
  await context.route('**/*', async route => {
    const request = route.request(), u = new URL(request.url());
    if (u.pathname.startsWith('/api/')) {
      calls.push(u.pathname + u.search);
      const response = await handler?.(request, u); if (response) return route.fulfill(response);
      let json;
      if (u.pathname.endsWith('/auth/me')) json = { user: role === 'guest' ? null : { role, name: 'Offline', email: 'test@example.invalid' } };
      else if (u.pathname.endsWith('/auth/login')) json = { user: { role: 'admin', name: 'Offline', email: 'test@example.invalid' } };
      else if (u.pathname.startsWith('/api/admin/')) return route.fulfill(adminFixtureResponse(request, u) || { json: {} });
      else if (u.pathname.endsWith('/catalog/categories')) json = { categories: [fixtureCategory] };
      else if (u.pathname.endsWith('/catalog/products/test-coffee')) json = { product: { ...fixtureProduct, status: 'published', stockQuantity: 5, sizes: [{ grams: 250, pricePiastres: 10000, grindOptions: [{ code: 'espresso', stockQuantity: 5 }] }] } };
      else if (u.pathname.includes('/catalog/products')) json = { items: [], pagination: { page: 1, pages: 1, total: 0 } };
      else if (u.pathname.endsWith('/commerce/cart')) json = { items: [] };
      else if (u.pathname.endsWith('/commerce/config')) json = { checkoutEnabled: false, paymentMethods: [] };
      else json = { settings: { contact: {}, policies: {} } };
      return route.fulfill({ json });
    }
    if (u.origin !== origin) return route.abort();
    return route.continue();
  });
  await setup?.(context, page);
  await page.goto(origin + path); await page.locator('.brand-link').waitFor();
  return { page, calls, context };
}
test('a late initial session response cannot overwrite a completed login', async t => {
  const pending = [];
  const { page } = await pageFor(t, { path: '/login', handler: (_request,u) => u.pathname.endsWith('/auth/me') ? new Promise(resolve => pending.push(resolve)) : undefined });
  await page.locator('input[type=email]').fill('test@example.invalid'); await page.locator('input[type=password]').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.locator('.qc-overview').waitFor();
  for (const release of pending) release({ json: { user: null } });
  await page.waitForTimeout(350); assert.equal(new URL(page.url()).pathname, '/admin'); assert.equal(await page.locator('.qc-overview').count(), 1);
});
for (const lang of ['en','ar']) for (const width of [320,1440]) test(`${lang} ${width}: skip link, focus, announcement control and drawer keyboard flow`, async t => {
  const { page } = await pageFor(t, { path: lang==='ar'?'/ar/about':'/about', width });
  await page.locator('main h1').waitFor(); await page.keyboard.press('Tab');
  assert.equal(await page.locator('.qc-skip-link').evaluate(e=>e===document.activeElement),true);
  await page.keyboard.press('Enter'); assert.equal(await page.locator('main').evaluate(e=>e===document.activeElement),true);
  const pause=page.locator('.qc-announcement-control');await pause.focus();await page.keyboard.press('Enter');
  assert.equal(await pause.getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.qc-announcement-track').evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
  await page.keyboard.press('Enter');assert.equal(await pause.getAttribute('aria-pressed'),'false');
  if(width===320){await page.locator('.mobile-menu').click();await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('.mobile-drawer a').last().evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await page.locator('.drawer-top button').evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Escape');assert.equal(await page.locator('.mobile-menu').evaluate(e=>e===document.activeElement),true);}
  await page.locator('.qc-floating-language').click();await page.waitForFunction(expected=>document.documentElement.lang===expected,lang==='ar'?'en':'ar');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
});
for (const path of ['/shop','/products/test-coffee','/cart','/login','/ar/admin?tab=orders','/admin?tab=settings']) test(`direct lazy route, refresh and Back/Forward: ${path}`, async t => {
  const {page}=await pageFor(t,{path,role:path.includes('admin')?'admin':'guest'});
  await page.locator('main h1').waitFor(); const target=new URL(page.url()).pathname+new URL(page.url()).search;
  await page.reload();await page.locator('main h1').waitFor();assert.equal(new URL(page.url()).pathname+new URL(page.url()).search,target);
  await page.locator('.brand-link').click();await page.locator('.hero h1').waitFor();
  await page.goBack();await page.locator('main h1').waitFor();assert.equal(new URL(page.url()).pathname+new URL(page.url()).search,target);
  await page.goForward();await page.locator('.hero h1').waitFor();
});
test('empty cart avoids validation requests and public reads are shared across legal/shop navigation',async t=>{
  const {page,calls}=await pageFor(t,{path:'/cart',width:1440});await page.locator('main h1').waitFor();await page.waitForTimeout(100);
  assert.equal(calls.filter(p=>p==='/api/commerce/cart').length,0);
  await page.locator('.footer-column a[href="/privacy-policy"]').click();await page.locator('main h1').waitFor();await page.waitForTimeout(100);
  assert.equal(calls.filter(p=>p==='/api/store/settings').length,1);
  await page.locator('.brand-link').click();await page.locator('.qc-category-card').waitFor();
  await page.locator('.desktop-links a[href="/shop"]').click();await page.locator('.shop-controls select').waitFor();
  assert.equal(calls.filter(p=>p==='/api/catalog/categories').length,1);
});
test('Home distinguishes failed collection reads from an empty collection and can retry',async t=>{
  let broken=true;
  const {page}=await pageFor(t,{handler:(_r,u)=>u.pathname.endsWith('/catalog/categories')&&broken?{status:503,json:{error:'Unavailable'}}:undefined});
  await page.locator('#categories [role=alert]').waitFor();assert.equal(await page.locator('#categories .category-teaser').count(),0);
  broken=false;await page.locator('#categories button').click();await page.locator('#categories .qc-category-card').waitFor();
});
test('unreadable Shop responses show an error with retry rather than fabricated results',async t=>{
  let broken=true;
  const {page}=await pageFor(t,{path:'/shop',handler:(_r,u)=>u.pathname==='/api/catalog/products'&&broken?{body:'not JSON',contentType:'text/html'}:undefined});
  await page.locator('.shop-results [role=alert]').waitFor();assert.match(await page.locator('.shop-count').textContent(),/—/);
  broken=false;await page.locator('.shop-results [role=alert] button').click();await page.locator('.shop-empty').waitFor();
  await page.locator('input[type=search]').focus();assert.equal(await page.locator('.shop-search').evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
});

test('abandoned Shop reads are cancelled and cannot replace newer filter results',async t=>{
  let release;
  const failed=[];
  const {page}=await pageFor(t,{path:'/shop?q=slow',width:1440,
    handler:(_r,u)=>u.pathname==='/api/catalog/products'&&u.searchParams.get('q')==='slow'?new Promise(resolve=>{release=()=>resolve({json:{items:[fixtureProduct],pagination:{page:1,pages:1,total:1}}})}):undefined,
    setup:(_context,p)=>p.on('requestfailed',request=>failed.push(request.url()))});
  await page.waitForFunction(()=>document.querySelector('.shop-search input'));
  await page.locator('input[type=search]').fill('fresh');await page.locator('.shop-search button').click();
  await page.locator('.shop-empty').waitFor();assert.ok(release);release();await page.waitForTimeout(100);
  assert.equal(await page.locator('.shop-empty').count(),1);assert.match(await page.locator('.shop-count').textContent(),/^0 /);
  assert.ok(failed.some(url=>url.includes('q=slow')),'superseded network request was aborted');
});
test('missing product images use a stable honest fallback without retry loops',async t=>{
  let release;
  const {page}=await pageFor(t,{path:'/products/test-coffee',handler:(_r,u)=>u.pathname.endsWith('/catalog/products/test-coffee')?{json:{product:{...fixtureProduct,imageUrls:['/missing-product.webp'],status:'published'}}}:undefined,
    setup:context=>context.route('**/missing-product.webp',route=>new Promise(resolve=>{release=()=>{resolve(route.fulfill({status:404,body:''}))}}))});
  await page.locator('.qc-product-primary img').waitFor();const before=await page.locator('.qc-product-primary').boundingBox();release();
  await page.locator('.qc-product-primary .qc-image-fallback').waitFor();const after=await page.locator('.qc-product-primary').boundingBox();
  assert.ok(Math.abs(before.height-after.height)<1);assert.equal(await page.locator('.qc-product-primary img').count(),0);
});
test('admin reads are scoped to their tab and independent panel refresh does not refetch finance',async t=>{
  const {page,calls}=await pageFor(t,{path:'/admin?tab=categories',role:'admin',width:1440});await page.locator('.qc-admin-list-item').waitFor();
  assert.equal(calls.filter(p=>p.startsWith('/api/admin/catalog/products')).length,0);
  await page.locator('.qc-admin-tabs button').first().click();await page.locator('.qc-overview-metric').first().waitFor();await page.locator('.qc-operations-counts').waitFor();
  const finance=calls.filter(p=>p.startsWith('/api/admin/overview?')).length,operations=calls.filter(p=>p==='/api/admin/overview/operations').length;
  await page.getByRole('button',{name:'Refresh operational health',exact:true}).click();await page.locator('.qc-operations-counts').waitFor();
  assert.equal(calls.filter(p=>p.startsWith('/api/admin/overview?')).length,finance);assert.equal(calls.filter(p=>p==='/api/admin/overview/operations').length,operations+1);
  await page.locator('.qc-overview-periods button').nth(1).click();await page.locator('.qc-overview-metric').first().waitFor();
  assert.equal(calls.filter(p=>p==='/api/admin/overview/operations').length,operations+1);
});
test('private module code is absent on Home and reduced motion does not load ScrollTrigger',async t=>{
  const {page}=await pageFor(t,{reducedMotion:'reduce'});await page.locator('.hero h1').waitFor();
  const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name).join('\n'));
  assert.doesNotMatch(resources,/CatalogAdmin|AdminOverview|AdminOrders|StoreSettingsAdmin|MediaEditor|ScrollTrigger/);
  assert.equal(await page.locator('.qc-announcement-control').isVisible(),false);
});
test('a failed route chunk keeps the shell usable and offers explicit reload recovery',async t=>{
  let broken=true;
  const {page}=await pageFor(t,{path:'/about',width:1440,setup:context=>context.route('**/*ShopPage*',route=>broken?route.abort():route.continue())});
  await page.locator('main h1').waitFor();await page.locator('.desktop-links a[href="/shop"]').click();
  await page.locator('.qc-route-error').waitFor();assert.equal(await page.locator('.brand-link').isVisible(),true);assert.equal(await page.locator('.qc-floating-language').isVisible(),true);
  broken=false;await page.getByRole('button',{name:'Reload this page',exact:true}).click();await page.locator('.shop-search').waitFor();
});
