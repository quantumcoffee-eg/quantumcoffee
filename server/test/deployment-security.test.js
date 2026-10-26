import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import mongoose from 'mongoose';
import { isolatedCommerceDatabase } from '../testing/isolated-commerce.js';

async function serverFor(t) {
  const app=createApp(),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  return {app,base:`http://127.0.0.1:${server.address().port}`};
}
test('API errors, unavailable private services and health never permit response caching',async t=>{
  const {base}=await serverFor(t);
  for(const path of ['/api/ready','/api/health','/api/admin/catalog/products','/api/admin/media/intent','/api/store/settings','/api/catalog/products','/api/not-found']){
    const res=await fetch(base+path);assert.equal(res.headers.get('cache-control'),'no-store',path);
    assert.doesNotMatch(await res.text(),/mongodb:\/\/|mongodb\+srv:\/\/|password|stack/i);
  }
});
test('origin validation and credential CORS remain exact and fail closed',async t=>{
  const {base}=await serverFor(t);
  for(const origin of [undefined,'https://untrusted.example.invalid']){
    const res=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:'{}'});
    assert.equal(res.status,403);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(res.headers.get('access-control-allow-origin'),null);
  }
  const res=await fetch(base+'/api/health',{headers:{Origin:'http://127.0.0.1:5173'}});assert.equal(res.headers.get('access-control-allow-origin'),'http://127.0.0.1:5173');assert.equal(res.headers.get('access-control-allow-credentials'),'true');
});
test('real local HTTP product and settings successes prohibit stale proxy caching',{skip:!process.env.QC_COMMERCE_TEST_MONGO_URI},async t=>{
  const uri=process.env.QC_COMMERCE_TEST_MONGO_URI,fixture=await isolatedCommerceDatabase(uri);
  try {
    await mongoose.connect(uri,{dbName:fixture.connection.name,autoCreate:false,autoIndex:false,maxPoolSize:2,serverSelectionTimeoutMS:2000});
    const category=await fixture.models.Category.create({name:{en:'Offline'},slug:'fixture',active:true});
    await fixture.models.Product.create({name:{en:'Offline'},slug:'fixture',categoryId:category._id,status:'published',pricePiastres:10000,stockQuantity:0,sizes:[]});
    const {base}=await serverFor(t);
    for(const path of ['/api/catalog/products','/api/catalog/products/fixture','/api/store/settings']){
      const res=await fetch(base+path);assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');
    }
  } finally {await mongoose.connection.close();await fixture.close();}
});
test('production trusts only the expected final reverse-proxy hop',async t=>{
  const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
  t.after(()=>{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;});
  const {app,base}=await serverFor(t);assert.equal(app.get('trust proxy'),1);
  app.get('/test-client-ip',(req,res)=>res.json({ip:req.ip}));
  const res=await fetch(base+'/test-client-ip',{headers:{'X-Forwarded-For':'198.51.100.99, 203.0.113.10'}});
  assert.deepEqual(await res.json(),{ip:'203.0.113.10'});
});
