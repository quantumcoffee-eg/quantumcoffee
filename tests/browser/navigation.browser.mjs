// Offline browser regressions. All APIs are fulfilled in memory; external traffic
// is blocked. Run against local Vite only; see UI_REPAIR_REPORT_2026-10-26.md.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { overviewFixture, adminFixtureResponse, fixtureId } from './overview-fixtures.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const origin = process.env.QC_BROWSER_URL || 'http://127.0.0.1:5174';
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin), 'Browser tests require a loopback frontend');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
});
after(() => browser.close());

// Deliberately synthetic fixtures, never sent to a backend or stored in a DB.
const category = { _id: '507f1f77bcf86cd799439012', slug: 'browser-fixture', name: { en: 'Browser fixture category', ar: 'فئة الاختبار' }, active: true };
const product = {
  _id: '507f1f77bcf86cd799439011', revision: 1, slug: 'browser-fixture',
  name: { en: 'Browser fixture coffee', ar: 'قهوة الاختبار' }, description: { en: 'Offline fixture', ar: 'اختبار محلي' },
  categoryId: category._id, status: 'published', pricePiastres: 10000, stockQuantity: 4,
  imageKeys: ['fixture-one', 'fixture-two'], imageUrls: ['/quantum-logo-light.webp', '/quantum-logo-light.webp?two'],
  sizes: [
    { grams: 250, pricePiastres: 10000, grindOptions: [{ code: 'espresso', stockQuantity: 0 }] },
    { grams: 500, pricePiastres: 20000, grindOptions: [{ code: 'espresso', stockQuantity: 4 }] },
  ],
};

async function pageFor(t, { width = 1440, lang = 'en', path = '/about', role = 'guest', reducedMotion = 'no-preference', catalog = false, apiHandler } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
  t.after(() => context.close());
  const errors = [];
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, [], 'No browser runtime errors'));
  await context.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.pathname.includes('/api/')) {
      const custom = await apiHandler?.(route.request(), u);
      if (custom) return route.fulfill(custom);
      const json = u.pathname.endsWith('/auth/me') ? { user: role === 'guest' ? null : { role, email: 'browser-test@example.invalid', name: 'Browser fixture' } }
        : u.pathname === '/api/admin/overview' ? { overview: overviewFixture(u.searchParams.get('range') || '30d') }
        : u.pathname.endsWith('/store/settings') ? { settings: { contact: {} } }
          : u.pathname.endsWith('/commerce/config') ? { checkoutEnabled: false, paymentMethods: [] }
            : u.pathname.includes('categories') ? { categories: catalog ? [category] : [] }
              : /\/catalog\/products\/[^/]+$/.test(u.pathname) ? { product: { ...product, slug: u.pathname.split('/').pop() } }
                : u.pathname.includes('/catalog/products') ? { items: catalog ? [product] : [], pagination: { page: 1, pages: 1, total: catalog ? 1 : 0 } }
                  : { items: [], pagination: { page: 1, pages: 1, total: 0 } };
      return route.fulfill({ json });
    }
    if (u.origin !== origin) return route.abort();
    return route.continue();
  });
  await page.goto(`${origin}${lang === 'ar' ? '/ar' : ''}${path === '/' && lang === 'ar' ? '' : path}`);
  await page.locator('.brand-link').waitFor();
  await page.waitForFunction(() => document.documentElement.lang === (document.location.pathname.startsWith('/ar') ? 'ar' : 'en'));
  return page;
}

async function at(page, path) {
  await page.waitForURL(`${origin}${path}`);
  assert.equal(new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash, path);
}

test('header logo on About has a real home URL and receives a real click', async t => {
  const p = await pageFor(t);
  assert.equal(await p.locator('.brand-link').getAttribute('href'), '/');
  assert.ok(await p.locator('.brand-link').evaluate(e => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }));
  await p.locator('.brand-link').click();
  await at(p, '/');
});

test('only About is active on About', async t => {
  const p = await pageFor(t);
  assert.deepEqual(await p.locator('.desktop-links [aria-current="page"]').allTextContents(), ['About Us']);
});

