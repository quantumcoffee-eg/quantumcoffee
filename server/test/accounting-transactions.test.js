import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { isolatedCommerceDatabase } from '../testing/isolated-commerce.js';
import { createOrderService } from '../src/commerce/order-service.js';
import { createPaymentService } from '../src/commerce/payment-service.js';
import { createRefundFoundation, REFUND_RECORDING_ENABLED } from '../src/accounting/refund-foundation.js';
import { loadReconciliation } from '../src/accounting/reconciliation.js';
import { loadOverview } from '../src/admin/overview-service.js';
import { verifiedProofKey } from '../src/payments/proof.js';

const uri = process.env.QC_COMMERCE_TEST_MONGO_URI;
test('real replica-set C2 accounting, refunds, reconciliation and failure recovery', { skip: !uri, timeout: 120000 }, async t => {
  const db = await isolatedCommerceDatabase(uri);
  const { models, connection } = db;
  t.after(() => db.close());
  let at = new Date('2026-10-26T08:00:00Z'), product;
  const admin = new mongoose.Types.ObjectId(), verifier = new mongoose.Types.ObjectId();
  const options = { models, connection, clock: () => at, env: { ORDER_EMAILS_ENABLED: 'true', ORDER_ALERT_EMAIL: 'owner@example.invalid' } };
  const orders = createOrderService(options), payments = createPaymentService(options);
  // Test-only policy injection; no production caller supplies authorization.
  const refunds = createRefundFoundation({ ...options, authorize: async () => true });
  const current = id => models.Order.findById(id).lean();
  async function fresh() {
    await db.reset(); at = new Date('2026-10-26T08:00:00Z');
    const category = await models.Category.create({ name: { en: 'Isolated accounting' }, slug: 'accounting', active: true });
    product = await models.Product.create({ name: { en: 'Isolated coffee' }, slug: 'accounting-coffee', categoryId: category._id, status: 'published', pricePiastres: 10000, stockQuantity: 5,
      sizes: [{ grams: 250, pricePiastres: 10000, grindOptions: [{ code: 'espresso', stockQuantity: 5 }] }] });
  }
  async function buy(method = 'instapay') {
    return (await orders.checkout({ checkoutKey: randomUUID(), customer: { name: 'Isolated customer', phone: '01012345678', email: 'isolated@example.invalid', governorate: 'cairo', city: 'Test', street: 'Private isolated address' },
      paymentMethod: method, items: [{ productId: String(product._id), sizeGrams: 250, grindCode: 'espresso', quantity: 1 }] }, { shippingPiastres: 2000 })).order;
  }
  async function submitted() {
    const order = await buy();
    const proof = await payments.reserveProofUpload({ orderId: order._id, contentType: 'image/png', extension: 'png', size: 100 });
    return (await payments.confirmProof({ orderId: order._id, proofId: proof._id, frozenKey: verifiedProofKey(proof.key) })).order;
  }
  const approve = order => payments.reviewPayment({ orderId: order._id, revision: order.revision, decision: 'approve', by: admin });
  async function paid() { return (await approve(await submitted())).order; }
  async function request(order, amountPiastres, overrides = {}) {
    return refunds.requestRefund({ orderId: order._id, revision: (await current(order._id)).revision, amountPiastres, requestKey: randomUUID(), reason: 'Isolated verified external return.', by: admin, ...overrides });
  }
  async function external(record, overrides = {}) {
    return refunds.reportExternalCompletion({ caseId: record._id, externalReference: `external-${randomUUID()}`, paymentMethod: 'instapay', evidenceSha256: 'a'.repeat(64), occurredAt: at, by: admin, ...overrides });
  }
  async function refund(order, amount) {
    const record = await request(order, amount); await external(record);
    return refunds.verifyRefund({ caseId: record._id, by: verifier });
  }
  const reject = (promise, codes) => assert.rejects(promise, error => codes.includes(error.code));

  await t.test('digital upload is not money; authorized approval records exact server total and atomic audit/outbox references', async () => {
    await fresh(); const order = await submitted();
    assert.equal(await models.PaymentEvent.countDocuments(), 0);
    const result = await approve(order), event = await models.PaymentEvent.findOne().lean();
    assert.equal(event.amountPiastres, 12000); assert.equal(event.direction, 1); assert.equal(String(event.by), String(admin));
    assert.equal(+event.occurredAt, +at); assert.equal(+event.recordedAt, +at);
    assert.equal(String(result.order.paymentHistory.at(-1).eventId), String(event._id));
    assert.equal((await models.PaymentProof.findById(order.paymentProofId)).state, 'approved');
    assert.equal(await models.OrderMail.countDocuments({ monetaryEventId: event._id, monetaryAmountPiastres: 12000 }), 1);
    assert.equal((await loadReconciliation({ models })).complete, true);
  });
  await t.test('COD collection requires delivery; inventory and fulfillment are preserved by collection', async () => {
    await fresh(); let order = await buy('cod');
    await reject(approve(order), ['PAYMENT_NOT_ALLOWED']);
    for (const status of ['confirmed', 'packing', 'shipped', 'delivered']) order = (await orders.transitionOrder({ id: order._id, revision: order.revision, status, by: admin })).order;
    const before = await models.Product.findById(product._id).lean();
    const result = await approve(order);
    assert.equal(result.order.fulfillmentState, 'delivered');
    assert.deepEqual(await models.Product.findById(product._id).lean(), before);
    assert.equal((await models.PaymentEvent.findOne()).paymentMethod, 'cod');
    assert.equal((await loadReconciliation({ models })).complete, true);
  });
  await t.test('rejected transfer records no collection; repeated and concurrent same approvals create one event/history/outbox', async () => {
    await fresh(); const first = await submitted();
    await payments.reviewPayment({ orderId: first._id, revision: first.revision, decision: 'reject', reason: 'Transfer not received.', by: admin });
    assert.equal(await models.PaymentEvent.countDocuments(), 0);
    const order = await submitted();
    const results = await Promise.all([approve(order), approve(order), approve(order)]);
    assert.equal(results.filter(result => result.changed).length, 1);
    assert.equal((await approve(order)).recovered, true);
    assert.equal(await models.PaymentEvent.countDocuments(), 1);
    assert.equal((await current(order._id)).paymentHistory.filter(row => row.state === 'paid').length, 1);
    assert.equal(await models.OrderMail.countDocuments({ kind: 'payment', paymentState: 'paid' }), 1);
    await reject(payments.reviewPayment({ orderId: order._id, revision: order.revision, decision: 'approve', by: verifier }), ['EDIT_CONFLICT']);
  });
  await t.test('failure inserting collection rolls back order, proof approval, audit and outbox', async () => {
    await fresh(); const order = await submitted(), before = await current(order._id), mails = await models.OrderMail.countDocuments();
    await db.failCommand({ failCommands: ['insert'], errorCode: 2 });
    try { await reject(approve(order), ['DATABASE_WRITE_FAILED']); } finally { await db.failCommand({}, 'off'); }
    assert.deepEqual(await current(order._id), before); assert.equal((await models.PaymentProof.findById(order.paymentProofId)).state, 'submitted');
    assert.equal(await models.PaymentEvent.countDocuments(), 0); assert.equal(await models.OrderMail.countDocuments(), mails);
  });
  await t.test('enabled outbox failure rolls back the monetary event as well as proof/state/history', async () => {
    await fresh(); const order = await submitted(), before = await current(order._id);
    await connection.db.command({ collMod: 'ordermails', validator: { _id: { $exists: false } }, validationLevel: 'strict' });
    try { await reject(approve(order), ['DATABASE_WRITE_FAILED']); }
    finally { await connection.db.command({ collMod: 'ordermails', validator: {} }); }
    assert.deepEqual(await current(order._id), before); assert.equal(await models.PaymentEvent.countDocuments(), 0);
    assert.equal((await models.PaymentProof.findById(order.paymentProofId)).state, 'submitted');
  });
  await t.test('body interruption retries safely and commit connection loss never replays collection body', async () => {
    await fresh(); let order = await submitted();
    await db.failCommand({ failCommands: ['insert'], closeConnection: true });
    try { await approve(order); } finally { await db.failCommand({}, 'off'); }
    assert.equal(await models.PaymentEvent.countDocuments(), 1);
    order = await submitted(); let bodies = 0;
    const monitor = event => { if (event.command.startTransaction) bodies++; };
    connection.getClient().on('commandStarted', monitor);
    await db.failCommand({ failCommands: ['commitTransaction'], closeConnection: true });
    try { await approve(order); } finally { await db.failCommand({}, 'off'); connection.getClient().off('commandStarted', monitor); }
    assert.equal(bodies, 1); assert.equal(await models.PaymentEvent.countDocuments({ orderId: order._id }), 1);
    assert.equal((await approve(order)).recovered, true);
  });
  await t.test('persistent uncertain commit returns a safe error; fresh same-request recovery cannot double record', async () => {
    await fresh(); const order = await submitted();
    // Execute the commit but make its acknowledgement uncertain. Unlike a
    // pre-execution connection close this does not leave an open transaction
    // holding locks until MongoDB's transaction lifetime expires.
    await db.failCommand({ failCommands: ['commitTransaction'], blockConnection: true, blockTimeMS: 200,
      writeConcernError: { code: 64, codeName: 'WriteConcernFailed', errmsg: 'Isolated uncertain acknowledgement' } }, { times: 10000 });
    try { await reject(approve(order), ['TRANSACTION_UNCERTAIN']); } finally { await db.failCommand({}, 'off'); }
    await approve(order);
    assert.equal(await models.PaymentEvent.countDocuments({ orderId: order._id }), 1);
    assert.equal((await current(order._id)).paymentHistory.filter(item => item.state === 'paid').length, 1);
  });
  await t.test('production refund foundation is disabled before reads/writes, independent of environment flags', async () => {
    await fresh(); const order = await paid(), before = await current(order._id);
    assert.equal(REFUND_RECORDING_ENABLED, false);
    const locked = createRefundFoundation({ ...options, env: { REFUND_RECORDING_ENABLED: 'true' } });
    await reject(locked.requestRefund({ orderId: order._id, by: admin }), ['REFUNDS_DISABLED']);
    await reject(locked.reportExternalCompletion({ by: admin }), ['REFUNDS_DISABLED']);
    await reject(locked.verifyRefund({ by: admin }), ['REFUNDS_DISABLED']);
    assert.deepEqual(await current(order._id), before); assert.equal(await models.RefundCase.countDocuments(), 0);
  });
  await t.test('refund request and external report are not refunds; independent verification is required', async () => {
    await fresh(); const order = await paid(), record = await request(order, 4000);
    await reject(refunds.verifyRefund({ caseId: record._id, by: verifier }), ['REFUND_CONFLICT']);
    await external(record);
    assert.equal(await models.PaymentEvent.countDocuments({ kind: 'refund' }), 0); assert.equal((await current(order._id)).paymentState, 'paid');
    await reject(refunds.verifyRefund({ caseId: record._id, by: admin }), ['REFUND_CONFLICT']);
    assert.equal((await refunds.verifyRefund({ caseId: record._id, by: verifier })).recovered, false);
  });
  await t.test('full refund is bounded, linked, auditable, idempotent and does not restore stock', async () => {
    await fresh(); const order = await paid(), before = await models.Product.findById(product._id).lean();
    const record = await request(order, 12000); await external(record);
    const result = await refunds.verifyRefund({ caseId: record._id, by: verifier });
    const again = await refunds.verifyRefund({ caseId: record._id, by: verifier });
    assert.equal(again.recovered, true); assert.equal(String(result.event._id), String(again.event._id));
    assert.equal((await current(order._id)).paymentState, 'refunded'); assert.equal((await current(order._id)).fulfillmentState, order.fulfillmentState);
    assert.deepEqual(await models.Product.findById(product._id).lean(), before);
    assert.equal(await models.OrderMail.countDocuments({ kind: 'refund_recorded', monetaryEventId: result.event._id }), 1);
    assert.equal((await loadReconciliation({ models })).complete, true);
    await reject(orders.transitionOrder({ id: order._id, revision: (await current(order._id)).revision, status: 'cancelled' }), ['REFUND_REQUIRED']);
  });
  await t.test('multiple partial refunds reduce available balance; final portion alone marks fully refunded', async () => {
    await fresh(); const order = await paid();
    await refund(order, 4000); assert.equal((await current(order._id)).paymentState, 'paid');
    await refund(order, 3000); await reject(request(order, 5001), ['REFUND_CONFLICT']);
    await refund(order, 5000); assert.equal((await current(order._id)).paymentState, 'refunded');
    assert.equal(await models.PaymentEvent.countDocuments({ kind: 'refund' }), 3);
    await reject(request(order, 1), ['REFUND_CONFLICT']);
    assert.equal((await loadReconciliation({ models })).complete, true);
  });
  await t.test('concurrent partial refunds cannot exceed collected funds, even when both requests were eligible', async () => {
    await fresh(); const order = await paid(), one = await request(order, 8000), two = await request(order, 8000);
    await external(one); await external(two);
    const results = await Promise.allSettled([one, two].map(record => refunds.verifyRefund({ caseId: record._id, by: verifier })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(await models.PaymentEvent.countDocuments({ kind: 'refund' }), 1);
    assert.equal((await loadReconciliation({ models })).issueCounts.EXTERNAL_REFUND_AWAITING_VERIFICATION, 1);
  });
  await t.test('duplicate external refund reference cannot deduct twice, including across orders', async () => {
    await fresh(); const one = await paid(), two = await paid(), reference = `external-${randomUUID()}`;
    const a = await request(one, 3000), b = await request(two, 4000);
    await external(a, { externalReference: reference }); await external(b, { externalReference: reference, paymentMethod: 'bank_transfer' });
    const results = await Promise.allSettled([a, b].map(record => refunds.verifyRefund({ caseId: record._id, by: verifier })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(await models.PaymentEvent.countDocuments({ kind: 'refund', externalReference: reference }), 1);
  });
  await t.test('refund insertion failure rolls back state, history and case verification', async () => {
    await fresh(); const order = await paid(), record = await request(order, 12000); await external(record);
    const before = await current(order._id);
    await db.failCommand({ failCommands: ['insert'], errorCode: 2 });
    try { await reject(refunds.verifyRefund({ caseId: record._id, by: verifier }), ['DATABASE_WRITE_FAILED']); } finally { await db.failCommand({}, 'off'); }
    assert.deepEqual(await current(order._id), before); assert.equal((await models.RefundCase.findById(record._id)).state, 'external_completed');
    assert.equal(await models.PaymentEvent.countDocuments({ kind: 'refund' }), 0);
  });
  await t.test('refund references are idempotent for the same request and reject different amounts or content', async () => {
    await fresh(); const order = await paid(), requestKey = randomUUID();
    const input = { orderId: order._id, revision: order.revision, amountPiastres: 3000, requestKey, reason: 'Isolated accounting request.', by: admin };
    const records = await Promise.all([refunds.requestRefund(input), refunds.requestRefund(input)]);
    assert.equal(String(records[0]._id), String(records[1]._id));
    await reject(refunds.requestRefund({ ...input, amountPiastres: 3001 }), ['REFUND_CONFLICT']);
    assert.equal(await models.RefundCase.countDocuments(), 1);
    await reject(external(records[0], { occurredAt: new Date(+at + 1000) }), ['INVALID_REFUND']);
    await reject(external(records[0], { evidenceSha256: 'not-evidence' }), ['INVALID_REFUND']);
    await reject(external(records[0], { paymentMethod: undefined }), ['INVALID_REFUND']);
    await external(records[0]);
    await reject(external(records[0], { externalReference: 'different-reference' }), ['REFUND_CONFLICT']);
  });
  await t.test('refund ledger records the verified external refund method rather than assuming the original collection channel', async () => {
    await fresh(); const order = await paid(), record = await request(order, 3000);
    await external(record, { paymentMethod: 'bank_transfer' });
    const { event } = await refunds.verifyRefund({ caseId: record._id, by: verifier });
    assert.equal(event.paymentMethod, 'bank_transfer'); assert.equal((await current(order._id)).paymentMethod, 'instapay');
    assert.equal((await loadReconciliation({ models })).complete, true);
  });
  await t.test('refund outbox failure atomically rolls back completion and monetary event', async () => {
    await fresh(); const order = await paid(), record = await request(order, 3000); await external(record);
    const before = await current(order._id);
    await connection.db.command({ collMod: 'ordermails', validator: { _id: { $exists: false } }, validationLevel: 'strict' });
    try { await reject(refunds.verifyRefund({ caseId: record._id, by: verifier }), ['DATABASE_WRITE_FAILED']); }
    finally { await connection.db.command({ collMod: 'ordermails', validator: {} }); }
    assert.deepEqual(await current(order._id), before); assert.equal(await models.PaymentEvent.countDocuments({ kind: 'refund' }), 0);
    assert.equal((await models.RefundCase.findById(record._id)).state, 'external_completed');
  });
  await t.test('legacy paid/refunded history is diagnosed without inferred events or refund amounts', async () => {
    await fresh(); const one = await buy(), two = await buy();
    await models.Order.updateOne({ _id: one._id }, { $set: { paymentState: 'paid', paymentHistory: [{ state: 'paid', at, by: admin }] } });
    await models.Order.updateOne({ _id: two._id }, { $set: { paymentState: 'refunded', paymentHistory: [{ state: 'paid', at, by: admin }, { state: 'refunded', at, by: admin }] } });
    const overview = await loadOverview('today', { now: new Date(+at + 1000), models });
    assert.equal(overview.financial.collectedPiastres, 0); assert.equal(overview.financial.refundAmountsPiastres, 0);
    assert.equal(overview.financial.netCollectedPiastres, null); assert.equal(overview.financial.missingCollectionEvents, 2);
    assert.equal(await models.PaymentEvent.countDocuments(), 0);
    await reject(request(await current(one._id), 100), ['REFUND_CONFLICT']);
  });
  await t.test('dashboard uses ledger event dates, distinct refund orders and negative period net; best sellers exclude any refunded sale', async () => {
    await fresh(); at = new Date('2026-10-25T18:00:00Z'); const old = await paid();
    at = new Date('2026-10-26T08:00:00Z'); await refund(old, 4000); await refund(old, 3000);
    let today = await loadOverview('today', { now: new Date(+at + 1000), models });
    assert.equal(today.financial.collectedPiastres, 0); assert.equal(today.financial.refundAmountsPiastres, 7000); assert.equal(today.financial.netCollectedPiastres, -7000);
    assert.equal(today.financial.recordedRefundOrdersInPeriod, 1); assert.equal(today.bestSellers.length, 0);
    await paid();
    today = await loadOverview('today', { now: new Date(+at + 1000), models });
    assert.equal(today.financial.averageOrderValuePiastres, 12000); assert.equal(today.financial.netCollectedPiastres, 5000);
    assert.equal(today.bestSellers[0].units, 1); assert.equal(today.metrics.pendingPaymentReviews, 0);
    assert.doesNotMatch(JSON.stringify(today), /isolated@example|Private isolated|01012345678|evidenceSha256|externalReference/);
  });
  await t.test('refund uses external event date, not later verification date', async () => {
    await fresh(); const order = await paid(), record = await request(order, 3000); await external(record);
    at = new Date('2026-10-27T08:00:00Z'); await refunds.verifyRefund({ caseId: record._id, by: verifier });
    const today = await loadOverview('today', { now: new Date(+at + 1000), models });
    assert.equal(today.financial.refundAmountsPiastres, 0);
    const month = await loadOverview('30d', { now: new Date(+at + 1000), models });
    assert.equal(month.series.find(point => point.date === '2026-10-26').refundPiastres, 3000);
  });
  await t.test('append-only hooks, session requirement, integer validation and unique collection index are enforced', async () => {
    await fresh(); const order = await paid(), event = await models.PaymentEvent.findOne().lean();
    await assert.rejects(models.PaymentEvent.updateOne({ _id: event._id }, { $set: { amountPiastres: 1 } }), /append-only/);
    await assert.rejects(models.PaymentEvent.deleteMany({}), /append-only/);
    await assert.rejects(models.PaymentEvent.replaceOne({ _id: event._id }, event), /append-only/);
    await assert.rejects(models.PaymentEvent.bulkWrite([{ deleteOne: { filter: {} } }]), /append-only/);
    await assert.rejects(models.PaymentEvent.insertMany([{ ...event, _id: new mongoose.Types.ObjectId() }]), /append-only/);
    await assert.rejects(connection.transaction(session => models.PaymentEvent.insertMany([{ ...event, _id: new mongoose.Types.ObjectId(), eventKey: randomUUID(), amountPiastres: 1.5 }], { session })), /integer/);
    await assert.rejects(connection.transaction(session => models.PaymentEvent.insertMany([{ ...event, _id: new mongoose.Types.ObjectId(), eventKey: randomUUID() }], { session })), error => error.code === 11000);
    assert.equal(await models.PaymentEvent.countDocuments({ orderId: order._id }), 1);
  });
  await t.test('bounded reconciliation detects corrupt legacy history, approved orphan proof, over-refund, state conflict and unverified refund', async () => {
    await fresh(); const order = await paid(), collection = await models.PaymentEvent.findOne().lean();
    // Corruption fixtures intentionally bypass application guards ONLY in owned test DB.
    await models.Order.updateOne({ _id: order._id }, { $set: { paymentState: 'unpaid' }, $push: { paymentHistory: { state: 'paid', at, by: admin } } });
    await models.PaymentEvent.collection.insertOne({ ...collection, _id: new mongoose.Types.ObjectId(), kind: 'refund', direction: -1, eventKey: randomUUID(), amountPiastres: 12001, sourceEventId: collection._id, externalReference: randomUUID() });
    await models.PaymentEvent.collection.insertMany([0.5, 'invalid-amount'].map(amountPiastres => ({ ...collection, _id: new mongoose.Types.ObjectId(), kind: 'refund', direction: -1, eventKey: randomUUID(), amountPiastres, sourceEventId: collection._id, externalReference: randomUUID() })));
    await models.PaymentProof.collection.insertOne({ orderId: new mongoose.Types.ObjectId(), state: 'approved' });
    const report = await loadReconciliation({ models });
    for (const code of ['DUPLICATE_PAID_HISTORY', 'EXCESS_REFUNDS', 'STATE_LEDGER_CONFLICT', 'UNVERIFIED_REFUND', 'APPROVED_PROOF_WITHOUT_COLLECTION', 'INVALID_EVENT']) assert.ok(report.issueCounts[code], code);
    assert.ok(report.items.length <= 25); assert.doesNotMatch(JSON.stringify(report), /isolated@example|Private isolated|01012345678|externalReference/);
    assert.equal((await loadOverview('today', { now: new Date(+at + 1000), models })).financial.netCollectedPiastres, null);
  });
  await t.test('reconciliation bounds details while counting all issues and never silently repairs legacy orders', async () => {
    await fresh(); const template = await buy();
    await models.Order.collection.insertMany(Array.from({ length: 30 }, () => ({ ...template, _id: new mongoose.Types.ObjectId(), orderNumber: `QC-${randomUUID()}`, checkoutKey: randomUUID(), paymentState: 'paid' })));
    const report = await loadReconciliation({ models });
    assert.equal(report.issueCounts.MISSING_COLLECTION, 30); assert.equal(report.items.length, 25); assert.equal(report.limit, 25);
    assert.equal(await models.PaymentEvent.countDocuments(), 0); assert.equal(await models.Order.countDocuments({ paymentState: 'paid' }), 30);
  });
  await t.test('reserved corrections require explicit evidence and authorization metadata and withhold authoritative net', async () => {
    await fresh(); await paid(); const collection = await models.PaymentEvent.findOne().lean();
    const correction = { ...collection, _id: new mongoose.Types.ObjectId(), eventKey: randomUUID(), kind: 'correction', sourceEventId: collection._id, amountPiastres: 100, direction: -1 };
    await assert.rejects(connection.transaction(session => models.PaymentEvent.insertMany([correction], { session })), /authorization/);
    await connection.transaction(session => models.PaymentEvent.insertMany([{ ...correction, authorizationReference: 'isolated-test-approval', evidenceSha256: 'b'.repeat(64) }], { session }));
    const report = await loadReconciliation({ models }); assert.equal(report.issueCounts.ADJUSTMENT_REQUIRES_REVIEW, 1);
    assert.equal((await loadOverview('today', { now: new Date(+at + 1000), models })).financial.netCollectedPiastres, null);
  });
});
