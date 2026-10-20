import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCategory, validateProduct } from '../src/catalog/validation.js';

const category = {name:{en:'Coffee',ar:'قهوة'},slug:'coffee',active:true,sortOrder:0};
const product = {name:{en:'Espresso',ar:'إسبريسو'},slug:'espresso',categoryId:'507f1f77bcf86cd799439011',pricePiastres:35000,compareAtPiastres:45000,stockQuantity:10,featured:false,status:'draft'};
test('category input permits approved bilingual data',()=> {
  assert.deepEqual(validateCategory(category), {...category,description:{en:'',ar:''}});
});
test('category input rejects uncontrolled fields and unsafe slugs',()=> {
  assert.throws(()=>validateCategory({...category,role:'admin'}), /Unknown category field/);
  assert.throws(()=>validateCategory({...category,slug:'../../secret'}), /Slug/);
});
test('product input permits drafts and validates piastres',()=> {
  assert.equal(validateProduct(product).pricePiastres,35000);
  assert.equal(validateProduct({...product,compareAtPiastres:null}).compareAtPiastres,null);
  assert.throws(()=>validateProduct({...product,pricePiastres:40000.5}), /selling price/);
  assert.throws(()=>validateProduct({...product,compareAtPiastres:20000}), /Compare-at/);
});
test('product publication and uncontrolled images remain forbidden',()=> {
  assert.throws(()=>validateProduct({...product,status:'published'}), /Publication is disabled/);
  assert.throws(()=>validateProduct({...product,imageKeys:['external-image']}), /Unknown product field/);
  assert.throws(()=>validateProduct({...product,status:'invalid'}), /status/);
});