test('footer logo returns home', async t => {
  const p = await pageFor(t);
  await p.locator('.qc-footer-logo-link').click();
  await at(p, '/');
  await p.waitForFunction(() => window.scrollY === 0);
});

test('mobile language changes keep hamburger position stable and close the menu', async t => {
  const p = await pageFor(t, { width: 390 });
  const start = await p.locator('.mobile-menu').boundingBox();
  for (const destination of ['/ar/about', '/about']) {
    await p.locator('.mobile-menu').click();
    await p.locator('.drawer-language').click();
    await at(p, destination);
    for (let i = 0; i < 12; i++) {
      const box = await p.locator('.mobile-menu').boundingBox();
      assert.ok(Math.abs(box.x - start.x) < 1, 'hamburger must not cross the viewport');
      const drawer = await p.locator('.mobile-drawer').boundingBox();
      assert.ok(drawer.x <= 1, 'closing drawer must continue toward its original left edge');
      await p.waitForTimeout(30);
    }
    assert.equal(await p.locator('.mobile-menu').getAttribute('aria-expanded'), 'false');
    assert.equal(await p.evaluate(() => document.body.style.overflow), '');
  }
});

test('Arabic marquee covers the viewport throughout its cycle', async t => {
  const p = await pageFor(t, { width: 390, lang: 'ar' });
  const gaps = await p.locator('.announcement').evaluate(viewport => {
    const track = viewport.querySelector('.qc-announcement-track');
    const animation = track.getAnimations()[0];
    animation.pause();
    const duration = animation.effect.getTiming().duration;
    return [0, 0.25, 0.5, 0.75, 0.99999, 1].filter(fraction => {
      animation.currentTime = fraction * duration;
      const v = viewport.getBoundingClientRect(), r = track.getBoundingClientRect();
      return r.left > v.left + 1 || r.right < v.right - 1;
    });
  });
  assert.deepEqual(gaps, [], 'track must cover both edges at every sampled animation phase');
});

const local = (lang, path = '/') => lang === 'ar' ? `/ar${path === '/' ? '' : path}` : path;
async function navClick(p, width, index) {
  if (width <= 900) {
    await p.locator('.mobile-menu').click();
    await p.locator('.mobile-drawer nav a').nth(index).click();
    assert.equal(await p.locator('.mobile-menu').getAttribute('aria-expanded'), 'false');
  } else await p.locator('.desktop-links a').nth(index).click();
}

