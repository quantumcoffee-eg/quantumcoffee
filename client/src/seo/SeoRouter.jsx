import { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getPageSeo } from './seo-values.mjs';

const SITE_ORIGIN = import.meta.env.VITE_PUBLIC_SITE_ORIGIN || '';
const OWNER = 'data-qc-seo';
function setMeta(key, content, attribute = 'name') {
  const selector = `meta[${attribute}="${key}"][${OWNER}]`;
  let node = document.head.querySelector(selector);
  if (!content) { node?.remove(); return; }
  if (!node) { node = document.createElement('meta'); node.setAttribute(attribute,key); node.setAttribute(OWNER,''); document.head.appendChild(node); }
  node.setAttribute('content',content);
}
function setLink(rel, href, hreflang = '') {
  const selector = `link[rel="${rel}"]${hreflang?`[hreflang="${hreflang}"]`:''}[${OWNER}]`;
  let node = document.head.querySelector(selector);
  if (!href) { node?.remove(); return; }
  if (!node) { node=document.createElement('link'); node.setAttribute('rel',rel); if(hreflang)node.setAttribute('hreflang',hreflang); node.setAttribute(OWNER,''); document.head.appendChild(node); }
  node.setAttribute('href',href);
}
export function applySeo(seo) {
  if (typeof document === 'undefined' || !seo) return;
  document.title = seo.title;
  // Update existing static description and robots tags rather than adding duplicates.
  for (const [key,content] of [['description',seo.description],['robots','noindex,nofollow']]) {
    let node = document.head.querySelector(`meta[name="${key}"]`);
    if (!node) {node=document.createElement('meta');node.name=key;document.head.appendChild(node);}
    node.content = content;
  }
  setMeta('og:title',seo.title,'property');
  setMeta('og:description',seo.description,'property');
  setMeta('og:type',seo.ogType,'property');
  setMeta('og:url',seo.canonical,'property');
  setMeta('og:image',seo.image,'property');
  setMeta('twitter:card',seo.image?'summary_large_image':'summary');
  setLink('canonical',seo.canonical);
  for (const [locale,attr] of [['en','en'],['ar','ar'],['default','x-default']]) {
    setLink('alternate',seo.alternates?.[locale]||'',attr);
  }
  // No product structured data is emitted here: checkout is explicitly disabled.
}
const ProductSeoContext = createContext(null);
export function useSetProductSeo() {
  const setter = useContext(ProductSeoContext);
  if (!setter) throw new Error('Product SEO provider missing');
  return setter;
}
export default function SeoRouter({children}) {
  const { pathname } = useLocation();
  const [product,setProduct] = useState(null);
  const slug = /^\/(?:ar\/)?products\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(pathname)?.[1];
  const activeProduct = slug && product?.slug === slug ? product : null;
  useEffect(()=>{ applySeo(getPageSeo({pathname,product:activeProduct,siteOrigin:SITE_ORIGIN})); },[pathname,activeProduct]);
  return <ProductSeoContext.Provider value={setProduct}>{children}</ProductSeoContext.Provider>;
}
