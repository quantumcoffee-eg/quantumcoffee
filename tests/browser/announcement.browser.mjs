// Production-build regression: real tab zoom, measured layout and text bounds.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const origin = process.env.QC_BROWSER_URL || 'http://127.0.0.1:5175';
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const phase = process.env.QC_ANNOUNCEMENT_PHASE || 'after';
assert.ok(['before','after'].includes(phase));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
mkdirSync(resolve('.playwright'),{recursive:true});
const browser = await chromium.launch({ headless:true, executablePath });
const results = []; let zoomContext;
after(async () => {
  writeFileSync(`.playwright/announcement-${phase}-geometry.json`, JSON.stringify(results,null,2));
  await zoomContext?.close(); await browser.close();
});
async function offline(context) {
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/api/')) return route.fulfill({ json: u.pathname.endsWith('/auth/me') ? { user:null } : { settings:{contact:{},policies:{}} } });
    if (process.env.QC_ANNOUNCEMENT_FONTS === 'live' && ['fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname)) return route.continue();
    return u.origin === origin ? route.continue() : route.abort();
  });
}
async function zoomBrowser() {
  if (zoomContext) return zoomContext;
  const extension = resolve('.playwright/announcement-zoom-extension'); mkdirSync(extension,{recursive:true});
  writeFileSync(resolve(extension,'manifest.json'), JSON.stringify({ manifest_version:3, name:'Offline announcement zoom test', version:'1.0', permissions:['tabs'], background:{service_worker:'background.js'} }));
  writeFileSync(resolve(extension,'background.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
  zoomContext = await chromium.launchPersistentContext('', { headless:true, executablePath, reducedMotion:'reduce', ignoreDefaultArgs:['--disable-extensions'], args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`] });
  await offline(zoomContext); return zoomContext;
}
for (const enlarged of [false,true]) for (const zoom of [1,2]) for (const width of [320,390]) for (const lang of ['en','ar']) {
  test(`static announcement fits: ${lang}, ${width}px CSS viewport, ${zoom*100}% browser zoom${enlarged ? ', 200% text-size reflow' : ''}`, async t => {
    const context = zoom === 2 ? await zoomBrowser() : await browser.newContext({ viewport:{width,height:844}, reducedMotion:'reduce' });
    if (zoom === 1) { await offline(context); t.after(() => context.close()); }
    const page = await context.newPage(); if (zoom === 2) t.after(() => page.close());
    await page.setViewportSize({width,height:844}); await page.goto(origin + (lang === 'ar' ? '/ar/about' : '/about'));
    await page.locator('main h1').waitFor();
    if (zoom === 2) {
      const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:8000});
      const actualZoom = await worker.evaluate(async url => {
        const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
        await chrome.tabs.setZoom(tab.id,2); return chrome.tabs.getZoom(tab.id);
      }, page.url());
      assert.equal(actualZoom,2);
      // Device emulation and browser zoom use different coordinate spaces.
      // Adjust the emulated bounds until the *observed* CSS viewport is exact.
      for (let i=0;i<3;i++) {
        const observed = await page.evaluate(() => innerWidth);
        if (observed === width) break;
        await page.setViewportSize({width:Math.round(page.viewportSize().width*width/observed),height:844});
      }
      assert.equal(await page.evaluate(() => devicePixelRatio),2);
    }
    await page.evaluate(() => document.fonts.ready);
    if (enlarged) {
      // Exercise the wrapping contract even when today's short copy fits on
      // one line. Preserve its words; simulate enlarged accessible text.
      await page.locator('.qc-announcement-sr-only').evaluate(text => { text.style.fontSize = `${parseFloat(getComputedStyle(text).fontSize)*2}px`; });
    }
    const geometry = await page.locator('.announcement').evaluate(bar => {
      const text = bar.querySelector('.qc-announcement-sr-only'), rect = bar.getBoundingClientRect(), style = getComputedStyle(bar);
      const box = text.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(text);
      const clip = { left:rect.left+parseFloat(style.borderLeftWidth), right:rect.right-parseFloat(style.borderRightWidth), top:rect.top+parseFloat(style.borderTopWidth), bottom:rect.bottom-parseFloat(style.borderBottomWidth) };
      return { viewport:innerWidth, dpr:devicePixelRatio, contain:style.contain, bar:rect.toJSON(), clip, text:box.toJSON(), lines:[...range.getClientRects()].map(r=>r.toJSON()), copy:text.textContent, font:getComputedStyle(text).fontFamily, loadedFonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family), textPosition:getComputedStyle(text).position, animation:getComputedStyle(bar.querySelector('.qc-announcement-track')).animationName };
    });
    results.push({lang,width,zoom,enlarged,...geometry});
    assert.equal(geometry.viewport,width); assert.equal(geometry.textPosition,'static'); assert.equal(geometry.animation,'none');
    assert.ok(geometry.copy.trim()); assert.ok(geometry.lines.length);
    for (const box of [geometry.text,...geometry.lines]) {
      for (const edge of ['left','top']) assert.ok(box[edge]>=geometry.clip[edge]-.25,`${edge} clipped: ${JSON.stringify(geometry)}`);
      for (const edge of ['right','bottom']) assert.ok(box[edge]<=geometry.clip[edge]+.25,`${edge} clipped: ${JSON.stringify(geometry)}`);
    }
    assert.equal(await page.locator('.qc-announcement-control').isVisible(),false);
  });
}
test('normal motion retains strict containment and its continuous animation', async t => {
  const context = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference'}); t.after(()=>context.close()); await offline(context);
  const page = await context.newPage(); await page.goto(origin+'/about'); await page.locator('main h1').waitFor();
  const styles = await page.locator('.announcement').evaluate(bar=>({contain:getComputedStyle(bar).contain,height:bar.getBoundingClientRect().height,animation:getComputedStyle(bar.querySelector('.qc-announcement-track')).animationName}));
  assert.equal(styles.contain,'strict'); assert.equal(styles.height,29); assert.equal(styles.animation,'qc-announcement-scroll');
});