for (const lang of ['en', 'ar']) {
  for (const width of [1440, 390]) {
    test(`${lang} ${width}: navigation links, repeated selections and active states`, async t => {
      const p = await pageFor(t, { lang, width });
      const paths = ['/', '/shop', '/about', '/track-order'];
      for (const index of [0, 1, 1, 2, 2, 3, 0]) {
        await navClick(p, width, index);
        await at(p, local(lang, paths[index]));
        const scope = width <= 900 ? '.mobile-drawer nav' : '.desktop-links';
        await p.waitForFunction(({ scope, href }) => document.querySelector(`${scope} [aria-current="page"]`)?.getAttribute('href') === href,
          { scope, href: local(lang, paths[index]) });
        assert.equal(await p.locator(`${scope} [aria-current="page"]`).count(), 1);
        assert.equal(await p.locator(`${scope} [aria-current="page"]`).getAttribute('href'), local(lang, paths[index]));
      }
    });

    test(`${lang} ${width}: logos from shop, product, cart, admin, error and About routes`, async t => {
      const p = await pageFor(t, { lang, width, role: 'admin' });
      for (const path of ['/shop', '/products/browser-fixture', '/cart', '/admin?tab=products', '/unknown-route', '/about']) {
        await p.goto(`${origin}${local(lang, path)}`);
        await p.locator('main').waitFor();
        assert.equal(await p.locator('.brand-link').getAttribute('href'), local(lang));
        await p.locator('.brand-link').click();
        await at(p, local(lang));
        await p.locator('#hero-title').waitFor();
      }
      await p.goto(`${origin}${local(lang, '/about')}`);
      await p.locator('.qc-footer-logo-link').click();
      await at(p, local(lang));
    });

    test(`${lang} ${width}: homepage logo smoothly returns to top without duplicate history`, async t => {
      const p = await pageFor(t, { lang, width, path: '/' });
      await p.evaluate(() => {
        window.__scrollCalls = [];
        const scroll = window.scrollTo.bind(window);
        window.scrollTo = (...args) => { window.__scrollCalls.push(args[0]); return scroll(...args); };
        window.scrollTo({ top: 400, behavior: 'instant' });
      });
      const historyLength = await p.evaluate(() => history.length);
      await p.locator('.brand-link').click();
      await p.waitForFunction(() => window.scrollY === 0);
      assert.ok(await p.evaluate(() => window.__scrollCalls.some(c => c.behavior === 'smooth' && c.top === 0)));
      await p.locator('.qc-footer-logo-link').click();
      await p.waitForFunction(() => window.scrollY === 0);
      assert.equal(await p.evaluate(() => history.length), historyLength);
      await at(p, local(lang));
    });
  }

  test(`${lang}: every footer link and Back to Home resolves correctly`, async t => {
    const p = await pageFor(t, { lang });
    for (const path of ['/', '/shop', '/about', '/track-order', '/shipping-policy', '/refund-policy', '/privacy-policy', '/terms']) {
      await p.locator(`.footer-column a[href="${local(lang, path)}"]`).click();
      await at(p, local(lang, path));
      await p.waitForFunction(() => scrollY === 0);
    }
    await p.goto(`${origin}${local(lang, '/about')}`);
    await p.locator('main .text-link').click();
    await at(p, local(lang));
  });

  test(`${lang}: Back/Forward restores scroll, and nested refresh loads`, async t => {
    const p = await pageFor(t, { lang, path: '/' });
    await p.locator(`.footer-column a[href="${local(lang, '/about')}"]`).evaluate(e => e.addEventListener('click', () => { window.__depth = scrollY; }, { once: true }));
    await p.locator(`.footer-column a[href="${local(lang, '/about')}"]`).click();
    await at(p, local(lang, '/about'));
    await p.waitForFunction(() => scrollY === 0);
    const depth = await p.evaluate(() => window.__depth);
    assert.ok(depth > 500);
    await p.goBack();
    await at(p, local(lang));
    await p.waitForFunction(y => Math.abs(scrollY - y) < 2, depth);
    await p.goForward();
    await at(p, local(lang, '/about'));
    await p.waitForFunction(() => scrollY === 0);
    for (const path of ['/about', '/shop?category=browser-fixture&sort=newest', '/products/browser-fixture']) {
      await p.goto(`${origin}${local(lang, path)}`);
      await p.reload();
      await at(p, local(lang, path));
      await p.locator('main h1').waitFor();
      assert.match(await p.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
    }
  });

  test(`${lang}: mobile dialog keyboard, backdrop, same-route close and breakpoint cleanup`, async t => {
    const p = await pageFor(t, { width: 375, lang });
    const toggle = p.locator('.mobile-menu'), drawer = p.locator('.mobile-drawer');
    await toggle.click();
    assert.equal(await p.evaluate(() => document.body.style.overflow), 'hidden');
    assert.equal(await p.locator('.drawer-top button').evaluate(e => e === document.activeElement), true);
    await p.keyboard.press('Shift+Tab');
    assert.equal(await p.locator('.drawer-language').evaluate(e => e === document.activeElement), true);
    await p.keyboard.press('Tab');
    assert.equal(await p.locator('.drawer-top button').evaluate(e => e === document.activeElement), true);
    await p.keyboard.press('Escape');
    assert.equal(await toggle.evaluate(e => e === document.activeElement), true);
    await toggle.click();
    await p.locator('.drawer-backdrop').click({ position: { x: 374, y: 500 } });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click();
    await p.locator('.mobile-drawer nav a').nth(2).click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await toggle.evaluate(e => e === document.activeElement), true);
    await toggle.click();
    await p.setViewportSize({ width: 1024, height: 900 });
    await p.waitForFunction(() => document.body.style.overflow !== 'hidden');
    assert.equal(await drawer.getAttribute('aria-hidden'), 'true');
  });

  test(`${lang}: language switch preserves shop filters, products, admin tab and fragment`, async t => {
    const p = await pageFor(t, { lang, role: 'admin' });
    const other = lang === 'ar' ? 'en' : 'ar';
    for (const path of ['/shop?category=browser-fixture&sort=newest#filters', '/products/browser-fixture', '/admin?tab=products', '/#categories']) {
      await p.goto(`${origin}${local(lang, path)}`);
      await p.locator('.qc-floating-language').click();
      const expected = other === 'ar' && path.startsWith('/#') ? `/ar${path.slice(1)}` : local(other, path);
      await at(p, expected);
      await p.waitForFunction(dir => document.documentElement.dir === dir, other === 'ar' ? 'rtl' : 'ltr');
      assert.equal(await p.locator('html').getAttribute('dir'), other === 'ar' ? 'rtl' : 'ltr');
      await p.locator('.footer-column').last().locator('a').first().click();
      const back = lang === 'ar' && path.startsWith('/#') ? `/ar${path.slice(1)}` : local(lang, path);
      await at(p, back);
    }
  });

  test(`${lang}: marquee resize, seamless boundary, RTL text and real time movement`, async t => {
    const p = await pageFor(t, { lang });
    for (const width of [320, 375, 768, 900, 901, 1024, 1440, 1920, 2560, 3440]) {
      await p.setViewportSize({ width, height: 900 });
      await p.waitForTimeout(80); // Let ResizeObserver update copy count.
      const geometry = await p.locator('.announcement').evaluate(viewport => {
        const track = viewport.querySelector('.qc-announcement-track');
        const groups = [...track.children];
        const animation = track.getAnimations()[0];
        animation.pause();
        const duration = animation.effect.getTiming().duration;
        const first = groups[0].getBoundingClientRect().width;
        const second = groups[1].getBoundingClientRect().width;
        const gaps = [];
        for (let i = 0; i <= 40; i++) {
          animation.currentTime = duration * i / 40;
          const v = viewport.getBoundingClientRect(), r = track.getBoundingClientRect();
          if (r.left > v.left + 1 || r.right < v.right - 1) gaps.push(i);
        }
        animation.currentTime = 0;
        const start = groups[0].getBoundingClientRect().left;
        animation.currentTime = duration - 0.001;
        const end = groups[1].getBoundingClientRect().left;
        animation.play();
        const phrase = track.querySelector('.qc-announcement-phrase');
        return { first, second, gaps, delta: Math.abs(start - end), viewport: viewport.clientWidth,
          height: viewport.clientHeight, phraseHeight: phrase.getBoundingClientRect().height,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          icons: [...track.querySelectorAll('svg')].slice(0, 4).map(e => e.getAttribute('class')),
          text: track.textContent, direction: track.querySelector('[dir]').dir };
      });
      assert.ok(Math.abs(geometry.first - geometry.second) < 0.1, 'group widths match within subpixel precision');
      assert.ok(geometry.first > geometry.viewport, `groups cover ${width}`);
      assert.deepEqual(geometry.gaps, [], `no gap at ${width}`);
      assert.ok(geometry.delta < 1, 'loop endpoints align');
      assert.ok(geometry.phraseHeight <= geometry.height, 'text is not vertically clipped');
      assert.equal(geometry.overflow, false, `no horizontal page overflow at ${width}`);
      assert.ok(geometry.icons[0] !== geometry.icons[1] && geometry.icons[0] !== geometry.icons[2]);
      assert.ok(!geometry.text.includes('✦'));
      assert.equal(geometry.direction, lang === 'ar' ? 'rtl' : 'ltr');
      if (width <= 900) {
        const box = await p.locator('.brand-link').boundingBox();
        assert.ok(Math.abs(box.x + box.width / 2 - width / 2) < 1, `mobile logo centered at ${width}`);
        const menu = await p.locator('.mobile-menu').boundingBox();
        const account = await p.locator('.header-actions a').first().boundingBox();
        const cart = await p.locator('.header-actions a').nth(1).boundingBox();
        assert.ok(menu.x + menu.width < box.x && box.x + box.width < account.x && cart.x + cart.width <= width,
          'mobile controls do not overlap the centered logo or viewport');
      }
    }
    const before = await p.locator('.qc-announcement-track').evaluate(e => e.getBoundingClientRect().x);
    await p.waitForTimeout(200);
    const after = await p.locator('.qc-announcement-track').evaluate(e => e.getBoundingClientRect().x);
    assert.ok(Math.abs(after - before) > 1, 'animation advances in real time');
  });

  test(`${lang}: reduced motion shows the full static announcement and immediate home scroll`, async t => {
    const p = await pageFor(t, { lang, width: 320, path: '/', reducedMotion: 'reduce' });
    assert.equal(await p.locator('.qc-announcement-track').isVisible(), false);
    assert.equal(await p.locator('.qc-announcement-sr-only').isVisible(), true);
    assert.equal(await p.locator('.announcement').evaluate(e => e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight), true);
    await p.evaluate(() => {
      window.__scrollCalls = [];
      const scroll = window.scrollTo.bind(window);
      window.scrollTo = (...args) => { window.__scrollCalls.push(args[0]); return scroll(...args); };
    });
    await p.locator('.qc-footer-logo-link').click();
    assert.equal(await p.evaluate(() => scrollY), 0);
    assert.ok(await p.evaluate(() => window.__scrollCalls.some(c => c.behavior === 'instant')));
  });
}

