// Targeted DOM/keyboard/contrast checks; not an axe or WCAG certification.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { adminFixtureResponse, fixtureCategory, fixtureProduct } from '../tests/browser/overview-fixtures.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phase = process.argv[2] || 'after';
if (!['before','after'].includes(phase)) throw new Error('Invalid phase.');
const build = path.join(root, phase === 'before' ? '.playwright/d1-baseline-dist' : 'client/dist');
const server = http.createServer((req, res) => {
  let file = path.resolve(build, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(build + path.sep)) file = path.join(build, 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(build, 'index.html');
  res.setHeader('Content-Type', ({ '.js':'text/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml' })[path.extname(file)] || 'text/html'); res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`, require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const rows = [];
try {
  for (const width of [320,390,768,1440]) for (const route of ['/','/shop','/products/test-coffee','/login','/admin','/admin?tab=products','/ar/admin?tab=settings']) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await page.addInitScript(() => { window.__shifts = []; new PerformanceObserver(list => list.getEntries().filter(e => !e.hadRecentInput).forEach(e => window.__shifts.push({ value:e.value, nodes:e.sources?.map(s => ({ node:s.node?.tagName + '.' + s.node?.className, before:s.previousRect.toJSON(), after:s.currentRect.toJSON() })) }))).observe({type:'layout-shift',buffered:true}); });
    await page.route('**/*', async intercepted => {
      const u = new URL(intercepted.request().url());
      if (u.pathname.startsWith('/api/')) {
        await new Promise(resolve => setTimeout(resolve, 100));
        let json;
        if (u.pathname.endsWith('/auth/me')) json = { user: route.includes('/admin') ? { role:'admin', email:'test@example.invalid' } : null };
        else if (u.pathname.startsWith('/api/admin/')) return intercepted.fulfill(adminFixtureResponse(intercepted.request(), u) || {json:{}});
        else if (u.pathname.endsWith('/catalog/categories')) json = {categories:[fixtureCategory]};
        else if (u.pathname.endsWith('/catalog/products/test-coffee')) json = {product:{...fixtureProduct,status:'published'}};
        else if (u.pathname.includes('/catalog/products')) json = {items:[fixtureProduct],pagination:{page:1,pages:1,total:1}};
        else json = {settings:{contact:{}}};
        return intercepted.fulfill({json});
      }
      if (u.origin !== origin) return intercepted.abort();
      return intercepted.continue();
    });
    await page.goto(origin + route);
    const ready = route.includes('settings') ? '.qc-admin-form' : route.includes('tab=products') ? '.qc-admin-list-item' : route === '/admin' ? '.qc-overview-metric' : route.startsWith('/products/') ? '.qc-product-summary' : route === '/shop' ? '.qc-product-card' : route === '/login' ? 'input[type=password]' : '.qc-category-card';
    await page.waitForSelector(ready); await page.waitForTimeout(500);
    if (phase === 'after' && ((width === 390 && route === '/') || (width === 1440 && route === '/admin') || (width === 390 && route.includes('settings')))) await page.screenshot({ path: path.join(root, `.playwright/d1-${width}-${route === '/' ? 'home' : route === '/admin' ? 'overview' : 'arabic-settings'}.png`) });
    const cdp = await page.context().newCDPSession(page), ax = await cdp.send('Accessibility.getFullAXTree');
    const unnamed = ax.nodes.filter(n => !n.ignored && ['button','textbox','combobox','checkbox','spinbutton','link'].includes(n.role?.value) && !n.name?.value).map(n => n.role.value);
    const data = await page.evaluate(() => {
      const visible = e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && !e.closest('[inert],[aria-hidden="true"]');
      const color = str => str.match(/[\d.]+/g)?.map(Number);
      const luminance = rgb => rgb.slice(0,3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum,v,i) => sum + v * [.2126,.7152,.0722][i], 0);
      const contrast = [];
      for (const el of [...document.querySelectorAll('p,label,h1,h2,h3,button,summary,a')].filter(visible)) {
        const style = getComputedStyle(el); let ancestor = el, bg = null, complex = false;
        while (ancestor) { const s = getComputedStyle(ancestor); if(s.backgroundImage !== 'none') {complex=true;break;} const rgba=color(s.backgroundColor); if(rgba && (rgba[3]??1)===1) {bg=rgba;break;} if(rgba && rgba[3]>0) {complex=true;break;} ancestor=ancestor.parentElement; }
        const fg = color(style.color); if(complex || !bg || !fg || (fg[3]??1)!==1) continue;
        const a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05), min=parseFloat(style.fontSize)>=24 || (parseFloat(style.fontSize)>=18.66 && Number(style.fontWeight)>=700) ? 3 : 4.5;
        if(ratio < min) contrast.push({tag:el.tagName,class:el.className,text:el.textContent.trim().slice(0,50),ratio:+ratio.toFixed(2),min});
      }
      return { overflow:document.documentElement.scrollWidth>innerWidth, skipLink:!!document.querySelector('a[href="#main-content"]'),
        imagesWithoutDimensions:[...document.images].filter(visible).filter(e=>!e.hasAttribute('width')||!e.hasAttribute('height')).map(e=>e.className||e.parentElement.className),
        smallControls:[...document.querySelectorAll('button,input,select')].filter(visible).map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim().slice(0,30),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})).filter(e=>e.width<24||e.height<24), contrast,
        shifts:window.__shifts, movingMarquee:getComputedStyle(document.querySelector('.qc-announcement-track')).animationName };
    });
    let searchFocus;
    if(route==='/shop') { await page.locator('input[type=search]').focus(); searchFocus=await page.locator('input[type=search]').evaluate(e=>({outline:getComputedStyle(e).outlineStyle,outlineWidth:getComputedStyle(e).outlineWidth,shadow:getComputedStyle(e).boxShadow,containerOutline:getComputedStyle(e.closest('form')).outlineStyle})); }
    rows.push({width,route,unnamed,...data,searchFocus}); await page.close();
  }
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
fs.writeFileSync(path.join(root,`.playwright/d1-a11y-${phase}.json`),JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows.map(({width,route,unnamed,overflow,skipLink,smallControls,contrast,searchFocus})=>({width,route,unnamed,overflow,skipLink,small:smallControls.length,contrast:contrast.slice(0,4),searchFocus})),null,2));
if (phase === 'after') {
  const failures = rows.filter(row => row.overflow || row.unnamed.length || !row.skipLink || row.imagesWithoutDimensions.length || row.contrast.length || (row.searchFocus && row.searchFocus.containerOutline !== 'solid'));
  console.log(`Targeted audit: ${rows.length - failures.length}/${rows.length} route/viewport cases passed. This is not a complete WCAG audit.`);
  if (failures.length) process.exitCode = 1;
}
