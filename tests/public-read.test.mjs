import test from 'node:test';
import assert from 'node:assert/strict';
import { publicRead } from '../client/src/lib/public-read.js';
import { api } from '../client/src/lib/api.js';
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type':'application/json' } });
test('public deduplication omits credentials, clones results and permits only fixed public endpoints', async t => {
  let count=0;
  t.mock.method(globalThis,'fetch',async (_url,options)=>{count++;assert.equal(options.credentials,'omit');return json({categories:[{slug:'test'}]})});
  const [one,two]=await Promise.all([publicRead('/catalog/categories',{force:true}),publicRead('/catalog/categories')]);
  assert.equal(count,1);one.categories[0].slug='changed';assert.equal(two.categories[0].slug,'test');
  assert.equal((await publicRead('/catalog/categories')).categories[0].slug,'test');assert.equal(count,1);
  for(const path of ['/auth/me','/admin/overview','/catalog/products','/commerce/config','/catalog/categories?q=unsafe'])await assert.rejects(publicRead(path));
  assert.equal(count,1);
});
test('public cache expires after 30 seconds and force revalidates',async t=>{
  let now=100000,count=0;t.mock.method(Date,'now',()=>now);
  t.mock.method(globalThis,'fetch',async()=>json({settings:{contact:{email:`${++count}@example.invalid`},payments:{secret:'NEVER_CACHE'},shipping:{rate:1000}}}));
  const initial=await publicRead('/store/settings',{force:true});assert.equal(initial.settings.contact.email,'1@example.invalid');assert.equal(initial.settings.payments,undefined);assert.equal(initial.settings.shipping,undefined);assert.doesNotMatch(JSON.stringify(initial),/NEVER_CACHE/);
  now+=29999;assert.equal((await publicRead('/store/settings')).settings.contact.email,'1@example.invalid');
  now++;assert.equal((await publicRead('/store/settings')).settings.contact.email,'2@example.invalid');
  assert.equal((await publicRead('/store/settings',{force:true})).settings.contact.email,'3@example.invalid');
});
test('one cancelled subscriber cannot cancel a shared public request needed by another',async t=>{
  let release,requestSignal,count=0;
  t.mock.method(globalThis,'fetch',(_url,{signal})=>{count++;requestSignal=signal;return new Promise(resolve=>{release=()=>resolve(json({categories:[]}))})});
  const controller=new AbortController(),one=publicRead('/catalog/categories',{force:true,signal:controller.signal}),two=publicRead('/catalog/categories');
  controller.abort();await assert.rejects(one,error=>error.name==='AbortError');assert.equal(requestSignal.aborted,false);
  release();await two;assert.equal(count,1);
});
test('abandoning the final subscriber cancels work and does not poison a subsequent request',async t=>{
  let count=0,signal;
  t.mock.method(globalThis,'fetch',(_url,options)=>{count++;if(count>1)return Promise.resolve(json({settings:{}}));signal=options.signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))))});
  const controller=new AbortController(),request=publicRead('/store/settings',{force:true,signal:controller.signal});controller.abort();await assert.rejects(request);assert.equal(signal.aborted,true);
  await publicRead('/store/settings');assert.equal(count,2);
});
test('HTTP errors and invalid JSON never become cached empty successes',async t=>{
  let count=0;
  t.mock.method(globalThis,'fetch',async()=>{count++;return count===1?new Response('offline',{status:503}):count===2?new Response('not JSON'):json({categories:[]})});
  await assert.rejects(publicRead('/catalog/categories',{force:true}),error=>error.status===503);
  await assert.rejects(publicRead('/catalog/categories'),error=>error.code==='INVALID_RESPONSE');
  await publicRead('/catalog/categories');assert.equal(count,3);
});
test('private/auth/payment/admin calls remain credentialed, uncached and never automatically retried',async t=>{
  let count=0;t.mock.method(globalThis,'fetch',async(_url,options)=>{count++;assert.equal(options.credentials,'include');assert.equal(options.cache,'no-store');return json({ok:true})});
  await api('/auth/me');await api('/auth/me');await api('/admin/overview');await api('/commerce/quote',{method:'POST',body:{items:[]}});assert.equal(count,4);
});
