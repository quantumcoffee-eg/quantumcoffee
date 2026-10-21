import test from 'node:test';
import assert from 'node:assert/strict';
import {proofIntent,proofConfirmation,proofDecision,proofKey,correctProofSignature,proofEligible,validProofKey,verifiedProofKey} from '../src/payments/proof.js';
import {privateR2Ready} from '../src/payments/private-r2.js';
const ref='QC-ABC123ABC123';
test('private R2 refuses incomplete configuration',()=>{
  assert.equal(privateR2Ready({}),false);
  assert.equal(privateR2Ready({R2_ACCOUNT_ID:'a',R2_ACCESS_KEY_ID:'k',R2_SECRET_ACCESS_KEY:'s',R2_PRIVATE_BUCKET:'quantum-private'}),true);
  assert.equal(privateR2Ready({R2_ACCOUNT_ID:'a',R2_ACCESS_KEY_ID:'k',R2_SECRET_ACCESS_KEY:'s',R2_PRIVATE_BUCKET:'same',R2_PUBLIC_BUCKET:'same'}),false);
});
test('proof intent accepts bounded images only',()=>{
  const data=proofIntent({orderNumber:ref,contentType:'image/webp',size:1024});assert.equal(data.extension,'webp');
  assert.throws(()=>proofIntent({orderNumber:ref,contentType:'application/pdf',size:10}));
  assert.throws(()=>proofIntent({orderNumber:ref,contentType:'image/png',size:6000000}));
  assert.throws(()=>proofIntent({orderNumber:ref,contentType:'image/png',size:10,key:'other'}));
  assert.equal(proofConfirmation({orderNumber:ref}).orderNumber,ref);
  assert.throws(()=>proofConfirmation({orderNumber:ref,admin:true}));
});
test('private object keys are unpredictable, scoped and validated',()=>{
  const a=proofKey('jpg'),b=proofKey('jpg'); assert.notEqual(a,b); assert.ok(validProofKey(a));assert.ok(!validProofKey('catalog/abc.jpg'));assert.ok(verifiedProofKey(a).startsWith('payment-proofs/verified/'));assert.throws(()=>verifiedProofKey('payment-proofs/verified/a.jpg'));assert.throws(()=>proofKey('exe'));
});
test('screenshot signatures reject mismatched or fake content',()=>{
  assert.equal(correctProofSignature('image/png',Buffer.from([137,80,78,71,13,10,26,10,11])),true);
  assert.equal(correctProofSignature('image/png',Buffer.from('fake')),false);
  assert.equal(correctProofSignature('image/jpeg',Buffer.from([255,216,255,20])),true);
  assert.equal(correctProofSignature('image/webp',Buffer.from('RIFFxxxxWEBPxxxx')),true);
});
test('only unpaid digital orders may upload screenshots',()=>{
  assert.equal(proofEligible({paymentMethod:'cod',paymentState:'unpaid',fulfillmentState:'received'}),false);
  assert.equal(proofEligible({paymentMethod:'instapay',paymentState:'awaiting_transfer',fulfillmentState:'received'}),true);
  assert.equal(proofEligible({paymentMethod:'vodafone_cash',paymentState:'rejected',fulfillmentState:'confirmed'}),true);
  assert.equal(proofEligible({paymentMethod:'instapay',paymentState:'paid',fulfillmentState:'received'}),false);
  assert.equal(proofEligible({paymentMethod:'instapay',paymentState:'awaiting_transfer',fulfillmentState:'cancelled'}),false);
});
test('admin review needs valid revision and rejection reason',()=>{
  assert.deepEqual(proofDecision({revision:0,decision:'approve'}),{revision:0,decision:'approve',reason:''});
  assert.throws(()=>proofDecision({revision:0,decision:'reject'}));
  assert.equal(proofDecision({revision:1,decision:'reject',reason:'Invalid reference'}).reason,'Invalid reference');
  assert.throws(()=>proofDecision({revision:2,decision:'approve',paymentState:'paid'}));
});
