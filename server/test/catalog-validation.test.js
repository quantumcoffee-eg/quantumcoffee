import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCategory, validateProduct } from '../src/catalog/validation.js';

const category = {name:{en:'Coffee',ar:'قهوة'},slug:'coffee',active:true,sortOrder:0};
const product = {name:{en:'Espresso',ar:'إسبريسو'},slug:'espresso',categoryId:'507f1f77bcf86cd799439011',sizes:[{grams:250,pricePiastres:35000,compareAtPiastres:45000,grindOptions:[{code:'espresso',stockQuantity:10}]}],featured:false,status:'draft'};
test('category input permits approved bilingual data',()=> {
  assert.deepEqual(validateCategory(category), {...category,description:{en:'',ar:''}});
});
test('category input rejects uncontrolled fields and unsafe slugs',()=> {
  assert.throws(()=>validateCategory({...category,role:'admin'}), /Unknown category field/);
  assert.throws(()=>validateCategory({...category,slug:'../../secret'}), /Slug/);
});
test('product input permits drafts and validates piastres',()=> {
  assert.equal(validateProduct(product).pricePiastres,35000);
  assert.equal(validateProduct(product).stockQuantity,10);
  assert.equal(validateProduct(product).sizes[0].grams,250);
  assert.equal(validateProduct({...product,sizes:[{...product.sizes[0],compareAtPiastres:null}]}).compareAtPiastres,null);
  assert.throws(()=>validateProduct({...product,sizes:[{...product.sizes[0],pricePiastres:40000.5}]}), /selling price/);
  assert.throws(()=>validateProduct({...product,sizes:[{...product.sizes[0],compareAtPiastres:20000}]}), /Compare-at/);
});
test('product publication and uncontrolled images remain forbidden',()=> {
  assert.throws(()=>validateProduct({...product,status:'published'}), /Publication is disabled/);
  assert.throws(()=>validateProduct({...product,imageKeys:['external-image']}), /Unknown product field/);
  assert.throws(()=>validateProduct({...product,stockQuantity:99999}), /Unknown product field/);
  assert.throws(()=>validateProduct({...product,packGrams:500}), /Unknown product field/);
  assert.throws(()=>validateProduct({...product,status:'invalid'}), /status/);
});

test('admin can configure independent size prices and preparation stocks',()=>{
 const sizes=[...product.sizes,{grams:500,pricePiastres:65000,compareAtPiastres:null,grindOptions:[{code:'espresso',stockQuantity:4}]}];
 const result=validateProduct({...product,sizes});
 assert.equal(result.pricePiastres,35000);
 assert.equal(result.stockQuantity,14);
 assert.equal(result.sizes[1].grams,500);
 assert.equal(result.sizes[1].pricePiastres,65000);
 assert.throws(()=>validateProduct({...product,sizes:[product.sizes[0],product.sizes[0]]}),/Duplicate size/);
 assert.throws(()=>validateProduct({...product,sizes:[{...product.sizes[0],grams:-5}]}),/grams/);
 assert.throws(()=>validateProduct({...product,sizes:[{...product.sizes[0],grindOptions:[{code:'espresso',stockQuantity:5},{code:'espresso',stockQuantity:6}]}]}),/duplicate/);
 assert.throws(()=>validateProduct({...product,sizes:[{...product.sizes[0],grindOptions:[{code:'espresso',stockQuantity:5,extraPrice:100}]}]}),/Unknown/);
});
