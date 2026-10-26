import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { STATIC_ROUTES, renderStaticHead, outputPathForRoute } from '../scripts/seo/static-head-values.mjs';
import { auditBuiltHtml } from '../scripts/seo/audit-built-values.mjs';

const base = `<!doctype html><html lang="en"><head><meta name="robots" content="noindex,nofollow" /><meta name="description" content="Default" /><title>Quantum Coffee — Coffee, Reimagined</title></head><body><div id="root"></div><script type="module" src="/assets/index-123.js"></script></body></html>`;
function withFixture(fn, origin = '') {
  const dist = mkdtempSync(join(tmpdir(), 'quantum-built-html-'));
  try {
    writeFileSync(join(dist, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n');
    writeFileSync(join(dist, '_redirects'), '# Native Pages SPA fallback; existing static files take priority.\n');
    writeFileSync(join(dist, 'robots.txt'), 'User-agent: *\nDisallow:\n');
    for (const route of STATIC_ROUTES) {
      const filename = join(dist, outputPathForRoute(route));
      mkdirSync(dirname(filename), {recursive:true});
      writeFileSync(filename, renderStaticHead(base, route, origin));
    }
    return fn(dist);
  } finally { rmSync(dist, {force:true, recursive:true}); }
}

test('built HTML audit accepts 14 protected EN/AR snapshots', () => withFixture(dist => {
  assert.deepEqual(auditBuiltHtml(dist).problems, []);
  assert.equal(auditBuiltHtml(dist).routesChecked, 14);
}));

test('built HTML audit recognizes canonical alternates only with valid HTTPS origin', () => withFixture(dist => {
  assert.deepEqual(auditBuiltHtml(dist, 'https://quantum.example').problems, []);
  assert.ok(auditBuiltHtml(dist, 'http://quantum.example').problems.some(s => /Invalid VITE_PUBLIC_SITE_ORIGIN/.test(s)));
}, 'https://quantum.example'));

test('built HTML audit rejects missing Arabic HTML and unintended private route', () => withFixture(dist => {
  rmSync(join(dist, 'ar/shop.html'));
  mkdirSync(join(dist, 'admin'), {recursive:true});
  writeFileSync(join(dist, 'admin/index.html'), base);
  const issues = auditBuiltHtml(dist).problems.join('\n');
  assert.match(issues, /Missing public HTML snapshot for \/ar\/shop/);
  assert.match(issues, /Unexpected HTML snapshot: admin\/index.html/);
}));

test('built HTML audit rejects broken metadata, robots and leaked environment files', () => withFixture(dist => {
  const home = join(dist, 'index.html');
  writeFileSync(home, readFileSync(home, 'utf8').replace('noindex,nofollow', 'index,follow').replace('Quantum Coffee — Coffee, Reimagined', 'Wrong title'));
  writeFileSync(join(dist, '.env'), 'SHOULD_NOT_APPEAR=true');
  const issues = auditBuiltHtml(dist).problems.join('\n');
  assert.match(issues, /prelaunch noindex meta/);
  assert.match(issues, /incorrect title/);
  assert.match(issues, /Private environment file/);
}));

test('built HTML audit requires Pages headers and redirect fallback', () => withFixture(dist => {
  writeFileSync(join(dist, '_headers'), '/*\n  X-Frame-Options: DENY\n');
  writeFileSync(join(dist, '_redirects'), '/* /missing.html 200\n');
  const issues = auditBuiltHtml(dist).problems.join('\n');
  assert.match(issues, /X-Robots-Tag/);
  assert.match(issues, /SPA fallback/);
}));

test('missing build output produces actionable diagnostic', () => {
  const report = auditBuiltHtml(join(tmpdir(),'quantum-nonexistent-dist-4dede47'));
  assert.ok(report.problems.some(msg => /Run npm.cmd run build/.test(msg)));
});
