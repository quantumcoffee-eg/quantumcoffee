import mongoose from 'mongoose';
import { CommerceError } from '../commerce/checkout.js';
import { commerceContext, transactionOrder, requireRevision } from '../commerce/service-context.js';

// No route, environment flag, worker, or production caller enables this policy.
// A future reviewed owner-approved process must supply authorization backed by
// real external evidence. Tests inject that policy only against a local replica.
export const REFUND_RECORDING_ENABLED = false;
const locked = async () => false;
const token = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{4,119}$/.test(value);
const actor = value => mongoose.isObjectIdOrHexString(value);
const conflict = message => new CommerceError(message, 'REFUND_CONFLICT', 409);

export function refundableBalance(collection, refunds) {
  if (!collection || !Number.isSafeInteger(collection.amountPiastres) || collection.amountPiastres < 1) throw conflict('A verified collection is required. Legacy orders need manual reconciliation.');
  let used = 0;
  for (const event of refunds) {
    if (event.kind !== 'refund' || event.direction !== -1 || String(event.sourceEventId) !== String(collection._id) || !Number.isSafeInteger(event.amountPiastres) || event.amountPiastres < 1) throw conflict('The monetary history needs reconciliation.');
    used += event.amountPiastres;
    if (!Number.isSafeInteger(used) || used > collection.amountPiastres) throw conflict('Refunds exceed the verified collection.');
  }
  return collection.amountPiastres - used;
}

