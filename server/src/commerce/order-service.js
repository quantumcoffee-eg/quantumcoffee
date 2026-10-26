import { CommerceError, validateCheckout, fingerprint, lineTotals, newOrderNumber, statusTransition } from './checkout.js';
import { commerceContext, transactionOrder, requireRevision, requireUncollected } from './service-context.js';
import { loadCartLines, adjustInventory } from './inventory-service.js';
import { expirationPolicy } from './expiration-policy.js';

const conflict = () => new CommerceError('Checkout reference was already used for a different request or account.', 'CHECKOUT_CONFLICT', 409);
const unpaidDigital = order => ['instapay', 'vodafone_cash'].includes(order.paymentMethod) && ['unpaid', 'awaiting_transfer', 'rejected'].includes(order.paymentState) && ['received', 'confirmed'].includes(order.fulfillmentState);

export function createOrderService(options = {}) {
  const context = commerceContext(options);
  const { models: { Order, Product, Category, PaymentProof }, now, transaction, notify, env } = context;
  async function hasProtectedProof(order, session, { pending = false, at = now() } = {}) {
    return PaymentProof.exists({ orderId: order._id, $or: [
      { state: { $in: ['submitted', 'approved'] } }, ...(pending ? [{ state: 'pending', expiresAt: { $gt: at } }] : []),
    ] }).session(session);
  }
  async function cancelInTransaction(order, session, { by = null, expiration = null } = {}) {
    requireUncollected(order);
    if (order.paymentState === 'awaiting_verification' || await hasProtectedProof(order, session)) throw new CommerceError('Review the submitted payment proof before cancelling this order.', 'PAYMENT_REVIEW_REQUIRED', 409);
    statusTransition(order.fulfillmentState, 'cancelled');
    const at = now();
    const paymentHistory = expiration ? { paymentHistory: { state: 'expired', at, by: null,
      reason: `Automatic unpaid digital-order expiration; policy=creation-v1; windowMinutes=${expiration.windowMs / 60000}; createdAt=${order.createdAt.toISOString()}.` } } : {};
    const updated = await Order.findOneAndUpdate({ _id: order._id, revision: order.revision, fulfillmentState: order.fulfillmentState, paymentState: order.paymentState },
      { $set: { fulfillmentState: 'cancelled' }, $inc: { revision: 1 }, $push: { history: { status: 'cancelled', at, by }, ...paymentHistory } }, { new: true, session, runValidators: true }).lean();
    if (!updated) throw new CommerceError('Order changed. Reload first.', 'EDIT_CONFLICT', 409);
    await adjustInventory(order.lines, 1, Product, session);
    await notify('fulfillment', updated, session);
    return { order: updated, changed: true };
  }

  async function checkout(input, { userId = null, shippingPiastres, paymentEnabled = true } = {}) {
    const data = validateCheckout(input), requestFingerprint = fingerprint(data);
    const recover = prior => {
      if (prior.requestFingerprint !== requestFingerprint || String(prior.userId || '') !== String(userId || '')) throw conflict();
      return { order: prior, created: false, recovered: true };
    };
    try {
      return await transaction(async session => {
        const prior = await Order.findOne({ checkoutKey: data.checkoutKey }).session(session).lean();
        if (prior) return recover(prior);
        if (!paymentEnabled) throw new CommerceError('Selected payment method is unavailable.', 'PAYMENT_UNAVAILABLE', 503);
        if (!Number.isSafeInteger(shippingPiastres) || shippingPiastres < 0) throw new CommerceError('Shipping is unavailable.', 'SHIPPING_UNAVAILABLE', 503);
        const entries = await loadCartLines(data.items, { Product, Category }, session);
        const { lines, subtotalPiastres } = lineTotals(entries);
        const totalPiastres = subtotalPiastres + shippingPiastres;
        if (!Number.isSafeInteger(totalPiastres) || totalPiastres > 1_000_000_000) throw new CommerceError('Order total exceeds the allowed limit.');
        await adjustInventory(lines, -1, Product, session);
        // Fresh, schema-validated documents per attempt. insertMany avoids the
        // installed Mongoose save-hook rollback bug on strict embedded __v paths.
        const [document] = await Order.insertMany([{ orderNumber: newOrderNumber(), checkoutKey: data.checkoutKey, requestFingerprint,
          userId, customer: data.customer, lines, subtotalPiastres, shippingPiastres, totalPiastres,
          paymentMethod: data.paymentMethod, paymentState: data.paymentMethod === 'cod' ? 'unpaid' : 'awaiting_transfer',
          fulfillmentState: 'received', history: [{ status: 'received', at: now() }],
        }], { session });
        const order = document.toObject();
        await notify('placed', order, session);
        return { order, created: true, recovered: false };
      });
    } catch (error) {
      if (error?.code === 11000) {
        const prior = await Order.findOne({ checkoutKey: data.checkoutKey }).maxTimeMS(5000).lean();
        if (prior) return recover(prior);
        throw new CommerceError('Order reference conflict. Retry using the same checkout reference.', 'CHECKOUT_CONFLICT', 409);
      }
      throw error;
    }
  }

  async function transitionOrder({ id, revision, status, by = null }) {
    return transaction(async session => {
      const order = await transactionOrder(Order, id, session);
      requireRevision(order, revision);
      const next = statusTransition(order.fulfillmentState, status);
      if (next === 'cancelled') return cancelInTransaction(order, session, { by });
      if (['packing', 'shipped', 'delivered'].includes(next) && order.paymentMethod !== 'cod' && order.paymentState !== 'paid') throw new CommerceError('Digital payment must be verified before fulfillment.', 'PAYMENT_REQUIRED', 409);
      const updated = await Order.findOneAndUpdate({ _id: order._id, revision, fulfillmentState: order.fulfillmentState, paymentState: order.paymentState },
        { $set: { fulfillmentState: next }, $inc: { revision: 1 }, $push: { history: { status: next, at: now(), by } } }, { new: true, session, runValidators: true }).lean();
      if (!updated) throw new CommerceError('Order changed. Reload first.', 'EDIT_CONFLICT', 409);
      await notify('fulfillment', updated, session);
      return { order: updated, changed: true };
    });
  }

  async function expireOrder(id) {
    const policy = expirationPolicy(env);
    if (!policy.enabled) return { changed: false, reason: 'DISABLED' };
    return transaction(async session => {
      const order = await transactionOrder(Order, id, session), at = now();
      if (!unpaidDigital(order) || !(order.createdAt instanceof Date) || order.createdAt.getTime() > at.getTime() - policy.windowMs || (order.paymentHistory || []).some(event => ['paid','refunded'].includes(event.state))) return { changed: false, reason: 'INELIGIBLE' };
      if (await hasProtectedProof(order, session, { pending: true, at })) return { changed: false, reason: 'PROOF_PROTECTED' };
      return cancelInTransaction(order, session, { expiration: policy });
    });
  }
  // Intentionally no timer, startup hook, cron registration, or HTTP route.
  async function expirationBatch({ limit = 50 } = {}) {
    const policy = expirationPolicy(env);
    if (!policy.enabled) return { enabled: false, scanned: 0, expired: 0 };
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new CommerceError('Invalid expiration batch limit.', 'INVALID_EXPIRATION_BATCH');
    const candidates = await Order.find({ paymentMethod: { $in: ['instapay','vodafone_cash'] }, paymentState: { $in: ['unpaid','awaiting_transfer','rejected'] }, fulfillmentState: { $in: ['received','confirmed'] }, createdAt: { $lte: new Date(now().getTime() - policy.windowMs) } }).sort({ createdAt: 1, _id: 1 }).select('_id').limit(limit).maxTimeMS(5000).lean();
    let expired = 0;
    for (const order of candidates) if ((await expireOrder(order._id)).changed) expired++;
    return { enabled: true, scanned: candidates.length, expired };
  }
  return { checkout, transitionOrder, expireOrder, expirationBatch };
}
export const orderService = createOrderService();
