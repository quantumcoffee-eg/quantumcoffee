// Render route-specific static HTML <head> information for Cloudflare Pages.
// These snapshots do NOT prerender React content or published product pages.
// The global prelaunch noindex tag and Pages noindex header remain mandatory.
import { getPageSeo } from '../../client/src/seo/seo-values.mjs';

const PUBLIC_PAGES = Object.freeze(['/', '/shop', '/about', '/shipping-policy', '/refund-policy', '/privacy-policy', '/terms']);
export const STATIC_ROUTES = Object.freeze(PUBLIC_PAGES.flatMap(path => [path, path === '/' ? '/ar/' : `/ar${path}`]));

export const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[ch]);

function replaceOne(html, pattern, replacement, label) {
  const matches = html.match(new RegExp(pattern.source, 'g')) || [];
  if (matches.length !== 1) throw new Error(`Expected exactly one ${label} in Vite HTML.`);
  return html.replace(pattern, () => replacement);
}

export function renderStaticHead(baseHtml, route, siteOrigin = '') {
  if (!STATIC_ROUTES.includes(route)) throw new Error(`Unapproved static route: ${route}`);
  if (typeof baseHtml !== 'string' || !/<meta\s+name="robots"\s+content="noindex,nofollow"\s*\/>/i.test(baseHtml)) {
    throw new Error('Cannot generate HTML without prelaunch noindex guard.');
  }
  const pathForSeo = route === '/ar/' ? '/ar' : route;
  const seo = getPageSeo({ pathname: pathForSeo, siteOrigin });
  if (!seo.page || seo.internal || seo.robots !== 'noindex,nofollow') throw new Error(`Unsafe SEO route: ${route}`);
  const lang = seo.locale;
  let html = replaceOne(baseHtml, /<html\s+lang="en">/i, `<html lang="${lang}"${lang === 'ar' ? ' dir="rtl"' : ''}>`, 'html tag');
  html = replaceOne(html, /<title>[^<]*<\/title>/i, `<title>${escapeHtml(seo.title)}</title>`, 'title');
  html = replaceOne(html, /<meta\s+name="description"\s+content="[^"]*"\s*\/>/i,
    `<meta name="description" content="${escapeHtml(seo.description)}" />`, 'description');
  const metas = [
    ['og:title', seo.title],
    ['og:description', seo.description],
    ['og:type', seo.ogType],
  ].map(([property, content]) => `<meta property="${property}" content="${escapeHtml(content)}" data-qc-seo="" />`);
  metas.push(`<meta name="twitter:card" content="summary" data-qc-seo="" />`);
  if (seo.canonical) {
    metas.push(`<meta property="og:url" content="${escapeHtml(seo.canonical)}" data-qc-seo="" />`);
    metas.push(`<link rel="canonical" href="${escapeHtml(seo.canonical)}" data-qc-seo="" />`);
    for (const [language, url] of [['en', seo.alternates.en], ['ar', seo.alternates.ar], ['x-default', seo.alternates.default]]) {
      metas.push(`<link rel="alternate" hreflang="${language}" href="${escapeHtml(url)}" data-qc-seo="" />`);
    }
  }
  // data-qc-seo marks tags for client-side updates, preventing duplicates after hydration.
  html = replaceOne(html, /<\/head>/i, `${metas.join('\n  ')}\n</head>`, 'head close');
  return html;
}

export function outputPathForRoute(route) {
  if (!STATIC_ROUTES.includes(route)) throw new Error(`Unapproved static route: ${route}`);
  if (route === '/') return 'index.html';
  if (route === '/ar/') return 'ar/index.html';
  const segment = route.replace(/^\/|\/$/g, '');
  // Pages maps /about.html to /about; directory index.html maps to /about/.
  // Match the existing extensionless canonical/client URLs without a slash hop.
  return `${segment}.html`;
}
