import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localizedPath, isCurrentPath } from '../client/src/lib/navigation-values.mjs';
import { marqueeCopies, marqueeDurationSeconds } from '../client/src/components/announcement-values.mjs';
import { mergeMediaIntoDraft } from '../client/src/admin/media-draft.mjs';
import { addLine } from '../client/src/commerce/cart-values.mjs';
import { initialSelection, selectedStock } from '../client/src/pages/product-selection.mjs';
import { handleSamePageClick } from '../client/src/lib/navigation.js';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('language switch keeps filters, products, admin tabs and fragments', () => {
  assert.equal(localizedPath('/', '', '', 'en'), '/');
  assert.equal(localizedPath('/ar/', '', '', 'ar'), '/ar');
  assert.equal(localizedPath('/shop', '?category=coffee-blends&page=3', '#results', 'ar'), '/ar/shop?category=coffee-blends&page=3#results');
  assert.equal(localizedPath('/ar/admin', '?tab=products', '', 'en'), '/admin?tab=products');
  assert.equal(localizedPath('/ar/products/black-hole', '', '', 'en'), '/products/black-hole');
  assert.equal(localizedPath('/ar/', '', '#categories', 'en'), '/#categories');
  assert.equal(localizedPath('/', '', '', 'ar'), '/ar');
  assert.equal(isCurrentPath('/ar/', '/ar'), true);
  assert.equal(isCurrentPath('/ar/shop', '/shop'), false);
});

test('marquee copies cover the viewport with spare space, and move at constant speed', () => {
  for (const width of [320, 375, 1024, 1920, 3440, 7680]) {
    const count = marqueeCopies(width, 260);
    assert.ok(count * 260 > width, `${width} must be covered`);
    assert.ok(count >= 2);
    assert.ok(marqueeDurationSeconds(count, 260) >= 14);
  }
  assert.equal(marqueeCopies(0, 0), 2);
});

test('same-page scrolling preserves modified clicks and respects reduced motion', () => {
  const priorWindow = globalThis.window;
  const calls = [];
  let reduced = false;
  globalThis.window = { scrollTo: options => calls.push(options), matchMedia: () => ({ matches: reduced }) };
  const location = { pathname: '/', search: '', hash: '' };
  const event = () => ({ button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
  try {
    const same = event();
    handleSamePageClick(same, location, '/');
    assert.equal(same.defaultPrevented, true);
    assert.equal(calls.at(-1).behavior, 'smooth');
    for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey', 'defaultPrevented']) {
      const before = calls.length;
      handleSamePageClick({ ...event(), [modifier]: true }, location, '/');
      assert.equal(calls.length, before);
    }
    const query = event();
    handleSamePageClick(query, { ...location, search: '?preview=1' }, '/');
    assert.equal(query.defaultPrevented, false, 'router may clear query');
    const before = calls.length;
    handleSamePageClick(event(), { ...location, hash: '#categories' }, '/');
    assert.equal(calls.length, before, 'route effect owns fragment removal');
    reduced = true;
    handleSamePageClick(event(), location, '/');
    assert.equal(calls.at(-1).behavior, 'instant');
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
  }
});

test('media response only replaces media and revision, never unsaved product fields', () => {
  const draft = {
    _id: 'p1', revision: 7, name: { en: 'Unsaved title' }, categoryId: 'c2',
    status: 'draft', sizes: [{ grams: '250', price: '450.00', grindOptions: [{ code: 'espresso', stockQuantity: '10' }] }],
    imageKeys: ['old'], imageUrls: ['oldUrl'],
  };
  const server = {
    _id: 'p1', revision: 8, name: { en: 'Old saved title' }, categoryId: 'c1',
    sizes: [{ grams: 250, pricePiastres: 45000 }], imageKeys: ['new'], imageUrls: ['newUrl'],
  };
  const merged = mergeMediaIntoDraft(draft, server, 'product');
  assert.equal(merged.sizes[0].price, '450.00');
  assert.deepEqual(merged.name, draft.name);
  assert.equal(merged.categoryId, 'c2');
  assert.equal(merged.revision, 8);
  assert.deepEqual(merged.imageKeys, ['new']);
  assert.deepEqual(mergeMediaIntoDraft(draft, { ...server, _id: 'other' }, 'product'), draft);
});

test('category upload preserves unsaved description and active switch', () => {
  const draft = { _id: 'c1', revision: 1, active: true, name: { en: 'Coffee' }, imageKey: 'old' };
  const result = mergeMediaIntoDraft(draft, { _id: 'c1', revision: 2, active: false, imageKey: 'new', imageUrl: 'url' }, 'category');
  assert.equal(result.active, true);
  assert.equal(result.revision, 2);
  assert.equal(result.imageKey, 'new');
});

test('two rapid cart additions cannot exceed the maximum stock-independent cart limit', () => {
  const line = { productId: '507f1f77bcf86cd799439011', sizeGrams: 250, grindCode: 'espresso', quantity: 11 };
  const first = addLine([], line);
  assert.ok(first);
  assert.equal(addLine(first, line), null);
  const second = addLine(first, { ...line, quantity: 9 });
  assert.equal(second[0].quantity, 20);
  assert.equal(addLine(second, { ...line, quantity: 1 }), null);
});

test('product defaults to an in-stock size and tracks the selected combination', () => {
  const product = { sizes: [
    { grams: 250, grindOptions: [{ code: 'espresso', stockQuantity: 0 }] },
    { grams: 500, grindOptions: [{ code: 'espresso', stockQuantity: 4 }, { code: 'filter', stockQuantity: 0 }] },
  ] };
  assert.deepEqual(initialSelection(product), { sizeGrams: 500, grindCode: 'espresso' });
  assert.equal(selectedStock(product, 250, 'espresso'), 0);
  assert.equal(selectedStock(product, 500, 'espresso'), 4);
  assert.equal(selectedStock(product, 500, 'filter'), 0);
});

test('structural regression: linked logos, mobile route close and scroll restoration exist', () => {
  const header = source('client/src/components/Header.jsx');
  const footer = source('client/src/components/Footer.jsx');
  const app = source('client/src/App.jsx');
  assert.match(header, /<Link className="brand-link"/);
  assert.match(footer, /<Link className="qc-footer-logo-link"/);
  assert.match(header, /onClick=\{navigate\(item\.to\)\}/);
  assert.match(header, /aria-expanded=\{open\}/);
  assert.match(header, /Escape/);
  assert.match(app, /<NavigationEffects\/>/);
});