for (const role of ['guest', 'customer', 'admin']) {
  for (const lang of ['en', 'ar']) {
    test(`${role} ${lang}: account, cart and role-specific order links`, async t => {
      const p = await pageFor(t, { role, lang });
      const account = role === 'admin' ? '/admin' : role === 'customer' ? '/account' : '/login';
      const orders = role === 'customer' ? '/my-orders' : '/track-order';
      assert.equal(await p.locator('.desktop-links a').last().getAttribute('href'), local(lang, orders));
      assert.equal(await p.locator('.footer-column').first().locator('a').last().getAttribute('href'), local(lang, orders));
      await p.locator('.header-actions a').first().click();
      await at(p, local(lang, account));
      await p.locator('.header-actions a').nth(1).click();
      await at(p, local(lang, '/cart'));
      await p.setViewportSize({ width: 390, height: 900 });
      await p.locator('.header-actions a').first().click();
      await at(p, local(lang, account));
      await navClick(p, 390, 3);
      await at(p, local(lang, orders));
    });
  }
}

test('catalog links, chosen stock and cart additions remain usable', async t => {
  const p = await pageFor(t, { path: '/', catalog: true });
  await p.locator('.qc-category-card').click();
  await at(p, '/shop?category=browser-fixture');
  await p.locator('.qc-product-card').click();
  await at(p, '/products/browser-fixture');
  assert.equal(await p.getByLabel('Bag size').inputValue(), '500');
  assert.equal(await p.locator('.qc-availability').textContent(), 'In stock');
  await p.getByLabel('Bag size').selectOption('250');
  assert.equal(await p.locator('.qc-availability').textContent(), 'Out of stock');
  assert.equal(await p.getByRole('button', { name: 'Add to Cart' }).isEnabled(), false);
  await p.getByLabel('Bag size').selectOption('500');
  await p.getByRole('button', { name: 'Add to Cart' }).click();
  assert.match(await p.locator('main [role="status"]').textContent(), /Added to cart/);
  await p.locator('.brand-link').click();
  await at(p, '/');
  await p.locator('.qc-product-card').click();
  await p.locator('.qc-product-summary').waitFor();
  assert.equal(await p.locator('main [role="status"]').count(), 0, 'success notice resets on product remount');
});

