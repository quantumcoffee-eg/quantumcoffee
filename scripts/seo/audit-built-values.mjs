// Offline audit for the built Cloudflare Pages folder. It never connects to
// MongoDB, launches a server, publishes a sitemap, or changes dist files.
import { existsSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { STATIC_ROUTES, escapeHtml, outputPathForRoute } from './static-head-values.mjs';
import { getPageSeo, normalizeOrigin } from '../../client/src/seo/seo-values.mjs';

const normalize = p => p.split(sep).join('/');
const count = (text, re) => [...text.matchAll(re)].length;

function builtFiles(root) {
  const found = [];
  const visit = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) found.push(normalize(relative(root, file)));
    }
  };
  visit(root);
  return found;
}

export function auditBuiltHtml(distDir, origin = '') {
  const problems = [];
  if (!existsSync(distDir) || !lstatSync(distDir).isDirectory()) {
    return { routesChecked: 0, problems: ['Missing built client/dist folder. Run npm.cmd run build in client first.'] };
  }
  if (origin && !normalizeOrigin(origin)) problems.push('Invalid VITE_PUBLIC_SITE_ORIGIN; it must be an approved HTTPS origin without a trailing slash.');
  const files = builtFiles(distDir);
  const fileSet = new Set(files);
  if (!fileSet.has('robots.txt') || !/^User-agent:\s*\*$/m.test(readFileSync(join(distDir,'robots.txt'),'utf8')) || /^Sitemap:/im.test(readFileSync(join(distDir,'robots.txt'),'utf8'))) {
    problems.push('Built robots.txt must be a real crawler-policy text file without an unapproved sitemap.');
  }
  const expected = new Set(STATIC_ROUTES.map(outputPathForRoute));
  const htmlPages = files.filter(name => name.endsWith('.html'));
  for (const found of htmlPages) {
    if (!expected.has(found)) problems.push(`Unexpected HTML snapshot: ${found}. Do not prebuild private or draft-product pages.`);
  }
  if (!fileSet.has('_headers') || !/X-Robots-Tag:\s*noindex\s*,\s*nofollow/i.test(readFileSync(join(distDir, '_headers'), 'utf8'))) {
    problems.push('Built Cloudflare _headers file must retain X-Robots-Tag: noindex, nofollow.');
  }
  if (!fileSet.has('_redirects') || readFileSync(join(distDir, '_redirects'), 'utf8').split(/\r?\n/).some(line => line.trim() && !line.trim().startsWith('#')) || fileSet.has('404.html')) {
    problems.push('Built Cloudflare native SPA fallback requires no top-level 404.html and no rewrites masking static route heads.');
  }
  const secrets = files.filter(name => /(^|\/)\.env(?:\.|$)/.test(name) && !name.endsWith('.env.example'));
  if (secrets.length) problems.push(`Private environment file(s) in build output: ${secrets.join(', ')}`);

  for (const route of STATIC_ROUTES) {
    const filename = outputPathForRoute(route);
    if (!fileSet.has(filename)) {
      problems.push(`Missing public HTML snapshot for ${route}: ${filename}`);
      continue;
    }
    const html = readFileSync(join(distDir, filename), 'utf8');
    const page = getPageSeo({ pathname: route === '/ar/' ? '/ar' : route, siteOrigin: origin });
    const lang = route === '/ar/' || route.startsWith('/ar/') ? 'ar' : 'en';
    const name = `${route} (${filename})`;
    const langTag = lang === 'ar' ? /<html\s+lang="ar"\s+dir="rtl">/i : /<html\s+lang="en">/i;
    if (!langTag.test(html)) problems.push(`${name}: incorrect HTML language/direction.`);
    if (!html.includes(`<title>${escapeHtml(page.title)}</title>`) || count(html, /<title>/gi) !== 1) {
      problems.push(`${name}: missing, duplicated, or incorrect title.`);
    }
    if (!html.includes(`<meta name="description" content="${escapeHtml(page.description)}"`) || count(html, /name="description"/gi) !== 1) {
      problems.push(`${name}: missing, duplicated, or incorrect meta description.`);
    }
    if (!/name="robots"\s+content="noindex,nofollow"/i.test(html) || count(html, /name="robots"/gi) !== 1) {
      problems.push(`${name}: prelaunch noindex meta is missing or duplicated.`);
    }
    for (const [property, value] of [['og:title', page.title], ['og:description', page.description], ['og:type', 'website']]) {
      if (!html.includes(`<meta property="${property}" content="${escapeHtml(value)}"`) || count(html, new RegExp(`property="${property}"`, 'gi')) !== 1) {
        problems.push(`${name}: missing, duplicated, or incorrect ${property}.`);
      }
    }
    if (count(html, /name="twitter:card"/gi) !== 1) problems.push(`${name}: twitter:card tag is missing or duplicated.`);
    if (!/<div\s+id="root"\s*>\s*<\/div>/i.test(html) || !/\/(?:assets)\/[a-zA-Z0-9_.-]+\.js/.test(html)) {
      problems.push(`${name}: React root or bundled script is missing.`);
    }
    if (page.canonical) {
      if (!html.includes(`<link rel="canonical" href="${escapeHtml(page.canonical)}"`) || count(html, /rel="canonical"/gi) !== 1) {
        problems.push(`${name}: incorrect canonical URL.`);
      }
      for (const [code, url] of [['en', page.alternates.en], ['ar', page.alternates.ar], ['x-default', page.alternates.default]]) {
        if (!html.includes(`<link rel="alternate" hreflang="${code}" href="${escapeHtml(url)}"`)) {
          problems.push(`${name}: incorrect ${code} alternate URL.`);
        }
      }
    } else if (/rel="canonical"|hreflang=/i.test(html)) {
      problems.push(`${name}: canonical or alternate URLs were emitted without an approved HTTPS origin.`);
    }
  }
  return { routesChecked: STATIC_ROUTES.length, problems };
}
