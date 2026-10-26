import test from 'node:test';
import assert from 'node:assert/strict';
import { STATIC_ROUTES, renderStaticHead, outputPathForRoute } from '../scripts/seo/static-head-values.mjs';

const source = `<!doctype html><html lang="en"><head><meta name="robots" content="noindex,nofollow" /><meta name="description" content="Default" /><title>Quantum Coffee — Coffee, Reimagined</title></head><body><div id="root"></div><script type="module" src="/assets/index-123.js"></script></body></html>`;

test('only fixed public paths have HTML snapshots and each is protected', () => {
  assert.equal(STATIC_ROUTES.length, 14);
  for (const route of STATIC_ROUTES) {
    const output = renderStaticHead(source, route);
    assert.match(output, /name="robots" content="noindex,nofollow"/);
    assert.match(output, /<div id="root"><\/div>/);
    assert.match(output, /\/assets\/index-123.js/);
    assert.match(output, /<meta property="og:title"/);
    assert.doesNotMatch(output, /rel="canonical"/);
    assert.doesNotMatch(output, /@type.*Product/);
  }
});

test('Arabic HTML has Arabic head, rtl direction and path', () => {
  const html = renderStaticHead(source, '/ar/shop');
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /تسوق القهوة/);
  assert.equal(outputPathForRoute('/ar/shop'), 'ar/shop/index.html');
  assert.equal(outputPathForRoute('/ar/'), 'ar/index.html');
});

test('approved HTTPS origin builds canonical and alternate links', () => {
  const html = renderStaticHead(source, '/shop', 'https://quantum.example');
  assert.match(html, /<link rel="canonical" href="https:\/\/quantum\.example\/shop"/);
  assert.match(html, /hreflang="ar" href="https:\/\/quantum\.example\/ar\/shop"/);
  assert.match(html, /hreflang="x-default"/);
  assert.match(html, /name="robots" content="noindex,nofollow"/);
});

test('unapproved paths and missing prelaunch lock are rejected', () => {
  for (const route of ['/login', '/admin', '/checkout', '/products/black-hole', '/bad', '/../admin']) {
    assert.throws(() => renderStaticHead(source, route), /Unapproved static route/);
    assert.throws(() => outputPathForRoute(route), /Unapproved static route/);
  }
  assert.throws(() => renderStaticHead(source.replace('noindex,nofollow', 'index,follow'), '/'), /noindex guard/);
});

test('route head tags remain unique and safe to update client-side', () => {
  const html = renderStaticHead(source, '/about');
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.equal((html.match(/name="description"/g) || []).length, 1);
  assert.equal((html.match(/property="og:title"/g) || []).length, 1);
  assert.equal((html.match(/data-qc-seo/g) || []).length, 4);
});