test('admin media reorder preserves unsaved product edits and serializes price correctly', async t => {
  const mutations = [];
  const p = await pageFor(t, { role: 'admin', path: '/admin?tab=products', catalog: true,
    apiHandler(request, u) {
      if (request.method() !== 'PATCH') return;
      mutations.push({ path: u.pathname, body: request.postDataJSON() });
      return { json: { product: { ...product, revision: 2, imageKeys: ['fixture-two', 'fixture-one'], imageUrls: [...product.imageUrls].reverse() } } };
    },
  });
  await p.getByRole('button', { name: 'Edit', exact: true }).click();
  await p.getByLabel('Name (EN)', { exact: true }).fill('Unsaved browser edit');
  await p.getByLabel('Price (EGP)', { exact: true }).first().fill('123.45');
  await p.getByRole('button', { name: 'Move image later' }).first().click();
  await p.getByText('Gallery saved.', { exact: true }).waitFor();
  assert.equal(await p.getByLabel('Name (EN)', { exact: true }).inputValue(), 'Unsaved browser edit');
  assert.equal(await p.getByLabel('Price (EGP)', { exact: true }).first().inputValue(), '123.45');
  await p.getByRole('button', { name: 'Save product', exact: true }).click();
  await p.getByText('Product draft saved.', { exact: true }).waitFor();
  assert.equal(mutations.length, 2);
  assert.equal(mutations[1].body.name.en, 'Unsaved browser edit');
  assert.equal(mutations[1].body.sizes[0].pricePiastres, 12345);
  assert.equal(mutations[1].body.revision, 2);
});

