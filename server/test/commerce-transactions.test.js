import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { isolatedCommerceDatabase } from '../testing/isolated-commerce.js';
import { createOrderService } from '../src/commerce/order-service.js';
import { createPaymentService } from '../src/commerce/payment-service.js';
import { saveProductAtRevision } from '../src/commerce/inventory-service.js';
import { verifiedProofKey } from '../src/payments/proof.js';
import { TRANSACTION_ATTEMPTS } from '../src/commerce/transactions.js';

const uri = process.env.QC_COMMERCE_TEST_MONGO_URI;
test('real replica-set commerce transactions and concurrency', { skip: !uri, timeout: 120000 }, async t => {
  const database = await isolatedCommerceDatabase(uri);
  const { connection, models } = database;
  t.after(() => database.close());
  let instant = new Date();
  const env = { ORDER_EMAILS_ENABLED: 'true', ORDER_ALERT_EMAIL: 'owner@example.invalid', PUBLIC_SITE_ORIGIN: 'https://quantum.example' };
  const options = { connection, models, env, clock: () => instant };
  const orders = createOrderService(options), payments = createPaymentService(options);
  const expiry = createOrderService({ ...options, env: { ...env, UNPAID_ORDER_EXPIRATION_ENABLED: 'true', UNPAID_ORDER_EXPIRATION_MINUTES: '1' } });
  let product, category;
  async function fresh(stock = 5) {
    await database.reset(); instant = new Date();
    category = await models.Category.create({ name: { en: 'Isolated test' }, slug: 'test-category', active: true });
    product = await models.Product.create({ name: { en: 'Isolated coffee', ar: 'اختبار' }, slug: 'test-product', categoryId: category._id, status: 'published', pricePiastres: 10000,
      stockQuantity: stock + 16, sizes: [{ grams: 250, pricePiastres: 10000, grindOptions: [{ code: 'espresso', stockQuantity: stock }, { code: 'filter', stockQuantity: 7 }] }, { grams: 500, pricePiastres: 18000, grindOptions: [{ code: 'espresso', stockQuantity: 9 }] }] });
  }
  const input = (overrides = {}) => ({ checkoutKey: randomUUID(), items: [{ productId: String(product._id), sizeGrams: 250, grindCode: 'espresso', quantity: 1 }],
    customer: { name: 'Isolated Customer', phone: '01012345678', email: 'customer@example.invalid', governorate: 'cairo', city: 'Test City', street: 'Isolated street' }, paymentMethod: 'instapay', ...overrides });
  const buy = (body = input(), overrides = {}) => orders.checkout(body, { shippingPiastres: 2000, ...overrides });
  const inventory = async () => { const value = await models.Product.findById(product._id).lean(); return { total: value.stockQuantity, espresso: value.sizes[0].grindOptions[0].stockQuantity, filter: value.sizes[0].grindOptions[1].stockQuantity, large: value.sizes[1].grindOptions[0].stockQuantity, revision: value.revision }; };
  async function pending(order) { return payments.reserveProofUpload({ orderId: order._id, contentType: 'image/png', size: 100, extension: 'png' }); }
  async function submitted(order) { const proof = await pending(order); const result = await payments.confirmProof({ orderId: order._id, proofId: proof._id, frozenKey: verifiedProofKey(proof.key) }); return { order: result.order, proof }; }
  const expectError = (promise, codes) => assert.rejects(promise, error => codes.includes(error.code));

  await t.test('two concurrent customers cannot both purchase the final variant unit', async () => {
    await fresh(1);
    const results = await Promise.allSettled([buy(), buy()]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected')[0].reason.code, 'OUT_OF_STOCK');
    assert.deepEqual(await inventory(), { total: 16, espresso: 0, filter: 7, large: 9, revision: 1 });
    assert.equal(await models.Order.countDocuments(), 1); assert.equal(await models.OrderMail.countDocuments(), 2);
  });
  await t.test('successful checkout decrements exact product/size/grind quantities and uses server prices', async () => {
    await fresh(5);
    const body = input({ items: [{ productId: String(product._id), sizeGrams: 250, grindCode: 'filter', quantity: 2 }, { productId: String(product._id), sizeGrams: 500, grindCode: 'espresso', quantity: 3 }] });
    const result = await buy(body);
    assert.equal(result.order.totalPiastres, 76000);
    assert.deepEqual(await inventory(), { total: 16, espresso: 5, filter: 5, large: 6, revision: 2 });
    assert.equal(result.order.history.length, 1);
  });
  await t.test('failure after stock writes rolls back the whole checkout and outbox', async () => {
    await fresh(5);
    let updates = 0;
    const monitor = event => { if (event.commandName === 'update') updates++; };
    connection.getClient().on('commandStarted', monitor);
    await database.failCommand({ failCommands: ['insert'], errorCode: 2 });
    try {
      await expectError(buy(input({ items: [{ productId: String(product._id), sizeGrams: 250, grindCode: 'espresso', quantity: 1 }, { productId: String(product._id), sizeGrams: 500, grindCode: 'espresso', quantity: 1 }] })), ['DATABASE_WRITE_FAILED']);
    } finally { await database.failCommand({}, 'off'); connection.getClient().off('commandStarted', monitor); }
    assert.ok(updates >= 2, 'failure occurs after actual stock update commands');
    assert.deepEqual(await inventory(), { total: 21, espresso: 5, filter: 7, large: 9, revision: 0 });
    assert.equal(await models.Order.countDocuments(), 0); assert.equal(await models.OrderMail.countDocuments(), 0);
  });
  await t.test('repeated and concurrent duplicate checkout keys reserve once and enqueue placed mail once', async () => {
    await fresh(5); const body = input();
    const results = await Promise.all([buy(body), buy(body)]);
    assert.equal(new Set(results.map(result => String(result.order._id))).size, 1);
    assert.equal(results.filter(result => result.created).length, 1);
    const order = results[0].order;
    await orders.transitionOrder({ id: order._id, revision: order.revision, status: 'confirmed' });
    const recovered = await orders.checkout(body, { paymentEnabled: false });
    assert.equal(recovered.recovered, true); assert.equal(recovered.order.fulfillmentState, 'confirmed');
    assert.equal(await models.Order.countDocuments(), 1); assert.equal(await models.OrderMail.countDocuments({ kind: 'placed' }), 2);
    assert.equal((await inventory()).espresso, 4);
  });
  await t.test('outbox failure aborts checkout instead of leaving committed stock/order without its notification record', async () => {
    await fresh(1);
    await connection.db.command({collMod:models.OrderMail.collection.collectionName,validator:{_id:{$exists:false}}});
    try { await expectError(buy(),['DATABASE_WRITE_FAILED']); }
    finally { await connection.db.command({collMod:models.OrderMail.collection.collectionName,validator:{}}); }
    assert.equal((await inventory()).espresso,1); assert.equal(await models.Order.countDocuments(),0); assert.equal(await models.OrderMail.countDocuments(),0);
  });
  await t.test('key reuse with different content or a different account is rejected', async () => {
    await fresh(5); const body = input();
    await buy(body, { userId: product._id });
    await expectError(buy({ ...body, items: [{ ...body.items[0], quantity: 2 }] }, { userId: product._id }), ['CHECKOUT_CONFLICT']);
    await expectError(buy(body, { userId: category._id }), ['CHECKOUT_CONFLICT']);
    await expectError(buy(body), ['CHECKOUT_CONFLICT']);
    assert.equal((await inventory()).espresso, 4);
  });
  await t.test('concurrent different requests sharing a checkout key return a conflict, never a second order', async () => {
    await fresh(5); const body = input();
    const results = await Promise.allSettled([buy(body), buy({ ...body, items: [{ ...body.items[0], quantity: 2 }] })]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'CHECKOUT_CONFLICT');
    const saved = await models.Order.findOne().lean();
    assert.equal((await inventory()).espresso, 5 - saved.lines[0].quantity);
  });
  await t.test('cancellation restores exact variants once; repeated or stale actions cannot add history or stock', async () => {
    await fresh(5); const { order } = await buy(input({ items: [{ productId: String(product._id), sizeGrams: 500, grindCode: 'espresso', quantity: 2 }] }));
    const result = await orders.transitionOrder({ id: order._id, revision: 0, status: 'cancelled' });
    assert.equal(result.order.fulfillmentState, 'cancelled');
    await expectError(orders.transitionOrder({ id: order._id, revision: 0, status: 'cancelled' }), ['EDIT_CONFLICT']);
    await expectError(orders.transitionOrder({ id: order._id, revision: 1, status: 'cancelled' }), ['INVALID_STATUS']);
    assert.equal((await models.Order.findById(order._id).lean()).history.length, 2);
    assert.deepEqual(await inventory(), { total: 21, espresso: 5, filter: 7, large: 9, revision: 2 });
  });
  await t.test('a failure midway through stock restoration rolls back cancellation and every prior restock', async () => {
    await fresh(5);
    const second = await models.Product.create({ ...product.toObject(), _id: undefined, slug: 'second-product' });
    const { order } = await buy(input({ items: [String(product._id), String(second._id)].map(productId => ({ productId, sizeGrams: 250, grindCode: 'espresso', quantity: 1 })) }));
    // Remove the later-sorted fixture's variant to force failure after one restore.
    const ids = [product._id, second._id].sort((a,b)=>String(a).localeCompare(String(b)));
    await models.Product.collection.updateOne({ _id: ids[1] }, { $set: { sizes: [], stockQuantity: 0 } });
    await expectError(orders.transitionOrder({ id: order._id, revision: 0, status: 'cancelled' }), ['INVENTORY_INCONSISTENT']);
    const earlier = await models.Product.findById(ids[0]).lean();
    assert.equal(earlier.sizes[0].grindOptions[0].stockQuantity, 4);
    const unchanged = await models.Order.findById(order._id).lean(); assert.equal(unchanged.fulfillmentState, 'received'); assert.equal(unchanged.revision, 0);
  });
  await t.test('cancellation racing proof submission has one coherent winner', async () => {
    for (let i = 0; i < 5; i++) {
      await fresh(1); const { order } = await buy(); const proof = await pending(order);
      const current = await models.Order.findById(order._id).lean();
      const results = await Promise.allSettled([orders.transitionOrder({ id: order._id, revision: current.revision, status: 'cancelled' }), payments.confirmProof({ orderId: order._id, proofId: proof._id, frozenKey: verifiedProofKey(proof.key) })]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      const saved = await models.Order.findById(order._id).lean(), savedProof = await models.PaymentProof.findById(proof._id).lean();
      if (saved.fulfillmentState === 'cancelled') { assert.equal((await inventory()).espresso, 1); assert.equal(savedProof.state, 'pending'); }
      else { assert.equal(saved.paymentState, 'awaiting_verification'); assert.equal(savedProof.state, 'submitted'); assert.equal((await inventory()).espresso, 0); }
    }
  });
  await t.test('payment approval racing cancellation cannot pay a cancelled order or release paid inventory', async () => {
    await fresh(1); const state = await submitted((await buy()).order);
    const results = await Promise.allSettled([payments.reviewPayment({ orderId: state.order._id, revision: state.order.revision, decision: 'approve', by: category._id }), orders.transitionOrder({ id: state.order._id, revision: state.order.revision, status: 'cancelled' })]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
    const saved = await models.Order.findById(state.order._id).lean(); assert.equal(saved.paymentState, 'paid'); assert.notEqual(saved.fulfillmentState, 'cancelled'); assert.equal((await inventory()).espresso, 0);
    await expectError(payments.reviewPayment({ orderId: saved._id, revision: saved.revision, decision: 'approve', by: category._id }), ['REFUND_REQUIRED']);
    assert.equal(saved.paymentHistory.filter(event=>event.state==='paid').length, 1);
  });
  await t.test('proof confirmation replay is idempotent and cannot report success for a cancelled legacy order', async () => {
    await fresh(1); const state=await submitted((await buy()).order);
    const replay=await payments.confirmProof({orderId:state.order._id,proofId:state.proof._id,frozenKey:verifiedProofKey(state.proof.key)});
    assert.equal(replay.recovered,true); assert.equal(replay.changed,false);
    assert.equal((await models.Order.findById(state.order._id).lean()).paymentHistory.filter(event=>event.state==='awaiting_verification').length,1);
    assert.equal(await models.OrderMail.countDocuments({kind:'proof_submitted'}),2);
    await models.Order.collection.updateOne({_id:state.order._id},{$set:{fulfillmentState:'cancelled'}});
    await expectError(payments.confirmProof({orderId:state.order._id,proofId:state.proof._id,frozenKey:verifiedProofKey(state.proof.key)}),['PROOF_NOT_ALLOWED']);
  });
  await t.test('proof write failure rolls back the order status and audit event', async () => {
    await fresh(1); const {order}=await buy(), proof=await pending(order);
    await database.failCommand({failCommands:['update'],errorCode:2});
    try { await expectError(payments.confirmProof({orderId:order._id,proofId:proof._id,frozenKey:verifiedProofKey(proof.key)}),['DATABASE_WRITE_FAILED']); }
    finally { await database.failCommand({},'off'); }
    const saved=await models.Order.findById(order._id).lean();
    assert.equal(saved.paymentState,'awaiting_transfer'); assert.equal(saved.revision,1); assert.equal(saved.paymentHistory.length,1);
    assert.equal((await models.PaymentProof.findById(proof._id).lean()).state,'pending');
  });
  await t.test('approval proof-write failure cannot leave a paid order or duplicate payment event', async () => {
    await fresh(1); const state=await submitted((await buy()).order);
    await database.failCommand({failCommands:['update'],errorCode:2});
    try { await expectError(payments.reviewPayment({orderId:state.order._id,revision:state.order.revision,decision:'approve',by:category._id}),['DATABASE_WRITE_FAILED']); }
    finally { await database.failCommand({},'off'); }
    const saved=await models.Order.findById(state.order._id).lean();
    assert.equal(saved.paymentState,'awaiting_verification'); assert.equal(saved.revision,state.order.revision); assert.equal(saved.paymentHistory.filter(event=>event.state==='paid').length,0);
    assert.equal((await models.PaymentProof.findById(state.proof._id).lean()).state,'submitted'); assert.equal(await models.OrderMail.countDocuments({kind:'payment'}),0);
  });
  await t.test('expiration is restart-safe, audit-tracked and idempotent with exact restoration', async () => {
    await fresh(1); const { order } = await buy(); instant = new Date(Date.now() + 120000);
    const results = await Promise.all([expiry.expireOrder(order._id), createOrderService({ ...options, env: { ...env, UNPAID_ORDER_EXPIRATION_ENABLED: 'true', UNPAID_ORDER_EXPIRATION_MINUTES: '1' } }).expireOrder(order._id)]);
    assert.equal(results.filter(result=>result.changed).length, 1);
    const saved = await models.Order.findById(order._id).lean(); assert.equal(saved.fulfillmentState, 'cancelled'); assert.equal((await inventory()).espresso, 1);
    assert.equal(saved.paymentHistory.filter(event=>event.state==='expired').length, 1); assert.match(saved.paymentHistory.at(-1).reason, /policy=creation-v1; windowMinutes=1/);
    assert.equal((await expiry.expireOrder(order._id)).changed, false);
  });
  await t.test('expiration protects paid orders, COD, submitted proofs and pending uploads; late proof confirmation fails', async () => {
    await fresh(5);
    const cod = (await buy(input({paymentMethod:'cod'}))).order;
    const state = await submitted((await buy()).order);
    const unpaid = (await buy()).order, proof = await pending(unpaid);
    instant = new Date(Date.now() + 120000);
    assert.equal((await expiry.expireOrder(cod._id)).reason, 'INELIGIBLE');
    assert.equal((await expiry.expireOrder(state.order._id)).reason, 'INELIGIBLE');
    assert.equal((await expiry.expireOrder(unpaid._id)).reason, 'PROOF_PROTECTED');
    await payments.reviewPayment({orderId:state.order._id,revision:state.order.revision,decision:'approve',by:category._id});
    assert.equal((await expiry.expireOrder(state.order._id)).changed, false);
    instant = new Date(Date.now() + 20*60000);
    assert.equal((await expiry.expireOrder(unpaid._id)).changed, true);
    await expectError(payments.confirmProof({orderId:unpaid._id,proofId:proof._id,frozenKey:verifiedProofKey(proof.key)}), ['PROOF_NOT_ALLOWED']);
  });
  await t.test('expiry racing a valid proof confirmation defers to the protected upload', async () => {
    await fresh(1); const {order}=await buy(), proof=await pending(order); instant=new Date(Date.now()+120000);
    const [expired, confirmed]=await Promise.all([expiry.expireOrder(order._id),payments.confirmProof({orderId:order._id,proofId:proof._id,frozenKey:verifiedProofKey(proof.key)})]);
    assert.equal(expired.changed,false); assert.equal(confirmed.order.paymentState,'awaiting_verification'); assert.equal((await inventory()).espresso,0);
  });
  await t.test('expiry and a new upload intent serialize on the order across concurrent requests', async () => {
    for(let i=0;i<3;i++){
      await fresh(1); const {order}=await buy(); instant=new Date(Date.now()+120000);
      const results=await Promise.allSettled([expiry.expireOrder(order._id),pending(order)]);
      const saved=await models.Order.findById(order._id).lean();
      if(saved.fulfillmentState==='cancelled'){
        assert.equal(results[0].value.changed,true); assert.equal(results[1].status,'rejected'); assert.equal(await models.PaymentProof.countDocuments(),0); assert.equal((await inventory()).espresso,1);
      }else{
        assert.equal(results[0].value.changed,false); assert.equal(results[1].status,'fulfilled'); assert.equal(await models.PaymentProof.countDocuments({state:'pending'}),1); assert.equal((await inventory()).espresso,0);
      }
    }
  });
  await t.test('legacy unlinked submitted proof is preserved and prevents expiration', async () => {
    await fresh(1); const {order}=await buy();
    await models.PaymentProof.insertMany([{orderId:order._id,key:`payment-proofs/uploads/${randomBytes(20).toString('hex')}.png`,contentType:'image/png',size:100,state:'submitted',submittedAt:new Date(),expiresAt:new Date()}]);
    instant=new Date(Date.now()+120000);
    assert.equal((await expiry.expireOrder(order._id)).reason,'PROOF_PROTECTED');
    assert.equal((await inventory()).espresso,0); assert.equal(await models.PaymentProof.countDocuments({state:'submitted'}),1);
  });
  await t.test('database connection interruption inside a transaction is retried without partial inventory or duplicate outbox entries', async () => {
    await fresh(1);
    await database.failCommand({failCommands:['insert'],closeConnection:true});
    let result;
    try { result=await buy(); } finally { await database.failCommand({},'off'); }
    assert.equal(result.created,true); assert.equal((await inventory()).espresso,0); assert.equal(await models.Order.countDocuments(),1); assert.equal(await models.OrderMail.countDocuments(),2);
  });
  await t.test('persistent database interruption exhausts a bounded retry budget and fully rolls back', async () => {
    await fresh(1); let starts=0;
    const monitor=event=>{if(event.command.startTransaction)starts++}; connection.getClient().on('commandStarted',monitor);
    await database.failCommand({failCommands:['insert'],closeConnection:true},{times:100});
    try { await expectError(buy(),['DATABASE_BUSY']); } finally { await database.failCommand({},'off'); connection.getClient().off('commandStarted',monitor); }
    assert.ok(starts<=TRANSACTION_ATTEMPTS); assert.equal((await inventory()).espresso,1); assert.equal(await models.Order.countDocuments(),0); assert.equal(await models.OrderMail.countDocuments(),0);
  });
  await t.test('commit connection loss retries the commit, not the transaction body', async () => {
    await fresh(1); let starts=0;
    const monitor=event=>{if(event.command.startTransaction)starts++}; connection.getClient().on('commandStarted',monitor);
    await database.failCommand({failCommands:['commitTransaction'],closeConnection:true});
    try { await buy(); } finally { await database.failCommand({},'off'); connection.getClient().off('commandStarted',monitor); }
    assert.equal(starts,1); assert.equal(await models.Order.countDocuments(),1); assert.equal((await inventory()).espresso,0); assert.equal(await models.OrderMail.countDocuments(),2);
  });
  await t.test('concurrent admin stock edits use the same revision CAS and cannot overwrite a reservation', async () => {
    await fresh(1); const original=product.toObject(); original.sizes[0].grindOptions[0].stockQuantity=0; original.stockQuantity=16;
    const results=await Promise.allSettled([buy(),saveProductAtRevision(models.Product,{id:product._id,revision:0,values:original})]);
    if(results[0].status==='fulfilled')assert.equal(results[1].value,null);
    else {assert.equal(results[0].reason.code,'OUT_OF_STOCK');assert.ok(results[1].value);}
    assert.equal((await inventory()).espresso,0); assert.ok((await inventory()).total>=0);
  });
  await t.test('zero stock, digital fulfillment before payment and stale revisions fail without mutation', async () => {
    await fresh(0); await expectError(buy(),['OUT_OF_STOCK']); assert.equal(await models.Order.countDocuments(),0);
    await fresh(1); const {order}=await buy();
    const confirmed=await orders.transitionOrder({id:order._id,revision:0,status:'confirmed'});
    await expectError(orders.transitionOrder({id:order._id,revision:confirmed.order.revision,status:'packing'}),['PAYMENT_REQUIRED']);
    await expectError(orders.transitionOrder({id:order._id,revision:0,status:'cancelled'}),['EDIT_CONFLICT']);
    await expectError(orders.transitionOrder({id:order._id,revision:confirmed.order.revision,status:'delivered'}),['INVALID_STATUS']);
    assert.equal((await inventory()).espresso,0);
  });
  await t.test('COD is collected only after delivery and repeated payment updates add no second paid event', async () => {
    await fresh(1); let order=(await buy(input({paymentMethod:'cod'}))).order;
    await expectError(payments.reviewPayment({orderId:order._id,revision:order.revision,decision:'approve',by:category._id}),['PAYMENT_NOT_ALLOWED']);
    for(const status of ['confirmed','packing','shipped','delivered'])order=(await orders.transitionOrder({id:order._id,revision:order.revision,status})).order;
    order=(await payments.reviewPayment({orderId:order._id,revision:order.revision,decision:'approve',by:category._id})).order;
    await expectError(payments.reviewPayment({orderId:order._id,revision:order.revision,decision:'approve',by:category._id}),['REFUND_REQUIRED']);
    assert.equal(order.paymentHistory.filter(event=>event.state==='paid').length,1);
  });
});