export function createRefundFoundation({ authorize = locked, ...options } = {}) {
  if (!REFUND_RECORDING_ENABLED && authorize !== locked) {
    const connection = options.connection;
    // The disabled production policy cannot be bypassed by an environment
    // variable or accidental policy injection against an application database.
    if (!connection || connection.host !== '127.0.0.1' || !/^qc_c1_test_[a-f0-9]{32}$/.test(connection.name || '') || connection.getClient().options.replicaSet !== 'qc-c1-rs') {
      throw new CommerceError('Refund policy injection is restricted to disposable local replica-set tests.', 'REFUNDS_DISABLED', 403);
    }
  }
  const { models: { Order, PaymentEvent, RefundCase }, now, transaction: runTransaction, notify } = commerceContext(options);
  const transaction = async callback => {
    try { return await runTransaction(callback); }
    catch (error) { if (error?.code === 11000) throw conflict('A refund reference was already used. Refresh the accounting report.'); throw error; }
  };
  async function guard(action, input) {
    if (!actor(input.by) || await authorize(action, input) !== true) throw new CommerceError('Refund recording is disabled pending an approved external-refund process.', 'REFUNDS_DISABLED', 403);
    await PaymentEvent.init();
    await RefundCase.init();
  }
  async function balance(order, session) {
    const collection = await PaymentEvent.findOne({ orderId: order._id, kind: 'collection' }).session(session).lean();
    const others = await PaymentEvent.find({ orderId: order._id, kind: { $ne: 'collection' } }).session(session).limit(1001).lean();
    if (others.length > 1000) throw conflict('The monetary history requires manual reconciliation.');
    const remaining = refundableBalance(collection, others);
    if (collection.amountPiastres !== order.totalPiastres || collection.paymentMethod !== order.paymentMethod ||
      !order.paymentHistory.some(item => item.state === 'paid' && String(item.eventId) === String(collection._id))) throw conflict('The order and collection need reconciliation.');
    return { collection, remaining };
  }
  async function requestRefund(input) {
    await guard('request', input);
    const { orderId, revision, amountPiastres, requestKey, reason, by } = input;
    if (!token(requestKey) || !Number.isSafeInteger(amountPiastres) || amountPiastres < 1 || amountPiastres > 1000000000 || typeof reason !== 'string' || reason.trim().length < 5 || reason.length > 300) throw new CommerceError('Invalid refund request.', 'INVALID_REFUND');
    return transaction(async session => {
      const order = await transactionOrder(Order, orderId, session);
      const prior = await RefundCase.findOne({ requestKey }).session(session).lean();
      if (prior) {
        if (String(prior.orderId) !== String(orderId) || prior.amountPiastres !== amountPiastres || String(prior.requestedBy) !== String(by) || prior.reason !== reason.trim()) throw conflict('Refund reference was used for different content.');
        return prior;
      }
      requireRevision(order, revision);
      const { collection, remaining } = await balance(order, session);
      if (order.paymentState !== 'paid' || amountPiastres > remaining) throw conflict('Refund exceeds the remaining verified collection.');
      // Serialize workflow audit entries with every other order write.
      const result = await Order.updateOne({ _id: orderId, revision }, { $inc: { revision: 1 }, $push: { paymentHistory: { state: 'refund_requested', at: now(), by, reason: reason.trim() } } }, { session });
      if (result.modifiedCount !== 1) throw conflict('Order changed. Reload first.');
      const [record] = await RefundCase.insertMany([{ orderId, collectionId: collection._id, requestKey, amountPiastres, reason: reason.trim(), requestedBy: by }], { session });
      return record.toObject();
    });
  }
  async function reportExternalCompletion(input) {
    await guard('report_external_completion', input);
    const { caseId, externalReference, paymentMethod, evidenceSha256, occurredAt, by } = input;
    if (!['cash', 'instapay', 'vodafone_cash', 'bank_transfer'].includes(paymentMethod) || !token(externalReference) || !/^[a-f0-9]{64}$/.test(evidenceSha256 || '') || !(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime()) || occurredAt > now()) throw new CommerceError('External refund evidence and the actual refund method are required.', 'INVALID_REFUND');
    return transaction(async session => {
      const record = await RefundCase.findById(caseId).session(session).lean();
      if (!record) throw new CommerceError('Refund request not found.', 'NOT_FOUND', 404);
      if (record.state !== 'requested') {
        if (record.externalReference === externalReference && record.paymentMethod === paymentMethod && record.evidenceSha256 === evidenceSha256 && +record.occurredAt === +occurredAt && String(record.reportedBy) === String(by)) return record;
        throw conflict('External completion was already reported with different evidence.');
      }
      const collection = await PaymentEvent.findById(record.collectionId).session(session).lean();
      if (!collection || occurredAt < collection.occurredAt) throw conflict('A refund cannot predate its collection.');
      const result = await RefundCase.findOneAndUpdate({ _id: caseId, state: 'requested' }, { $set: { state: 'external_completed', externalReference, paymentMethod, evidenceSha256, occurredAt, reportedBy: by, reportedAt: now() } }, { session, new: true, runValidators: true }).lean();
      if (!result) throw conflict('Refund request changed. Reload first.');
      await Order.updateOne({ _id: record.orderId }, { $inc: { revision: 1 }, $push: { paymentHistory: { state: 'refund_external_reported', at: now(), by, reason: 'External completion reported; independent verification still required.' } } }, { session });
      return result;
    });
  }
  async function verifyRefund(input) {
    await guard('verify_external_completion', input);
    const { caseId, by } = input;
    const eventId = new mongoose.Types.ObjectId();
    return transaction(async session => {
      const record = await RefundCase.findById(caseId).session(session).lean();
      if (!record) throw new CommerceError('Refund request not found.', 'NOT_FOUND', 404);
      if (record.state === 'recorded') {
        const event = await PaymentEvent.findOne({ _id: record.eventId, refundCaseId: record._id, kind: 'refund' }).session(session).lean();
        if (!event) throw conflict('Recorded refund is missing its monetary event.');
        return { event, recovered: true };
      }
      if (record.state !== 'external_completed' || String(record.reportedBy) === String(by) || String(record.requestedBy) === String(by)) throw conflict('A separate administrator must verify external completion.');
      const order = await transactionOrder(Order, record.orderId, session), at = now();
      const { collection, remaining } = await balance(order, session);
      if (order.paymentState !== 'paid' || record.amountPiastres > remaining || String(collection._id) !== String(record.collectionId)) throw conflict('Refund exceeds the remaining verified collection.');
      if (await PaymentEvent.exists({ kind: 'refund', externalReference: record.externalReference }).session(session)) throw conflict('This external refund reference has already been recorded.');
      const state = record.amountPiastres === remaining ? 'refunded' : 'paid';
      const updated = await Order.findOneAndUpdate({ _id: order._id, revision: order.revision, paymentState: 'paid' },
        { $set: { paymentState: state }, $inc: { revision: 1 }, $push: { paymentHistory: { state: state === 'refunded' ? 'refunded' : 'partial_refund', at, by, reason: record.reason, eventId } } }, { session, new: true, runValidators: true }).lean();
      if (!updated) throw conflict('Order changed. Reload first.');
      const [event] = await PaymentEvent.insertMany([{ _id: eventId, orderId: order._id, eventKey: `refund:${record._id}`, kind: 'refund', direction: -1,
        amountPiastres: record.amountPiastres, paymentMethod: record.paymentMethod, occurredAt: record.occurredAt, recordedAt: at, by, orderRevision: updated.revision,
        sourceEventId: collection._id, refundCaseId: record._id, externalReference: record.externalReference, evidenceSha256: record.evidenceSha256, reason: record.reason }], { session });
      const result = await RefundCase.updateOne({ _id: caseId, state: 'external_completed' }, { $set: { state: 'recorded', eventId, verifiedAt: at, verifiedBy: by } }, { session });
      if (result.modifiedCount !== 1) throw conflict('Refund request changed. Reload first.');
      // No stock change. Existing paid/refunded history continues to block C1 cancellation.
      await notify('refund_recorded', updated, session, { eventId, amountPiastres: record.amountPiastres });
      return { event: event.toObject(), recovered: false };
    });
  }
  return { requestRefund, reportExternalCompletion, verifyRefund };
}
export const refundFoundation = createRefundFoundation();
