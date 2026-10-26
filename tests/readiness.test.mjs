import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { productHeadPreview } from '../scripts/seo/product-head-preview.mjs';
import { buildCandidateCsp } from '../scripts/security/csp-values.mjs';
import { overviewDate, overviewMoney } from '../client/src/admin/overview-copy.js';
const category = { _id:'offline-category',active:true };
const product = {slug:'fixture-coffee',categoryId:category._id,status:'published',name:{en:'Fixture <coffee>',ar:'اختبار'},description:{en:'Offline "description"'},imageUrl:`https://media.example.invalid/catalog/${'a'.repeat(40)}.webp`};
test('offline product head preview escapes approved content and preserves every prelaunch lock',()=>{
  for(const locale of ['en','ar']){
    const html=productHeadPreview({product,category,siteOrigin:'https://coffee.example.invalid',mediaOrigin:'https://media.example.invalid',locale});
    assert.match(html,/noindex,nofollow/);assert.match(html,/hreflang="x-default"/);assert.match(html,/og:image/);assert.doesNotMatch(html,/<script|Offer|priceCurrency/);
    if(locale==='en')assert.match(html,/Fixture &lt;coffee&gt;/);else assert.match(html,/dir="rtl"/);
  }
});
test('preview rejects drafts, hidden categories, mismatched categories, bad origins and unsafe images',()=>{
  const input={product,category,siteOrigin:'https://coffee.example.invalid',mediaOrigin:'https://media.example.invalid'};
  for(const overrides of [{siteOrigin:''},{product:{...product,status:'draft'}},{category:{...category,active:false}},{product:{...product,categoryId:'other'}},{product:{...product,slug:'../admin'}},{product:{...product,imageUrl:'javascript:alert(1)'}},{product:{...product,imageUrl:'https://private.example.invalid/payment-proofs/verified/key.png?signature=secret'}},{mediaOrigin:''}])assert.throws(()=>productHeadPreview({...input,...overrides}));
});
test('Pages uses native fallback without masking generated HTML or publishing a sitemap',()=>{
  const rules=readFileSync('client/public/_redirects','utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.trim().startsWith('#'));
  assert.deepEqual(rules,[]);assert.equal(existsSync('client/public/404.html'),false);assert.equal(existsSync('client/public/sitemap.xml'),false);
  assert.match(readFileSync('client/public/robots.txt','utf8'),/^User-agent: \*$/m);assert.doesNotMatch(readFileSync('client/public/robots.txt','utf8'),/^Sitemap:/im);
  assert.match(readFileSync('client/public/_headers','utf8'),/X-Robots-Tag: noindex, nofollow/);
});
test('candidate CSP uses exact origins without script eval or inline-script permissions',()=>{
  const csp=buildCandidateCsp({apiOrigin:'https://api.example.invalid',mediaOrigin:'https://media.example.invalid'});
  assert.match(csp,/script-src 'self';/);assert.doesNotMatch(csp,/unsafe-eval|script-src[^;]*unsafe-inline|https:\/\/\*/);
  for(const origin of ['https://api.example.invalid/path','https://user:password@example.invalid','http://example.invalid',"https://example.invalid; script-src *"] )assert.throws(()=>buildCandidateCsp({apiOrigin:origin}));
});
test('reused formatters preserve currency, locale and Cairo date semantics',()=>{
  for(const lang of ['en','ar'])for(const time of [false,true]){
    const input='2026-10-29T22:30:00Z';const expected=new Intl.DateTimeFormat(lang==='ar'?'ar-EG':'en-GB',{timeZone:'Africa/Cairo',day:'numeric',month:'short',...(time?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(input));
    assert.equal(overviewDate(input,lang,time),expected);assert.equal(overviewDate(input,lang,time),expected);
    assert.equal(overviewMoney(12345,lang),new Intl.NumberFormat(lang==='ar'?'ar-EG':'en-EG',{style:'currency',currency:'EGP'}).format(123.45));
  }
});
