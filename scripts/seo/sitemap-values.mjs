// Pure helpers. This builder is intentionally isolated from MongoDB and uploads.
const xmlEscape = value => String(value).replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
export function siteOrigin(value) {
  try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password && u.pathname==='/' && !u.search && !u.hash && value===u.origin ? value : ''; }
  catch { return ''; }
}
const slugOk = s=>typeof s==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
function alternate(location,en,ar){
 return `<url><loc>${xmlEscape(location)}</loc><xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(en)}"/><xhtml:link rel="alternate" hreflang="ar" href="${xmlEscape(ar)}"/><xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(en)}"/></url>`;
}
export function buildSitemap({origin,products=[],categories=[]}={}) {
 const base=siteOrigin(origin);
 if(!base) throw new Error('Sitemap origin must be a verified HTTPS origin without trailing slash.');
 if(!Array.isArray(products)||!Array.isArray(categories))throw new Error('Products and categories must be arrays.');
 const urls=[];
 const seen=new Set();
 const include=path=>{if(seen.has(path))return;seen.add(path);const en=base+(path==='/'?'/':path),ar=base+'/ar'+(path==='/'?'/':path);urls.push(alternate(en,en,ar));urls.push(alternate(ar,en,ar));};
 for(const path of ['/','/shop','/about']) include(path);
 const liveCategoryIds=new Set(categories.filter(c=>c?.active===true).map(c=>String(c._id)));
 for(const p of products){
   if(p?.status!=='published'||!slugOk(p.slug)||!liveCategoryIds.has(String(p.categoryId)))continue;
   if(!(p.imageUrl||p.imageUrls?.length)||!p.name?.en||!p.description?.en?.trim())continue;
   include('/products/'+p.slug);
 }
 return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'+urls.join('\n')+'\n</urlset>\n';
}
