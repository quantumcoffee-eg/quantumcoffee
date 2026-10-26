import { CommerceError } from './checkout.js';
import { commerceContext, transactionOrder, requireRevision, requireUncollected } from './service-context.js';
import { proofEligible, proofKey, verifiedProofKey, PROOF_WINDOW_MS, PROOF_TYPES, PROOF_MAX_BYTES } from '../payments/proof.js';
import mongoose from 'mongoose';

export function createPaymentService(options = {}) {
  const { models: { Order, PaymentProof, PaymentEvent }, now, transaction, notify } = commerceContext(options);
  async function reserveProofUpload({ orderId, contentType, size, extension }) {
    if (PROOF_TYPES[contentType] !== extension || !Number.isSafeInteger(size) || size < 1 || size > PROOF_MAX_BYTES) throw new CommerceError('Invalid proof upload.', 'INVALID_PROOF');
    const key = proofKey(extension);
    return transaction(async session => {
      const order = await transactionOrder(Order, orderId, session), at = now();
      if (!proofEligible(order)) throw new CommerceError('This order cannot receive payment proof right now.', 'PROOF_NOT_ALLOWED', 409);
      requireUncollected(order);
      if (await PaymentProof.countDocuments({ orderId, createdAt: { $gte: new Date(at.getTime() - 86400000) } }).session(session) >= 5) throw new CommerceError('Too many uploads for this order. Contact the shop.', 'PROOF_LIMIT', 429);
      if (await PaymentProof.exists({ orderId, state: 'pending', expiresAt: { $gt: at } }).session(session)) throw new CommerceError('A recent upload is pending. Finish it or wait for it to expire.', 'PROOF_PENDING', 409);
      // An intent also writes the order, serializing it with cancellation/expiry.
      const locked = await Order.updateOne({ _id: orderId, revision: order.revision, fulfillmentState: order.fulfillmentState, paymentState: order.paymentState },
        { $inc: { revision: 1 }, $push: { paymentHistory: { state: 'proof_upload_started', at } } }, { session });
      if (locked.modifiedCount !== 1) throw new CommerceError('Order changed. Reload first.', 'EDIT_CONFLICT', 409);
      const [proof] = await PaymentProof.insertMany([{ orderId, key, contentType, size, expiresAt: new Date(at.getTime() + PROOF_WINDOW_MS) }], { session });
      return proof.toObject();
    });
  }
  async function confirmProof({ orderId, proofId, frozenKey }) {
    return transaction(async session => {
      const order = await transactionOrder(Order, orderId, session), at = now();
      const proof = await PaymentProof.findOne({ _id: proofId, orderId }).session(session).lean();
      if (!proof) throw new CommerceError('Upload not found.', 'PROOF_NOT_FOUND', 404);
      if (order.fulfillmentState === 'cancelled') throw new CommerceError('Cancelled orders cannot receive payment proof.', 'PROOF_NOT_ALLOWED', 409);
      if (proof.state === 'submitted' && String(order.paymentProofId) === String(proofId) && order.paymentState === 'awaiting_verification') return { order, changed: false, recovered: true };
      if (!proofEligible(order)) throw new CommerceError('Order is not eligible for payment proof.', 'PROOF_NOT_ALLOWED', 409);
      requireUncollected(order);
      if (proof.state !== 'pending' || proof.expiresAt <= at) throw new CommerceError('Upload expired. Start another upload.', 'PROOF_EXPIRED', 410);
      if (frozenKey !== verifiedProofKey(proof.key)) throw new CommerceError('The verified payment proof does not match this upload.', 'PROOF_INVALID');
      const updated = await Order.findOneAndUpdate({ _id: orderId, revision: order.revision, paymentState: order.paymentState, fulfillmentState: order.fulfillmentState },
        { $set: { paymentState: 'awaiting_verification', paymentProofId: proofId }, $inc: { revision: 1 }, $push: { paymentHistory: { state: 'awaiting_verification', at } } }, { new: true, session, runValidators: true }).lean();
      if (!updated) throw new CommerceError('Order payment changed. Reload first.', 'PAYMENT_CONFLICT', 409);
      const claimed = await PaymentProof.updateOne({ _id: proofId, orderId, state: 'pending', expiresAt: { $gt: at } }, { $set: { state: 'submitted', submittedAt: at, verifiedKey: frozenKey } }, { session });
      if (claimed.modifiedCount !== 1) throw new CommerceError('Payment proof changed. Reload first.', 'PROOF_CONFLICT', 409);
      await notify('proof_submitted', updated, session);
      return { order: updated, changed: true, recovered: false };
    });
  }
  async function reviewPayment({ orderId, revision, decision, reason = '', by }) {
    if (!['approve','reject'].includes(decision) || typeof reason !== 'string' || reason.length > 300 || (decision === 'reject' && reason.trim().length < 5)) throw new CommerceError('Invalid payment decision.', 'INVALID_REVIEW');
    if (!mongoose.isObjectIdOrHexString(by)) throw new CommerceError('An administrator identity is required.', 'INVALID_REVIEW');
    await PaymentEvent.init();
    // Stable across driver body retries and uncertain-commit recovery.
    const eventId = new mongoose.Types.ObjectId();
    return transaction(async session => {
      const order = await transactionOrder(Order, orderId, session), at = now();
      const collection = await PaymentEvent.findOne({ orderId, kind: 'collection' }).session(session).lean();
      if (decision === 'approve' && collection && order.paymentState === 'paid' && order.fulfillmentState !== 'cancelled' &&
        collection.orderRevision === revision + 1 && String(collection.by) === String(by) &&
        collection.amountPiastres === order.totalPiastres && collection.paymentMethod === order.paymentMethod &&
        (order.paymentMethod === 'cod' || String(collection.proofId) === String(order.paymentProofId)) &&
        order.paymentHistory.some(item => item.state === 'paid' && String(item.eventId) === String(collection._id) && +item.at === +collection.occurredAt && item.reason === reason)) {
        return { order, changed: false, recovered: true };
      }
      requireRevision(order, revision);
      if (order.fulfillmentState === 'cancelled') throw new CommerceError('Cancelled orders cannot be paid.', 'PAYMENT_NOT_ALLOWED', 409);
      requireUncollected(order);
      const cod = order.paymentMethod === 'cod';
      if (cod ? (decision !== 'approve' || order.paymentState !== 'unpaid' || order.fulfillmentState !== 'delivered') : (order.paymentState !== 'awaiting_verification' || !order.paymentProofId)) throw new CommerceError('Order is not eligible for this payment review.', 'PAYMENT_NOT_ALLOWED', 409);
      const state = decision === 'approve' ? 'paid' : 'rejected';
      if (collection) throw new CommerceError('A collection already exists. Reconcile this order before proceeding.', 'ACCOUNTING_CONFLICT', 409);
      if (state === 'paid' && (!Number.isSafeInteger(order.totalPiastres) || order.totalPiastres < 1 || order.totalPiastres > 1000000000)) throw new CommerceError('The order amount needs reconciliation.', 'ACCOUNTING_CONFLICT', 409);
      const updated = await Order.findOneAndUpdate({ _id: orderId, revision, paymentState: order.paymentState, fulfillmentState: order.fulfillmentState, ...(cod ? {} : { paymentProofId: order.paymentProofId }) },
        { $set: { paymentState: state }, $inc: { revision: 1 }, $push: { paymentHistory: { state, at, by, reason, ...(state === 'paid' ? { eventId } : {}) } } }, { new: true, session, runValidators: true }).lean();
      if (!updated) throw new CommerceError('Order changed. Reload before reviewing.', 'EDIT_CONFLICT', 409);
      if (!cod) {
        const proof = await PaymentProof.updateOne({ _id: order.paymentProofId, orderId, state: 'submitted', verifiedKey: { $type: 'string' } },
          { $set: { state: decision === 'approve' ? 'approved' : 'rejected', reviewedBy: by, reviewedAt: at, reason } }, { session });
        if (proof.modifiedCount !== 1) throw new CommerceError('Proof changed. Reload before reviewing.', 'PAYMENT_CONFLICT', 409);
      }
      if (state === 'paid') await PaymentEvent.insertMany([{ _id: eventId, orderId, eventKey: `collection:${orderId}`, kind: 'collection', direction: 1,
        amountPiastres: order.totalPiastres, paymentMethod: order.paymentMethod, occurredAt: at, recordedAt: at, by,
        orderRevision: updated.revision, proofId: cod ? null : order.paymentProofId,
        reason: reason.trim() || (cod ? 'Administrator confirmed COD collection after delivery.' : 'Administrator verified receipt of digital payment.') }], { session });
      await notify('payment', updated, session, state === 'paid' ? { eventId, amountPiastres: order.totalPiastres } : null);
      return { order: updated, changed: true };
    });
  }
  return { reserveProofUpload, confirmProof, reviewPayment };
}
export const paymentService = createPaymentService();
