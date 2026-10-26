import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { isolatedCommerceDatabase } from '../testing/isolated-commerce.js';
import { createMailQueue } from '../src/notifications/mail-queue.js';
import { createOrderMailWorker, queueOrderMail } from '../src/notifications/order-mail.js';
import { notificationDocuments } from '../src/notifications/order-mail-values.js';
import { MAIL_LEASE_MS, MAIL_SEND_MS, retryDelay } from '../src/notifications/mail-policy.js';
import { loadOperations } from '../src/admin/operations-service.js';
import { createOrderService } from '../src/commerce/order-service.js';
import { createPaymentService } from '../src/commerce/payment-service.js';
import { createRefundFoundation } from '../src/accounting/refund-foundation.js';
import { verifiedProofKey, proofKey } from '../src/payments/proof.js';

const uri = process.env.QC_COMMERCE_TEST_MONGO_URI;
const env = { ORDER_EMAILS_ENABLED: 'true', SMTP_HOST: 'smtp.example.invalid', SMTP_USER: 'fixture', SMTP_PASSWORD: 'fake-not-a-secret', MAIL_FROM: 'shop@example.invalid', ORDER_ALERT_EMAIL: 'owner@example.invalid', PUBLIC_SITE_ORIGIN: 'https://quantum.example' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function manualTimers() {
  const jobs = new Map(); let id = 0;
  return { jobs, setTimeout(fn, ms) { const key = ++id; jobs.set(key, { fn, ms }); return key; }, clearTimeout(key) { jobs.delete(key); }, fire(ms) { for (const [key, item] of jobs) if (item.ms === ms) { jobs.delete(key); item.fn(); break; } } };
}
test('real MongoDB notification fencing, restart recovery, privacy and side-effect diagnostics', { skip: !uri, timeout: 120000 }, async t => {
  const db = await isolatedCommerceDatabase(uri), { models, connection } = db;
  t.after(() => db.close());
  let instant = new Date(), sent = [], logs = [], closed = 0;
  const clock = () => instant;
  const options = { models, connection, env, clock };
  const queue = () => createMailQueue({ model: models.OrderMail, clock });
  const worker = (send = async message => ({ accepted: [message.to] }), extra = {}) => createOrderMailWorker({ model: models.OrderMail, models, env, clock, isReady: () => true,
    log: code => logs.push(code), transportFactory: signal => ({ async sendMail(message) { sent.push(message); return send(message, signal); }, close() { closed++; } }), ...extra });
  const saved = id => models.OrderMail.findById(id).lean();
  async function fresh() { await db.reset(); instant = new Date(Date.now() + 1000); sent = []; logs = []; closed = 0; }
  async function job(overrides = {}) {
    const order = { _id: new mongoose.Types.ObjectId(), revision: 0, orderNumber: 'QC-AABBCC112233', customer: { email: 'customer@example.invalid' }, paymentState: 'awaiting_transfer', fulfillmentState: 'received', totalPiastres: 12000 };
    return models.OrderMail.create({ ...notificationDocuments('placed', order, env)[0], nextAttemptAt: instant, ...overrides });
  }
  async function digitalOrder() {
    const category = await models.Category.create({ name: { en: 'Isolated C3' }, slug: randomUUID(), active: true });
    const product = await models.Product.create({ name: { en: 'Isolated coffee' }, slug: randomUUID(), categoryId: category._id, status: 'published', pricePiastres: 10000, stockQuantity: 5,
      sizes: [{ grams: 250, pricePiastres: 10000, grindOptions: [{ code: 'espresso', stockQuantity: 5 }] }] });
    const order = (await createOrderService(options).checkout({ checkoutKey: randomUUID(), customer: { name: 'Fixture', phone: '01012345678', email: 'customer@example.invalid', governorate: 'cairo', city: 'Test', street: 'Private fixture street' }, paymentMethod: 'instapay', items: [{ productId: String(product._id), sizeGrams: 250, grindCode: 'espresso', quantity: 1 }] }, { shippingPiastres: 2000 })).order;
    const payments = createPaymentService(options);
    const proof = await payments.reserveProofUpload({ orderId: order._id, contentType: 'image/png', extension: 'png', size: 100 });
    return { order, proof, payments };
  }
  const advance = ms => { instant = new Date(+instant + ms); };

  await t.test('two worker instances compete atomically for one message', async () => {
    await fresh(); const record = await job(), entered = deferred(), release = deferred();
    const one = worker(async message => { entered.resolve(); await release.promise; return { accepted: [message.to] }; });
    const processing = one.processBatch(); await entered.promise;
    assert.equal((await worker().processBatch()).processed, 0);
    release.resolve(); await processing;
    assert.equal(sent.length, 1); assert.equal((await saved(record._id)).state, 'sent'); assert.equal((await saved(record._id)).attempts, 1);
  });
  await t.test('SMTP beyond expired lease cannot finalize over a recovery owner or start a second send', async () => {
    await fresh(); const record = await job(), entered = deferred(), release = deferred(), timers = manualTimers();
    const running = worker(async message => { entered.resolve(); await release.promise; return { accepted: [message.to] }; }, { timers }).processBatch();
    await entered.promise; const old = await saved(record._id); advance(MAIL_LEASE_MS + 1);
    await worker().processBatch(); const recovered = await saved(record._id);
    assert.equal(recovered.state, 'uncertain'); assert.notEqual(recovered.leaseToken, old.leaseToken);
    release.resolve(); await running;
    assert.equal((await saved(record._id)).state, 'uncertain'); assert.equal(sent.length, 1); assert.ok(logs.includes('LEASE_OWNERSHIP_LOST')); assert.equal(timers.jobs.size, 0);
  });
  await t.test('absolute send deadline aborts and closes transport, quarantining ambiguous acceptance', async () => {
    await fresh(); const record = await job(), entered = deferred(), release = deferred(), timers = manualTimers(); let aborted = false;
    const running = worker(async (message, signal) => { signal.addEventListener('abort', () => { aborted = true; }); entered.resolve(); await release.promise; return { accepted: [message.to] }; }, { timers }).processBatch();
    await entered.promise; timers.fire(MAIL_SEND_MS); await running;
    assert.equal(aborted, true); assert.equal(closed, 1); assert.equal(timers.jobs.size, 0); assert.equal((await saved(record._id)).state, 'uncertain');
    release.resolve(); await worker().processBatch(); assert.equal(sent.length, 1);
  });
  await t.test('restart safely recovers a crash before SMTP dispatch using a fresh token and backoff', async () => {
    await fresh(); const record = await job(), old = await queue().claim();
    advance(MAIL_LEASE_MS + 1); await queue().recover();
    assert.equal((await saved(record._id)).state, 'pending'); assert.equal(await queue().dispatch(old), false);
    advance(retryDelay(1) + 1); await worker().processBatch();
    assert.equal(sent.length, 1); assert.equal((await saved(record._id)).attempts, 2); assert.equal((await saved(record._id)).state, 'sent');
  });
  await t.test('post-acceptance DB interruption does not reset to pending or resend; restart reports uncertainty', async () => {
    await fresh(); const record = await job();
    try {
      const result = await worker(async message => { await db.failCommand({ failCommands: ['update'], errorCode: 2 }, { times: 2 }); return { accepted: [message.to] }; }).processBatch();
      assert.equal(result.status, 'database_unavailable');
    } finally { await db.failCommand({}, 'off'); }
    assert.equal((await saved(record._id)).phase, 'dispatching'); assert.equal(sent.length, 1);
    advance(MAIL_LEASE_MS + 1); await worker().processBatch();
    assert.equal((await saved(record._id)).state, 'uncertain'); assert.equal(sent.length, 1);
    assert.deepEqual(logs, ['NOTIFICATION_DATABASE_UNAVAILABLE']);
  });
  await t.test('a stale claimed worker cannot dispatch, reset or finalize after a fresh claim', async () => {
    await fresh(); const record = await job(), old = await queue().claim();
    advance(MAIL_LEASE_MS + 1); await queue().recover(); advance(retryDelay(1) + 1);
    const owner = await queue().claim();
    assert.notEqual(old.leaseToken, owner.leaseToken); assert.equal(await queue().dispatch(old), false);
    assert.equal(await queue().finish(old, { state: 'sent' }), false);
    assert.equal(await queue().dispatch(owner), true); assert.equal(await queue().finish(owner, { state: 'sent' }), true);
    assert.equal((await saved(record._id)).leaseToken, owner.leaseToken);
  });
  await t.test('a lost DB acknowledgement after successful finalization retries only the fenced update', async () => {
    await fresh(); const record = await job();
    try {
      await worker(async message => { await db.failCommand({ failCommands: ['update'], writeConcernError: { code: 64, errmsg: 'Simulated acknowledgement loss' } }); return { accepted: [message.to] }; }).processBatch();
    } finally { await db.failCommand({}, 'off'); }
    assert.equal((await saved(record._id)).state, 'sent'); assert.equal(sent.length, 1);
  });
  await t.test('crash after dispatch intent but before transport cannot be assumed unsent on restart', async () => {
    await fresh(); const record = await job(), claimed = await queue().claim(); await queue().dispatch(claimed);
    advance(MAIL_LEASE_MS + 1); await worker().processBatch();
    assert.equal((await saved(record._id)).state, 'uncertain'); assert.equal(sent.length, 0);
  });
  await t.test('temporary SMTP rejection backs off and retry keeps stable identifiers', async () => {
    await fresh(); const record = await job();
    await worker(async () => { throw Object.assign(new Error('PRIVATE customer@example.invalid password SECRET'), { responseCode: 451, response: 'PRIVATE', code: 'ESMTP' }); }).processBatch();
    let state = await saved(record._id); assert.equal(state.state, 'pending'); assert.equal(state.lastError, 'SMTP_TEMPORARY_REJECTION'); assert.equal(+state.nextAttemptAt, +instant + retryDelay(1));
    await worker().processBatch(); assert.equal(sent.length, 1);
    advance(retryDelay(1) + 1); await worker().processBatch(); state = await saved(record._id);
    assert.equal(state.state, 'sent'); assert.equal(sent[0].messageId, sent[1].messageId); assert.equal(sent[0].headers['X-Quantum-Notification'], record.dedupeKey); assert.deepEqual(logs, []);
  });
  await t.test('permanent rejection and authentication failure dead-letter without retry', async () => {
    for (const error of [Object.assign(new Error('private'), { responseCode: 550 }), Object.assign(new Error('private'), { code: 'EAUTH' })]) {
      await fresh(); const record = await job(); await worker(async () => { throw error; }).processBatch();
      assert.equal((await saved(record._id)).state, 'dead'); advance(86400000); await worker().processBatch(); assert.equal(sent.length, 1);
    }
  });
  await t.test('five attempts exhaust retries; no message is stranded forever at the attempt ceiling', async () => {
    await fresh(); const record = await job();
    for (let i = 1; i <= 5; i++) { await worker(async () => { throw Object.assign(new Error('private'), { responseCode: 450 }); }).processBatch(); advance(retryDelay(i) + 1); }
    assert.equal(sent.length, 5); assert.equal((await saved(record._id)).state, 'dead'); assert.equal((await saved(record._id)).lastError, 'RETRY_EXHAUSTED');
    const legacy = await job({ attempts: 5 }); await queue().recover(); assert.equal((await saved(legacy._id)).state, 'dead');
  });
  await t.test('legacy or final-attempt expired sending records are quarantined, never silently resent', async () => {
    await fresh(); const record = await job({ attempts: 5, state: 'sending', lockUntil: new Date(+instant - 1), phase: null });
    await worker().processBatch(); assert.equal((await saved(record._id)).state, 'uncertain'); assert.equal(sent.length, 0);
  });
  await t.test('claim DB failures do not transmit; subsequent recovery works', async () => {
    await fresh(); const record = await job(); await db.failCommand({ failCommands: ['findAndModify'], errorCode: 2 });
    try { await assert.rejects(queue().claim()); } finally { await db.failCommand({}, 'off'); }
    assert.equal((await saved(record._id)).state, 'pending'); assert.equal(sent.length, 0);
    await worker().processBatch(); assert.equal((await saved(record._id)).state, 'sent');
  });
  await t.test('shutdown stops new claims, drains active send and cancels all timers', async () => {
    await fresh(); await job(); const second = await job(), entered = deferred(), release = deferred(), timers = manualTimers();
    const runner = worker(async message => { entered.resolve(); await release.promise; return { accepted: [message.to] }; }, { timers });
    runner.start(); runner.start(); await entered.promise; const stopped = runner.stop(); release.resolve(); await stopped;
    assert.equal(sent.length, 1); assert.equal((await saved(second._id)).state, 'pending'); assert.equal(timers.jobs.size, 0);
  });
  await t.test('disabled and unconfigured modes allocate no timers, transport or DB work', async () => {
    await fresh(); const record = await job(), timers = manualTimers();
    for (const disabled of [{ ...env, ORDER_EMAILS_ENABLED: 'false' }, { ...env, SMTP_HOST: '' }]) {
      const runner = worker(undefined, { env: disabled, timers }); runner.start(); const result = await runner.processBatch();
      assert.ok(['disabled','unconfigured'].includes(result.status)); assert.equal(timers.jobs.size, 0);
    }
    assert.equal((await saved(record._id)).attempts, 0); assert.equal(sent.length, 0);
  });
  await t.test('collection and partial-refund mail use real ledger IDs, exact amounts and one record per event/audience', async () => {
    await fresh(); const { order, proof, payments } = await digitalOrder();
    const submitted = (await payments.confirmProof({ orderId: order._id, proofId: proof._id, frozenKey: verifiedProofKey(proof.key) })).order;
    const actor = new mongoose.Types.ObjectId(), paid = (await payments.reviewPayment({ orderId: order._id, revision: submitted.revision, decision: 'approve', by: actor })).order;
    const collection = await models.PaymentEvent.findOne({ kind: 'collection' }).lean();
    await connection.transaction(session => queueOrderMail('payment', { ...paid, revision: paid.revision + 1 }, session, { model: models.OrderMail, models, env, monetary: { eventId: collection._id, amountPiastres: collection.amountPiastres } }));
    assert.equal(await models.OrderMail.countDocuments({ monetaryEventId: collection._id }), 1);
    const refunds = createRefundFoundation({ ...options, authorize: async () => true });
    const record = await refunds.requestRefund({ orderId: order._id, revision: paid.revision, amountPiastres: 3000, requestKey: randomUUID(), reason: 'Isolated refund evidence.', by: actor });
    await refunds.reportExternalCompletion({ caseId: record._id, externalReference: randomUUID(), paymentMethod: 'instapay', evidenceSha256: 'a'.repeat(64), occurredAt: instant, by: actor });
    const { event } = await refunds.verifyRefund({ caseId: record._id, by: new mongoose.Types.ObjectId() });
    assert.equal(await models.OrderMail.countDocuments({ monetaryEventId: event._id }), 1);
    advance(1000); await worker().processBatch(); await worker().processBatch();
    assert.ok(sent.some(message => /Verified collection: 120\.00 EGP/.test(message.text)));
    assert.ok(sent.some(message => /Verified refund: 30\.00 EGP/.test(message.text)));
    assert.equal(await models.OrderMail.countDocuments({ state: { $ne: 'sent' } }), 0);
  });
  await t.test('monetary messages with missing or inconsistent ledger evidence are never sent', async () => {
    await fresh(); const record = await job({ kind: 'payment', paymentState: 'paid', monetaryEventId: new mongoose.Types.ObjectId(), monetaryAmountPiastres: 12000 });
    await worker().processBatch(); assert.equal((await saved(record._id)).state, 'dead'); assert.equal((await saved(record._id)).lastError, 'MONETARY_EVENT_MISMATCH'); assert.equal(sent.length, 0);
  });
  await t.test('operational aggregates expose only counts/times, including known/uncertain orphan candidates', async () => {
    await fresh(); await job({ state: 'dead', lastError: 'PRIVATE password customer@example.invalid payment-proofs/SECRET', failureClass: 'integrity' });
    await job({ state: 'sending', lockUntil: new Date(+instant - 1), phase: 'dispatching' });
    await models.PaymentProof.create({ orderId: new mongoose.Types.ObjectId(), key: proofKey('png'), contentType: 'image/png', size: 100, expiresAt: new Date(+instant - 1), freezeAttempts: [
      { key: 'PRIVATE-COPY', startedAt: new Date(+instant - 1000000), copiedAt: instant }, { key: 'PRIVATE-UNKNOWN', startedAt: new Date(+instant - 1000000) }] });
    await models.MediaAsset.create({ key: 'catalog/PRIVATE', ownerId: new mongoose.Types.ObjectId(), contentType: 'image/png', size: 100, state: 'verified' });
    const health = await loadOperations({ models, env: { ...env, ORDER_EMAILS_ENABLED: 'false' }, now: instant });
    assert.equal(health.email.mode, 'disabled'); assert.equal(health.email.dead, 1); assert.equal(health.email.stuck, 1); assert.equal(health.storage.unattachedProofCopies, 1); assert.equal(health.storage.uncertainProofCopies, 1); assert.equal(health.storage.unattachedImages, 1);
    assert.equal(health.storage.objectInventoryScanned, false); assert.doesNotMatch(JSON.stringify(health), /PRIVATE|password|customer@example|payment-proofs|smtp.example|fake-not/);
  });
  await t.test('concurrent proof copies have unique destinations; stale confirmation cannot replace committed evidence', async () => {
    await fresh(); const { order, proof, payments } = await digitalOrder();
    const keys = await Promise.all([payments.startProofFreeze({ orderId: order._id, proofId: proof._id }), payments.startProofFreeze({ orderId: order._id, proofId: proof._id })]);
    const b = (await models.PaymentProof.findById(proof._id)).freezeCandidateKey, a = keys.find(key => key !== b); assert.notEqual(a, b);
    await payments.noteProofCopied({ orderId: order._id, proofId: proof._id, key: a });
    await assert.rejects(payments.confirmProof({ orderId: order._id, proofId: proof._id, frozenKey: a }), error => error.code === 'PROOF_INVALID');
    await payments.noteProofCopied({ orderId: order._id, proofId: proof._id, key: b });
    await payments.confirmProof({ orderId: order._id, proofId: proof._id, frozenKey: b });
    assert.equal((await payments.confirmProof({ orderId: order._id, proofId: proof._id, frozenKey: a })).recovered, true);
    assert.equal((await models.PaymentProof.findById(proof._id)).verifiedKey, b); assert.equal(await models.PaymentEvent.countDocuments(), 0);
  });
  await t.test('copy accepted but audit DB failure remains diagnosable; retry attaches a new key without deleting old objects', async () => {
    await fresh(); const { order, proof, payments } = await digitalOrder(), objects = new Map();
    const a = await payments.startProofFreeze({ orderId: order._id, proofId: proof._id }); objects.set(a, 'simulated R2 copy');
    await db.failCommand({ failCommands: ['update'], errorCode: 2 });
    try { await assert.rejects(payments.noteProofCopied({ orderId: order._id, proofId: proof._id, key: a })); } finally { await db.failCommand({}, 'off'); }
    const b = await payments.startProofFreeze({ orderId: order._id, proofId: proof._id }); objects.set(b, 'simulated R2 copy');
    await payments.noteProofCopied({ orderId: order._id, proofId: proof._id, key: b }); await payments.confirmProof({ orderId: order._id, proofId: proof._id, frozenKey: b });
    advance(1000000); const health = await loadOperations({ models, env, now: instant });
    assert.equal(health.storage.uncertainProofCopies, 1); assert.equal(objects.size, 2); assert.equal((await models.PaymentProof.findById(proof._id)).verifiedKey, b);
  });
  await t.test('copy-attempt records are bounded to five, with no payment or inventory side effects', async () => {
    await fresh(); const { order, proof, payments } = await digitalOrder();
    for (let i = 0; i < 5; i++) await payments.startProofFreeze({ orderId: order._id, proofId: proof._id });
    await assert.rejects(payments.startProofFreeze({ orderId: order._id, proofId: proof._id }), error => error.code === 'PROOF_LIMIT');
    assert.equal((await models.PaymentProof.findById(proof._id)).freezeAttempts.length, 5); assert.equal(await models.PaymentEvent.countDocuments(), 0);
  });
  await t.test('external refund report rolls back its case when the order audit update matches zero rows', async () => {
    await fresh(); const { order, proof, payments } = await digitalOrder(), actor = new mongoose.Types.ObjectId();
    const submitted = (await payments.confirmProof({ orderId: order._id, proofId: proof._id, frozenKey: verifiedProofKey(proof.key) })).order;
    const paid = (await payments.reviewPayment({ orderId: order._id, revision: submitted.revision, decision: 'approve', by: actor })).order;
    const refunds = createRefundFoundation({ ...options, authorize: async () => true });
    const record = await refunds.requestRefund({ orderId: order._id, revision: paid.revision, amountPiastres: 1000, requestKey: randomUUID(), reason: 'Isolated audit rollback.', by: actor });
    const original = models.Order.updateOne.bind(models.Order);
    // Induce a real zero-match and transaction rollback in this disposable DB.
    const mocked = t.mock.method(models.Order, 'updateOne', async (filter, update, settings) => {
      await models.Order.collection.deleteOne({ _id: order._id }, { session: settings.session });
      return original(filter, update, settings);
    });
    try { await assert.rejects(refunds.reportExternalCompletion({ caseId: record._id, externalReference: randomUUID(), paymentMethod: 'instapay', evidenceSha256: 'a'.repeat(64), occurredAt: instant, by: actor }), error => error.code === 'REFUND_CONFLICT'); }
    finally { mocked.mock.restore(); }
    assert.equal((await models.RefundCase.findById(record._id)).state, 'requested');
    assert.ok(await models.Order.exists({ _id: order._id })); assert.equal(await models.PaymentEvent.countDocuments({ kind: 'refund' }), 0);
  });
});
