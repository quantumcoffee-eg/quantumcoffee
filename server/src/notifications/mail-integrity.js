import PaymentEvent from '../models/PaymentEvent.js';
import Order from '../models/Order.js';
import RefundCase from '../models/RefundCase.js';
import mongoose from 'mongoose';

export async function verifyMonetaryMail(message, { models = { PaymentEvent, Order, RefundCase }, session = null } = {}) {
  const kind = message.kind === 'refund_recorded' ? 'refund' : message.kind === 'payment' && message.paymentState === 'paid' ? 'collection' : null;
  if (!kind) return;
  const fail = () => { throw Object.assign(new Error('Monetary notification needs verification.'), { code: 'MONETARY_EVENT_MISMATCH' }); };
  const bounds = session ? {} : { timeoutMS: 5000 };
  if ((message.orderId && !mongoose.isObjectIdOrHexString(message.orderId)) || !mongoose.isObjectIdOrHexString(message.monetaryEventId) || !Number.isSafeInteger(message.monetaryAmountPiastres) || message.monetaryAmountPiastres < 1 || message.monetaryAmountPiastres > message.totalPiastres) fail();
  const event = await models.PaymentEvent.findOne({ _id: message.monetaryEventId, ...(message.orderId ? { orderId: message.orderId } : {}), kind,
    amountPiastres: message.monetaryAmountPiastres, direction: kind === 'collection' ? 1 : -1, currency: 'EGP' }).session(session).maxTimeMS(5000).setOptions(bounds).lean();
  if (!event || (kind === 'collection' && event.amountPiastres !== message.totalPiastres)) fail();
  const order = await models.Order.findById(event.orderId).select('orderNumber totalPiastres').session(session).maxTimeMS(5000).setOptions(bounds).lean();
  if (!order || order.orderNumber !== message.orderNumber || order.totalPiastres !== message.totalPiastres) fail();
  if (kind === 'refund' && !await models.RefundCase.exists({ _id: event.refundCaseId, eventId: event._id, state: 'recorded', amountPiastres: event.amountPiastres }).session(session).maxTimeMS(5000).setOptions(bounds)) fail();
}
