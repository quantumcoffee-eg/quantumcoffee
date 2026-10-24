import test from 'node:test';
import assert from 'node:assert/strict';
import { CommerceError, validateItems, validateCheckout, validateCustomer, shippingAmount, lineTotals, statusTransition, phoneNumber, fingerprint } from '../src/commerce/checkout.js';
const id='507f1f77bcf86cd799439011';
const form={items:[{productId:id,sizeGrams:250,grindCode:'espresso',quantity:2}],customer:{name:'Example Customer',phone:'01012345678',governorate:'cairo',email:'',city:'Giza',street:'123 Example street',details:''},paymentMethod:'cod',checkoutKey:'67b0822b-a3d8-40d5-81c7-eefc10b93162'};
const sample={_id:id,status:'published',pricePiastres:25000,stockQuantity:23,sizes:[{grams:250,pricePiastres:25000,grindOptions:[{code:'espresso',stockQuantity:10},{code:'whole_beans',stockQuantity:10}]},{grams:500,pricePiastres:45000,grindOptions:[{code:'espresso',stockQuantity:3}]}],slug:'coffee-test',name:{en:'Coffee Test',ar:'قهوة'},imageKeys:[]};
test('cart validation accepts bounded product quantities',()=>{assert.deepEqual(validateItems(form.items),form.items);assert.throws(()=>validateItems([{productId:id,grindCode:'espresso',quantity:21}]),CommerceError);assert.throws(()=>validateItems([form.items[0],form.items[0]]),CommerceError);assert.throws(()=>validateItems([{productId:id,sizeGrams:250,grindCode:'espresso',quantity:1,pricePiastres:1}]),CommerceError)});
test('shipping fees must be provided, never assumed',()=>{assert.throws(()=>shippingAmount('cairo',{}),e=>e.code==='SHIPPING_UNAVAILABLE');assert.equal(shippingAmount('giza',{SHIPPING_CAIRO_GIZA_PIASTRES:'9000'}),9000);assert.equal(shippingAmount('aswan',{SHIPPING_OTHER_PIASTRES:'12000'}),12000);assert.throws(()=>shippingAmount('mars',{}),CommerceError)});
test('Egyptian phone is normalized for guest tracking',()=>{assert.equal(phoneNumber('+201012345678'),'01012345678');assert.throws(()=>phoneNumber('011345678'),CommerceError)});
test('customer details are validated and bounded',()=>{assert.equal(validateCustomer(form.customer).name,'Example Customer');assert.throws(()=>validateCustomer({...form.customer,governorate:'fake'}),CommerceError);assert.throws(()=>validateCustomer({...form.customer,admin:true}),CommerceError)});
test('checkout does not accept client-defined prices or unsafe payment methods',()=>{assert.equal(validateCheckout(form).paymentMethod,'cod');assert.throws(()=>validateCheckout({...form,shippingPiastres:0}),CommerceError);assert.throws(()=>validateCheckout({...form,paymentMethod:'card'}),CommerceError);assert.throws(()=>validateCheckout({...form,checkoutKey:'bad'}),CommerceError)});
test('server calculates line totals from product snapshot and checks stock',()=>{let v=lineTotals([{product:sample,quantity:2,sizeGrams:250,grindCode:'espresso'}]);assert.equal(v.subtotalPiastres,50000);assert.equal(v.lines[0].lineTotalPiastres,50000);assert.throws(()=>lineTotals([{product:sample,quantity:11,sizeGrams:250,grindCode:'espresso'}]),e=>e.code==='OUT_OF_STOCK');assert.throws(()=>lineTotals([{product:{...sample,status:'draft'},quantity:1,sizeGrams:250,grindCode:'espresso'}]),CommerceError)});
test('status progression cannot skip or restart a cancelled order',()=>{assert.equal(statusTransition('received','confirmed'),'confirmed');assert.throws(()=>statusTransition('received','shipped'),CommerceError);assert.throws(()=>statusTransition('cancelled','confirmed'),CommerceError)});
test('checkout fingerprint stays deterministic for idempotent retries',()=>{let v=validateCheckout(form);assert.equal(fingerprint(v),fingerprint({...v}));assert.notEqual(fingerprint(v),fingerprint({...v,paymentMethod:'instapay'}))});

test('same coffee can be ordered in two grinds, but not an unapproved grind',()=> {
  const distinct=[{productId:id,sizeGrams:250,grindCode:'espresso',quantity:2},{productId:id,sizeGrams:250,grindCode:'whole_beans',quantity:1}];
  assert.deepEqual(validateItems(distinct),distinct);
  assert.throws(()=>validateItems([...distinct,distinct[0]]),CommerceError);
  assert.throws(()=>validateItems([{productId:id,sizeGrams:250,grindCode:'unapproved',quantity:1}]),CommerceError);
  const totals=lineTotals([{product:sample,quantity:2,sizeGrams:250,grindCode:'espresso'},{product:sample,quantity:1,sizeGrams:250,grindCode:'whole_beans'}]);
  assert.equal(totals.subtotalPiastres,75000);
  assert.equal(totals.lines[0].packGrams,250);
  assert.equal(totals.lines[1].grindCode,'whole_beans');
  assert.throws(()=>lineTotals([{product:sample,quantity:1,sizeGrams:250,grindCode:'turkish_plain'}]),e=>e.code==='OUT_OF_STOCK');
});

test('same product in different sizes preserves unique cart identities and price',()=>{
 const items=[{productId:id,sizeGrams:250,grindCode:'espresso',quantity:1},{productId:id,sizeGrams:500,grindCode:'espresso',quantity:2}];
 assert.deepEqual(validateItems(items),items);
 assert.throws(()=>validateItems([items[0],items[0]]),CommerceError);
 const totals=lineTotals([{product:sample,sizeGrams:250,grindCode:'espresso',quantity:1},{product:sample,sizeGrams:500,grindCode:'espresso',quantity:2}]);
 assert.equal(totals.subtotalPiastres,115000);
 assert.equal(totals.lines[1].packGrams,500);
 assert.equal(totals.lines[1].unitPricePiastres,45000);
 assert.throws(()=>lineTotals([{product:sample,sizeGrams:1000,grindCode:'espresso',quantity:1}]),CommerceError);
});