test('query-only filters keep scroll and homepage links clear query/fragment smoothly', async t => {
  const p = await pageFor(t, { path: '/shop', catalog: true });
  await p.evaluate(() => scrollTo({ top: 100, behavior: 'instant' }));
  await p.locator('.shop-controls select').selectOption('newest');
  await at(p, '/shop?sort=newest');
  assert.ok(Math.abs(await p.evaluate(() => scrollY) - 100) < 2);
  for (const path of ['/?preview=1', '/#categories']) {
    await p.goto(`${origin}${path}`);
    await p.evaluate(() => {
      window.__scrollCalls = [];
      const scroll = window.scrollTo.bind(window);
      window.scrollTo = (...args) => { window.__scrollCalls.push(args[0]); return scroll(...args); };
    });
    await p.locator('.qc-footer-logo-link').click();
    await at(p, '/');
    await p.waitForFunction(() => scrollY === 0);
    assert.ok(await p.evaluate(() => window.__scrollCalls.some(c => c.behavior === 'smooth')));
  }
});

test('native Ctrl-click opens home in a new tab and keyboard focus stays visible', async t => {
  const p = await pageFor(t);
  await p.locator('.brand-link').focus();
  assert.ok(await p.locator('.brand-link').evaluate(e => e.matches(':focus-visible') && getComputedStyle(e).outlineStyle !== 'none'));
  const newTab = p.context().waitForEvent('page');
  await p.locator('.brand-link').click({ modifiers: ['Control'] });
  const popup = await newTab;
  await popup.waitForURL(`${origin}/`);
  await at(p, '/about');
});

for (const lang of ['en', 'ar']) {
  test(`${lang}: floating language toggle is fixed bottom-left, with a loaded flag, on public pages`, async t => {
    const p = await pageFor(t, { lang });
    const toggle = p.locator('.qc-floating-language');
    for (const width of [320, 390, 768, 1440]) {
      await p.setViewportSize({ width, height: 900 });
      const geometry = await toggle.evaluate(e => {
        const rect = e.getBoundingClientRect();
        const flag = e.querySelector('img');
        return { left: rect.left, bottom: innerHeight - rect.bottom, width: rect.width, height: rect.height,
          position: getComputedStyle(e).position, direction: getComputedStyle(e).direction,
          flagLoaded: flag.complete && flag.naturalWidth > 0,
          hit: e.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)) };
      });
      assert.equal(geometry.position, 'fixed');
      assert.equal(geometry.direction, 'ltr');
      assert.equal(geometry.left, 16);
      assert.equal(geometry.bottom, 16);
      assert.ok(geometry.width < 110 && geometry.height >= 44, 'compact control with a comfortable touch target');
      assert.equal(geometry.flagLoaded, true);
      assert.equal(geometry.hit, true, 'page content does not intercept the toggle');
    }
    for (const path of ['/', '/shop', '/about', '/products/browser-fixture', '/track-order', '/cart', '/checkout',
      '/shipping-policy', '/refund-policy', '/privacy-policy', '/terms', '/login', '/signup',
      '/forgot-password', '/resend-verification', '/verify-email', '/reset-password', '/unknown-route']) {
      await p.goto(`${origin}${local(lang, path)}`);
      await toggle.waitFor();
      assert.equal(await toggle.count(), 1);
      assert.equal((await toggle.textContent()).trim(), lang.toUpperCase());
      assert.equal(await toggle.locator('img').getAttribute('src'), `/flags/${lang === 'en' ? 'us' : 'eg'}.svg`);
      assert.equal(await p.locator('.site-header .lang-header').count(), 0);
    }
    await p.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    assert.equal((await toggle.boundingBox()).y, 840, 'control stays fixed after scrolling');
  });
}

