#!/usr/bin/env node
// This runs after Vite builds the SPA. It writes public route-specific HTML head
// snapshots; it does not export private pages, fetch product data, or enable SEO.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATIC_ROUTES, renderStaticHead, outputPathForRoute } from './seo/static-head-values.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'client/dist');
const original = readFileSync(resolve(dist, 'index.html'), 'utf8');
const origin = process.env.VITE_PUBLIC_SITE_ORIGIN || '';

for (const route of STATIC_ROUTES) {
  const target = resolve(dist, outputPathForRoute(route));
  const content = renderStaticHead(original, route, origin);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
  console.log(`HTML HEAD: ${route}`);
}
console.log(`Generated ${STATIC_ROUTES.length} public route HTML heads; SPA content is still client-rendered.`);
console.log('PRELAUNCH INDEXING REMAINS DISABLED. Product pages still need HTML-at-request before launch.');
