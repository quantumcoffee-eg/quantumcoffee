import test from 'node:test';
import assert from 'node:assert/strict';
import { getPageSeo, normalizeOrigin, productStructuredData } from '../client/src/seo/seo-values.mjs';
import { buildSitemap } from '../scripts/seo/sitemap-values.mjs';
const origin='https://quantum.example';
test('canonical URLs and EN/AR alternates require valid HTTPS origin',()=>{
 assert.equal(normalizeOrigin(origin),origin);
 for(const invalid of ['http://quantum.example','https://quantum.example/','https://quantum.example/x','https://x@quantum.example',''])assert.equal(normalizeOrigin(invalid),'');
 const en=getPageSeo({pathname:'/shop',siteOrigin:origin});
 assert.equal(en.canonical,origin+'/shop');assert.equal(en.alternates.ar,origin+'/ar/shop');assert.equal(en.robots,'noindex,nofollow');
 const ar=getPageSeo({pathname:'/ar/shop',siteOrigin:origin});assert.equal(ar.canonical,origin+'/ar/shop');
});
test('private and unknown pages never have canonical or hreflang',()=>{
 for(const path of ['/admin','/ar/admin','/login','/reset-password','/cart','/checkout','/never-heard-of-it']){
 const seo=getPageSeo({pathname:path,siteOrigin:origin});assert.equal(seo.canonical,'');assert.equal(seo.alternates,null);assert.equal(seo.internal,true);
 }
});
test('product metadata uses published real data only',()=>{
 const product={slug:'black-hole',status:'published',name:{en:'Black Hole',ar:'بلاك هول'},description:{en:'Roasted beans',ar:'حبوب محمصة'},imageUrl:'https://images.example/black.webp',pricePiastres:45000,stockQuantity:10};
 const result=getPageSeo({pathname:'/ar/products/black-hole',siteOrigin:origin,product});
 assert.equal(result.title,'بلاك هول | كوانتم كوفي');assert.equal(result.canonical,origin+'/ar/products/black-hole');
 assert.equal(productStructuredData({product,siteOrigin:origin}),null,'merchant Offer data stays disabled before checkout');
 assert.equal(productStructuredData({product,siteOrigin:origin,checkoutEnabled:true}).offers.price,'450.00');
 assert.equal(productStructuredData({product:{...product,imageUrl:''},siteOrigin:origin,checkoutEnabled:true}),null);
 assert.equal(getPageSeo({pathname:'/products/black-hole',siteOrigin:origin,product:{...product,status:'draft'}}).canonical,'');
});
test('sitemap includes approved public pages and published, pictured products only',()=>{
 const live={_id:'a',active:true};const hidden={_id:'b',active:false};
 const p={slug:'black-hole',status:'published',categoryId:'a',name:{en:'Black Hole'},description:{en:'Coffee beans'},imageUrl:'https://cdn.example/a.webp'};
 const xml=buildSitemap({origin,products:[p,{...p,slug:'worm-hole',categoryId:'b'},{...p,slug:'cosmic-dust',status:'draft'}],categories:[live,hidden]});
 assert.match(xml,/\/products\/black-hole/); assert.doesNotMatch(xml,/worm-hole|cosmic-dust|admin|checkout/);
 assert.match(xml,/hreflang="ar"/); assert.match(xml,/&lt;|<loc>/);
 assert.throws(()=>buildSitemap({origin:'http://wrong.example'}),/HTTPS/);
});
