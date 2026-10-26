// Offline production-build lab. No backend, credentials or external resources.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { fixtureProduct, fixtureCategory, fixtureOrder, adminFixtureResponse } from '../tests/browser/overview-fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phase = process.argv[2] || 'after';
if (!['before', 'after'].includes(phase)) throw new Error('Use before or after.');
const build = path.join(root, phase === 'before' ? '.playwright/d1-baseline-dist' : 'client/dist');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  let file = path.resolve(build, `.${pathname}`);
  if (!file.startsWith(build + path.sep) && file !== build) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(build, 'index.html');
  const extension = path.extname(file), bytes = fs.readFileSync(file);
  const compressed = ['.js','.css','.html','.svg'].includes(extension);
  const body = compressed ? gzipSync(bytes) : bytes;
  res.writeHead(200, { 'Content-Type': mime[extension] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Length': body.length, ...(compressed ? { 'Content-Encoding': 'gzip' } : {}) }); res.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const results = [], product = { ...fixtureProduct, status: 'published', stockQuantity: 5, sizes: [{ grams: 250, pricePiastres: 10000, grindOptions: [{ code: 'espresso', stockQuantity: 5 }] }] };
const cases = [['home','/','guest'],['shop','/shop','guest'],['product','/products/test-coffee','guest'],['cart','/cart','guest'],['login','/login','guest'],['account','/account','customer'],['overview','/admin','admin'],['orders','/admin?tab=orders','admin'],['products','/admin?tab=products','admin'],['categories','/admin?tab=categories','admin'],['settings','/admin?tab=settings','admin']];
const selected = process.argv[3]?.split(',');
if (selected?.some(name => !cases.some(row => row[0] === name))) throw new Error('Unknown case.');
try {
  for (const mobile of [false, true]) for (const [name, route, role] of cases.filter(row => !selected || selected.includes(row[0]))) for (let repeat = 0; repeat < (['home','shop','product','overview'].includes(name) ? 3 : 1); repeat++) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
    const page = await context.newPage(), apiCalls = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__lab = { lcp: 0, shifts: [], longTasks: [], events: [] };
      for (const [type, callback] of [
        ['largest-contentful-paint', entries => entries.forEach(e => { window.__lab.lcp = e.startTime; window.__lab.lcpElement = e.element?.tagName; })],
        ['layout-shift', entries => entries.filter(e => !e.hadRecentInput).forEach(e => window.__lab.shifts.push({ at: e.startTime, value: e.value }))],
        ['longtask', entries => entries.forEach(e => window.__lab.longTasks.push(e.duration))],
        ['event', entries => entries.forEach(e => window.__lab.events.push(e.duration))],
      ]) try { new PerformanceObserver(list => callback(list.getEntries())).observe({ type, buffered: true, ...(type === 'event' ? { durationThreshold: 16 } : {}) }); } catch { /* Unsupported metric is absent. */ }
    });
    await context.route('**/*', async intercepted => {
      const request = intercepted.request(), u = new URL(request.url());
      if (u.pathname.startsWith('/api/')) {
        apiCalls.push(u.pathname + u.search); await new Promise(resolve => setTimeout(resolve, 100));
        let json;
        if (u.pathname.endsWith('/auth/me')) json = { user: role === 'guest' ? null : { role, name: 'Offline lab', email: 'lab@example.invalid' } };
        else if (u.pathname.startsWith('/api/admin/')) return intercepted.fulfill(adminFixtureResponse(request, u) || { json: { items: [], pagination: { page: 1, pages: 1, total: 0 } } });
        else if (u.pathname.endsWith('/catalog/categories')) json = { categories: [fixtureCategory] };
        else if (u.pathname.endsWith('/catalog/products/test-coffee')) json = { product };
        else if (u.pathname.includes('/catalog/products')) json = { items: [product], pagination: { page: 1, pages: 1, total: 1 } };
        else if (u.pathname.endsWith('/commerce/cart')) json = { items: [] };
        else if (u.pathname.endsWith('/commerce/config')) json = { checkoutEnabled: false, paymentMethods: [] };
        else if (u.pathname.endsWith('/store/settings')) json = { settings: { contact: {}, policies: {} } };
        else if (u.pathname.endsWith('/commerce/my-orders')) json = { items: [fixtureOrder] };
        else json = {};
        return intercepted.fulfill({ json });
      }
      if (u.origin !== origin) return intercepted.abort();
      return intercepted.continue();
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: mobile ? 150 : 20, downloadThroughput: (mobile ? 1.6 : 10) * 1000000 / 8, uploadThroughput: 750000 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: mobile ? 4 : 1 });
    await page.goto(origin + route, { waitUntil: 'load' });
    await page.waitForSelector('main'); await page.waitForTimeout(3000);
    const initial = await page.evaluate(() => {
      let max = 0, current = 0, start = 0, previous = 0;
      for (const shift of window.__lab.shifts) { if (shift.at - previous > 1000 || shift.at - start > 5000) { current = 0; start = shift.at; } current += shift.value; max = Math.max(max, current); previous = shift.at; }
      const resources = performance.getEntriesByType('resource').filter(row => /\.js(?:\?|$)/.test(row.name));
      return { ...window.__lab, cls: max, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
        jsEncoded: resources.reduce((n, r) => n + r.encodedBodySize, 0), jsDecoded: resources.reduce((n, r) => n + r.decodedBodySize, 0), jsFiles: resources.map(r => new URL(r.name).pathname),
        hero: document.querySelector('.hero-media-image')?.currentSrc?.split('/').at(-1), overflow: document.documentElement.scrollWidth > innerWidth };
    });
    const initialCalls = [...apiCalls];
    const start = performance.now(); await page.locator('.qc-floating-language').click(); await page.waitForFunction(() => document.documentElement.lang === 'ar');
    const languageInteractionMs = performance.now() - start;
    await page.waitForTimeout(200);
    const maxEventMs = await page.evaluate(() => Math.max(0, ...window.__lab.events));
    let journey;
    if (name === 'home' && repeat === 0) {
      const go = async label => {
        if (mobile) await page.locator('.mobile-menu').click();
        await page.locator(mobile ? '.mobile-drawer nav a' : '.desktop-links a').nth(label === 'shop' ? 1 : 0).click();
        await page.waitForSelector(label === 'shop' ? '.shop-page h1' : '.hero h1');
      };
      const transition = performance.now(); await go('shop'); const transitionMs = performance.now() - transition;
      await page.waitForTimeout(350); await go('home'); await page.waitForTimeout(350); await go('shop'); await page.waitForTimeout(350);
      journey = { transitionMs, apiCalls: [...apiCalls] };
    }
    results.push({ device: mobile ? 'mobile' : 'desktop', name, route, repeat, ...initial, apiCalls: initialCalls, languageInteractionMs, maxEventMs, journey, errors });
    console.log(`${phase} ${mobile ? 'mobile' : 'desktop'} ${name} #${repeat + 1}: JS ${initial.jsEncoded}B gzip / ${initial.jsDecoded}B decoded, LCP ${Math.round(initial.lcp)}ms, CLS ${initial.cls.toFixed(4)}, API ${initialCalls.length}`);
    await context.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
const assets = fs.readdirSync(path.join(build, 'assets')).filter(file => file.endsWith('.js')).map(file => { const buffer = fs.readFileSync(path.join(build, 'assets', file)); return { file, bytes: buffer.length, gzip: gzipSync(buffer).length }; });
fs.writeFileSync(path.join(root, `.playwright/d1-${phase}${selected ? '-' + selected.join('-') : ''}.json`), JSON.stringify({ phase, settings: { gzip: true, coldCache: true, apiFixtureDelayMs: 100, desktop: { viewport: '1440x900', cpu: 1, mbps: 10, latencyMs: 20 }, mobile: { viewport: '390x844', cpu: 4, mbps: 1.6, latencyMs: 150 }, primaryRepeats: 3, others: 1, settleMs: 3000 }, assets, results }, null, 2));
