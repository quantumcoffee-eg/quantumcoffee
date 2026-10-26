// Deterministic production asset budgets. Runtime lab targets are documented
// separately; machine-dependent timings must not masquerade as CI guarantees.
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const build = path.resolve(fileURLToPath(new URL('../client/dist/', import.meta.url)));
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1]).filter(url => url.startsWith('/assets/'));
const styles = [...html.matchAll(/<link\b(?=[^>]*rel="stylesheet")[^>]*href="([^"]+)"/g)].map(match => match[1]).filter(url => url.startsWith('/assets/'));
function bytes(urls) {
  if (!urls.length) throw new Error('Missing initial build assets. Run the production build first.');
  return urls.map(url => {
    const file = path.resolve(build, '.' + url);
    if (!file.startsWith(build + path.sep)) throw new Error('Unexpected asset URL.');
    const content = fs.readFileSync(file);
    return { raw: content.length, gzip: gzipSync(content).length };
  }).reduce((sum, item) => ({ raw: sum.raw + item.raw, gzip: sum.gzip + item.gzip }), { raw: 0, gzip: 0 });
}
const js = bytes(scripts), css = bytes(styles);
for (const [label, actual, maximum] of [['Entry JavaScript source', js.raw, 320000], ['Entry JavaScript gzip', js.gzip, 105000], ['Initial CSS source', css.raw, 45000], ['Initial CSS gzip', css.gzip, 12000]]) {
  console.log(`${actual <= maximum ? 'PASS' : 'FAIL'} ${label}: ${actual} / ${maximum} bytes`);
  if (actual > maximum) process.exitCode = 1;
}