test('floating toggle switches both languages by keyboard on mobile without moving header controls', async t => {
  const p = await pageFor(t, { width: 390, path: '/shop?sort=newest#filters' });
  const toggle = p.locator('.qc-floating-language');
  const before = await p.locator('.mobile-menu').boundingBox();
  await toggle.focus();
  assert.ok(await toggle.evaluate(e => e.matches(':focus-visible') && getComputedStyle(e).outlineStyle !== 'none'));
  await p.keyboard.press('Enter');
  await at(p, '/ar/shop?sort=newest#filters');
  await p.waitForFunction(() => document.querySelector('.qc-floating-language').textContent.trim() === 'AR');
  assert.equal(await toggle.locator('img').getAttribute('src'), '/flags/eg.svg');
  assert.equal((await p.locator('.mobile-menu').boundingBox()).x, before.x);
  await toggle.focus();
  await p.keyboard.press('Enter');
  await at(p, '/shop?sort=newest#filters');
  await p.waitForFunction(() => document.querySelector('.qc-floating-language').textContent.trim() === 'EN');
  assert.equal((await p.locator('.mobile-menu').boundingBox()).x, before.x);
});

for (const lang of ['en', 'ar']) {
  for (const width of [1440, 390, 320]) {
    test(`${lang} ${width}: admin defaults to Overview, responsive data and all existing tabs work`, async t => {
      const p = await pageFor(t, { lang, width, role: 'admin', path: '/admin', apiHandler: adminFixtureResponse });
      await p.locator('.qc-overview-metric').first().waitFor();
      assert.equal(await p.locator('.qc-admin-tabs [aria-current="page"]').textContent(), lang === 'ar' ? 'نظرة عامة' : 'Overview');
      assert.equal(await p.locator('.qc-overview-metric').count(), 4);
      assert.ok(await p.locator('.qc-overview-metric').first().textContent().then(value => value.includes('200') || value.includes('٢٠٠')));
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'dashboard does not overflow the viewport');
      assert.equal(await p.locator('.qc-floating-language').isVisible(), true);
      for (const [index, tab] of [[1, 'orders'], [2, 'products'], [3, 'categories'], [4, 'settings'], [0, 'overview']]) {
        await p.locator('.qc-admin-tabs button').nth(index).click();
        await at(p, local(lang, `/admin?tab=${tab}`));
        if (tab === 'overview') await p.locator('.qc-overview-metric').first().waitFor();
        else await p.locator('.qc-admin-panel').waitFor();
      }
    });
  }
  test(`${lang}: chart periods, recent order deep link, attention filters and exact product editor`, async t => {
    const requests = [];
    const p = await pageFor(t, { lang, role: 'admin', path: '/admin?tab=overview', apiHandler: (request, u) => { requests.push(u.pathname + u.search); return adminFixtureResponse(request, u); } });
    for (const [index, range] of ['today', '7d', '30d', '90d'].entries()) {
      await p.locator('.qc-overview-periods button').nth(index).click();
      await p.waitForFunction(() => document.querySelectorAll('.qc-overview-metric').length === 4);
      await p.locator('.qc-overview-daily summary').click();
      assert.equal(await p.locator('.qc-overview-daily tbody tr').count(), range === 'today' ? 1 : Number(range.slice(0, -1)));
      assert.ok(requests.includes(`/api/admin/overview?range=${range}`));
    }
    await p.locator('.qc-overview-panel table a').click();
    await at(p, local(lang, `/admin?tab=orders&order=${fixtureId}`));
    await p.locator('[aria-label="Order details"]').waitFor();
    assert.match(await p.locator('[aria-label="Order details"] h3').textContent(), /QC-ABCDEF123456/);
    await p.reload(); await p.locator('[aria-label="Order details"]').waitFor();
    await p.locator('[aria-label="Order details"] button').first().click();
    await at(p, local(lang, '/admin?tab=orders'));
    assert.ok(await p.locator('.qc-admin-panel h2').evaluate(e=>e===document.activeElement));
    await p.goBack(); await p.locator('[aria-label="Order details"]').waitFor();
    for (const queue of ['payment_reviews','confirmation','packing_shipping','unpaid_digital']) {
      await p.goto(`${origin}${local(lang, '/admin')}`);
      const response = p.waitForResponse(r => r.url().endsWith(`/api/admin/orders?page=1&queue=${queue}`));
      await p.locator(`.qc-overview-attention a[href$="queue=${queue}"]`).click();
      await at(p, local(lang, `/admin?tab=orders&queue=${queue}`));
      await response;
      assert.ok(requests.includes(`/api/admin/orders?page=1&queue=${queue}`));
    }
    await p.goto(`${origin}${local(lang, '/admin?tab=products&page=3')}`);
    await p.locator('.qc-admin-tabs button').first().click();
    const draftsResponse = p.waitForResponse(r => r.url().endsWith('/api/admin/catalog/products?page=1&status=draft'));
    await p.locator('.qc-overview-attention a[href$="status=draft"]').click();
    await at(p, local(lang, '/admin?tab=products&status=draft'));
    await draftsResponse;
    assert.ok(requests.includes('/api/admin/catalog/products?page=1&status=draft'));
    await p.goto(`${origin}${local(lang, '/admin')}`);
    await p.locator('#inventory-alerts a').click();
    await at(p, local(lang, `/admin?tab=products&product=${fixtureId}`));
    await p.getByRole('heading', { name: 'Edit product', exact: true }).waitFor();
    assert.equal(await p.getByLabel('Name (EN)', { exact: true }).inputValue(), 'Test coffee');
  });
}

