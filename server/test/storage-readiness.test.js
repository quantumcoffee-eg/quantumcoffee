import test from 'node:test';
import assert from 'node:assert/strict';
import { isolatedCommerceDatabase } from '../testing/isolated-commerce.js';
import { loadOperations } from '../src/admin/operations-service.js';
test('real MongoDB storage diagnostics recognize both category and product image attachments',{skip:!process.env.QC_COMMERCE_TEST_MONGO_URI},async()=>{
  const fixture=await isolatedCommerceDatabase(process.env.QC_COMMERCE_TEST_MONGO_URI),{models}=fixture;
  try {
    const key=letter=>`catalog/${letter.repeat(40)}.webp`;
    const category=await models.Category.create({name:{en:'Offline'},slug:'offline',imageKey:key('a')});
    await models.Product.create({name:{en:'Offline'},slug:'offline',categoryId:category._id,pricePiastres:10000,stockQuantity:0,imageKeys:[key('b')]});
    await models.MediaAsset.collection.insertMany(['a','b','c'].map(letter=>({key:key(letter),state:'verified',createdAt:new Date()})));
    const result=await loadOperations({models,env:{}});
    assert.equal(result.storage.unattachedImages,1,'only the genuinely unattached third image needs review');
    assert.equal(result.storage.automaticCleanupEnabled,false);assert.equal(await models.MediaAsset.countDocuments({}),3,'diagnostics never delete objects or records');
  } finally {await fixture.close();}
});
