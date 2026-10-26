// Optional actual-pipeline suite. Refuses Atlas, credentials and pre-existing DB
// names. Fixtures live ONLY in a uniquely named disposable loopback database.
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { loadOverview } from '../src/admin/overview-service.js';
const uri = process.env.QC_OVERVIEW_TEST_MONGO_URI;
test('real MongoDB: explicit ledger events, legacy gaps, inventory, proof queues, best sellers and Cairo dates', { skip: !uri }, async () => {
  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:\d+\/?$/, 'Only unauthenticated loopback MongoDB without a database path is allowed');
  const client = await new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 3000 }).connect();
  const db = client.db(`qc_overview_test_${randomUUID().replaceAll('-', '')}`);
  const { ObjectId } = mongoose.mongo;
  const p1 = new ObjectId(), p2 = new ObjectId(), proof = new ObjectId(), reviewedOrder = new ObjectId();
  const now = new Date('2026-10-26T12:00:00Z');
  const event = (state, at = '2026-10-26T00:00:00Z') => ({ state, at: new Date(at) });
  const collection = (orderId, amountPiastres, occurredAt, paymentMethod = 'instapay') => ({ orderId, amountPiastres, occurredAt: new Date(occurredAt), recordedAt: new Date(occurredAt), kind: 'collection', direction: 1, currency: 'EGP', paymentMethod });
  const order = (overrides = {}) => ({ _id: new ObjectId(), orderNumber: `QC-${randomUUID().slice(0, 8)}`, createdAt: new Date('2026-10-01T00:00:00Z'), totalPiastres: 10000,
    paymentMethod: 'instapay', paymentState: 'unpaid', fulfillmentState: 'received', customer: { phone: 'SECRET', email: 'SECRET', street: 'SECRET' },
    paymentHistory: [], lines: [{ productId: p1, name: { en: 'Fixture One', ar: 'اختبار' }, packGrams: 250, grindCode: 'espresso', quantity: 2, lineTotalPiastres: 8000 }], ...overrides });
  const models = Object.fromEntries([['Order','orders'],['Product','products'],['Category','categories'],['PaymentProof','paymentproofs'],['PaymentEvent','paymentevents'],['RefundCase','refundcases']].map(([key, name]) => [key, {
    aggregate(pipeline) { return { option: options => db.collection(name).aggregate(pipeline, options).toArray() }; },
    find(filter) { let options = {}; return { sort(v) { options.sort=v;return this; }, limit(v) { options.limit=v;return this; }, select() { options.projection={_id:1,orderNumber:1,createdAt:1,totalPiastres:1,paymentState:1,fulfillmentState:1};return this; }, maxTimeMS(v) { options.maxTimeMS=v;return this; }, lean() { return db.collection(name).find(filter, options).toArray(); } }; },
  }]));
  try {
    let result = await loadOverview('today', { now, models });
    assert.equal(result.financial.collectedPiastres, 0);
    await db.collection('products').insertMany([1,2,3].map(() => ({ status:'draft', name:{en:'Draft'}, sizes:[{grams:250,grindOptions:[]}] })));
    await db.collection('categories').insertOne({active:true});
    result = await loadOverview('today', { now, models });
    assert.equal(result.metrics.draftProducts, 3); assert.equal(result.metrics.totalCategories, 1); assert.equal(result.lowStock.total, 0);
    const placed = await db.collection('orders').insertMany([
      order({ paymentState:'paid', totalPiastres:10001, paymentHistory:[event('paid'),event('paid','2026-10-26T01:00:00Z')] }),
      order({ paymentMethod:'cod', paymentState:'paid', totalPiastres:15000, fulfillmentState:'delivered', paymentHistory:[event('paid')], lines:[{productId:p2,name:{en:'Fixture Two'},quantity:1,lineTotalPiastres:12000}] }),
      order({ paymentMethod:'cod', fulfillmentState:'delivered' }), order({ paymentState:'awaiting_transfer' }), order({ paymentState:'rejected', paymentHistory:[event('rejected')] }),
      order({ paymentState:'refunded', totalPiastres:20000, paymentHistory:[event('paid','2026-10-10T00:00:00Z'),event('refunded')] }),
      order({ paymentState:'paid', totalPiastres:5000, fulfillmentState:'cancelled', paymentHistory:[event('paid')] }),
      order({ paymentState:'paid', paymentHistory:[] }),
      order({ paymentState:'paid', totalPiastres:90000, paymentHistory:[event('paid','2026-10-25T00:00:00Z'),event('paid')] }),
      order({ _id:reviewedOrder,paymentState:'awaiting_verification',paymentProofId:proof }),
      order({ createdAt:new Date('2026-10-26T05:00:00Z') }),
    ]);
    // Deliberate amount-bearing local fixtures. Legacy history is NOT converted
    // by the application; the remaining paid order intentionally has no event.
    await db.collection('paymentevents').insertMany([
      collection(placed.insertedIds[0], 10001, '2026-10-26T00:00:00Z'),
      collection(placed.insertedIds[1], 15000, '2026-10-26T00:00:00Z', 'cod'),
      collection(placed.insertedIds[5], 20000, '2026-10-10T00:00:00Z'),
      collection(placed.insertedIds[6], 5000, '2026-10-26T00:00:00Z'),
      collection(placed.insertedIds[8], 90000, '2026-10-25T00:00:00Z'),
    ]);
    await db.collection('paymentproofs').insertMany([{_id:proof,orderId:reviewedOrder,state:'submitted'}, {orderId:new ObjectId(),state:'submitted'}]);
    await db.collection('products').insertMany([
      {_id:p1,status:'published',name:{en:'One'},sizes:[{grams:250,grindOptions:[{code:'espresso',stockQuantity:0},{code:'filter',stockQuantity:5},{code:'whole_beans',stockQuantity:6}]}]},
      {_id:p2,status:'published',name:{en:'Two'},sizes:[],packGrams:500,grindOptions:[{code:'espresso',stockQuantity:3}]},
      {status:'draft',name:{en:'Ignore draft'},sizes:[{grams:250,grindOptions:[{code:'espresso',stockQuantity:0}]}]},
      {status:'archived',name:{en:'Ignore archived'},sizes:[{grams:250,grindOptions:[{code:'espresso',stockQuantity:0}]}]},
    ]);
    result = await loadOverview('today', { now, models });
    assert.equal(result.financial.collectedPiastres, 30001, 'only recorded monetary events today; creation dates and repeated paid history have no monetary effect');
    assert.equal(result.financial.paidOrders, 3); assert.equal(result.financial.averageOrderValuePiastres, 10000);
    assert.equal(result.financial.recordedRefundOrdersInPeriod, 0); assert.equal(result.financial.refundAmountsPiastres, 0);
    assert.equal(result.financial.netCollectedPiastres, null, 'unreconciled legacy/corrupt records must withhold authoritative net');
    assert.equal(result.financial.missingCollectionEvents, 1); assert.equal(result.financial.currentRefundedOrders, 1);
    assert.equal(result.metrics.totalOrders, 1, 'creation date only affects placed orders');
    assert.equal(result.metrics.pendingPaymentReviews, 1, 'orphan proof excluded');
    assert.equal(result.lowStock.total, 3, 'published variant pairs only, including legacy size projection');
    assert.deepEqual(result.lowStock.items.map(x=>[x.sizeGrams,x.grindCode,x.stockQuantity]), [[250,'espresso',0],[500,'espresso',3],[250,'filter',5]]);
    assert.deepEqual(result.bestSellers.map(x=>[x.productId,x.units,x.merchandisePiastres]), [[String(p1),2,8000],[String(p2),1,12000]]);
    assert.ok(!JSON.stringify(result).includes('SECRET')); assert.equal(result.recentOrders.length,8);
    const month = await loadOverview('30d', { now, models });
    assert.equal(month.financial.collectedPiastres, 140001, 'refund does not erase historical gross collection; duplicate payment stays on its first date');
    assert.equal(month.series.find(x=>x.date==='2026-10-10').collectedPiastres,20000);
    // Check the same boundary using MongoDB's timezone database, not just Intl.
    // This collection belongs only to the uniquely named local test database.
    await db.collection('orders').deleteMany({});
    await db.collection('paymentevents').deleteMany({});
    const springOrders = await db.collection('orders').insertMany([
      order({paymentState:'paid',totalPiastres:101,paymentHistory:[event('paid','2026-04-23T22:00:00Z')]}),
      order({paymentState:'paid',totalPiastres:202,paymentHistory:[event('paid','2026-04-23T21:59:59.999Z')]}),
    ]);
    await db.collection('paymentevents').insertMany([collection(springOrders.insertedIds[0], 101, '2026-04-23T22:00:00Z'), collection(springOrders.insertedIds[1], 202, '2026-04-23T21:59:59.999Z')]);
    const spring = await loadOverview('today', {now:new Date('2026-04-24T12:00:00Z'),models});
    assert.equal(spring.period.from,'2026-04-23T22:00:00.000Z');
    assert.equal(spring.series[0].date,'2026-04-24');
    assert.equal(spring.financial.collectedPiastres,101, 'skipped midnight starts at the correct instant');
    await db.collection('orders').deleteMany({});
    await db.collection('paymentevents').deleteMany({});
    const autumnOrders = await db.collection('orders').insertMany([
      order({paymentState:'paid',totalPiastres:101,paymentHistory:[event('paid','2026-10-29T20:30:00Z')]}),
      order({paymentState:'paid',totalPiastres:202,paymentHistory:[event('paid','2026-10-29T21:30:00Z')]}),
    ]);
    await db.collection('paymentevents').insertMany([collection(autumnOrders.insertedIds[0], 101, '2026-10-29T20:30:00Z'), collection(autumnOrders.insertedIds[1], 202, '2026-10-29T21:30:00Z')]);
    const autumn = await loadOverview('today', {now:new Date('2026-10-29T21:50:00Z'),models});
    assert.equal(autumn.series[0].date,'2026-10-29');
    assert.equal(autumn.financial.collectedPiastres,303, 'both occurrences of the repeated hour stay on the same Cairo date');
  } finally {
    assert.match(db.databaseName, /^qc_overview_test_[a-f0-9]{32}$/);
    await db.dropDatabase(); await client.close();
  }
});