test('overview has explicit loading, retry, error, zero-sales and denied-access states', async t => {
  let mode = 'loading', release;
  const gate = new Promise(resolve => { release = resolve; });
  const p = await pageFor(t, { role: 'admin', path: '/admin', apiHandler: async (_request, u) => {
    if (u.pathname !== '/api/admin/overview') return;
    if (mode === 'loading') await gate;
    if (mode === 'error') return { status: 503, json: { error: 'Overview temporarily unavailable' } };
    if (mode === 'denied') return { status: 403, json: { error: 'Access denied' } };
    return { json: { overview: overviewFixture(u.searchParams.get('range') || '30d') } };
  } });
  await p.getByRole('status').filter({ hasText: 'Loading overview' }).waitFor();
  assert.equal(await p.locator('.qc-overview-metric').count(), 0, 'no fabricated loading metrics');
  mode = 'error'; release();
  await p.getByRole('alert').filter({ hasText: 'Overview could not be loaded' }).waitFor();
  mode = 'empty'; await p.getByRole('button', { name: 'Try again' }).click();
  await p.getByText('No orders yet', { exact: true }).waitFor();
  assert.equal(await p.getByText('No collected payments in this period', { exact: true }).count(), 1);
  assert.match(await p.locator('.qc-overview-metric').nth(2).textContent(), /3/);
  assert.match(await p.locator('.qc-overview-metric').nth(3).textContent(), /1/);
  assert.match(await p.locator('.qc-overview-disclosure').textContent(), /unavailable/);
  mode = 'denied'; await p.getByRole('button', { name: 'Refresh overview', exact: true }).click();
  await p.getByRole('alert').filter({ hasText: 'administrator session' }).waitFor();
  assert.equal(await p.locator('.qc-overview-metric').count(), 0);
});

for (const role of ['guest', 'customer']) test(`${role}: admin route cannot load Overview analytics`, async t => {
  let analyticsCalls = 0;
  const p = await pageFor(t, { role, path: '/admin', apiHandler: (_request, u) => { if (u.pathname === '/api/admin/overview') analyticsCalls++; } });
  await at(p, role === 'guest' ? '/login' : '/account');
  assert.equal(await p.locator('.qc-overview').count(), 0);
  assert.equal(analyticsCalls, 0);
});
