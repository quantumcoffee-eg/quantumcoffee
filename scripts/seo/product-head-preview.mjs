// Offline preparation only: not wired into Vite, Pages, an API or sitemap.
// A future approved catalog export/Pages adapter can consume this renderer.
import { getPageSeo, normalizeOrigin, localizedPath } from '../../client/src/seo/seo-values.mjs';
import { escapeHtml } from './static-head-values.mjs';

export function productHeadPreview({ product, category, siteOrigin, mediaOrigin = '', locale = 'en' }) {
  if (!normalizeOrigin(siteOrigin) || !['en','ar'].includes(locale)) throw new Error('An approved HTTPS origin and supported locale are required.');
  if (product?.status !== 'published' || category?.active !== true || !category?._id || String(product.categoryId) !== String(category._id)) throw new Error('Only published products in an active category may be previewed.');
  const pathname = localizedPath('product', locale, product.slug);
  if (!pathname || !product.name?.en?.trim()) throw new Error('Valid product identity and approved name required.');
  const seo = getPageSeo({ pathname, product, siteOrigin });
  let image = '';
  if (seo.image) {
    const url = new URL(seo.image);
    if (!normalizeOrigin(mediaOrigin) || url.origin !== mediaOrigin || url.username || url.password || url.search || url.hash || !/^\/catalog\/[a-f0-9]{40}\.(?:jpg|png|webp)$/.test(url.pathname)) throw new Error('Only approved public catalog image URLs may be previewed.');
    image = seo.image;
  }
  const meta = (name, value, attr = 'property') => `<meta ${attr}="${name}" content="${escapeHtml(value)}" data-qc-seo="" />`;
  return [`<html lang="${locale}"${locale === 'ar' ? ' dir="rtl"' : ''}>`, '<head>',
    '<meta name="robots" content="noindex,nofollow" />', `<title>${escapeHtml(seo.title)}</title>`,
    meta('description', seo.description, 'name'), meta('og:title', seo.title), meta('og:description', seo.description), meta('og:type', 'product'), meta('og:url', seo.canonical),
    ...(image ? [meta('og:image', image)] : []), meta('twitter:card', image ? 'summary_large_image' : 'summary', 'name'),
    `<link rel="canonical" href="${escapeHtml(seo.canonical)}" data-qc-seo="" />`,
    ...[['en','en'],['ar','ar'],['x-default','default']].map(([lang,key])=>`<link rel="alternate" hreflang="${lang}" href="${escapeHtml(seo.alternates[key])}" data-qc-seo="" />`),
    '</head>'].join('\n');
}
