import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import PaymentProof from '../models/PaymentProof.js';
import OrderMail from '../models/OrderMail.js';
import { queueOrderMail } from '../notifications/order-mail.js';
import { commerceTransaction } from './transactions.js';
import { CommerceError } from './checkout.js';

export function commerceContext({ connection = mongoose.connection, models = { Order, Product, Category, PaymentProof, OrderMail }, env = process.env, clock = () => new Date() } = {}) {
  return { connection, models, env, now: () => {
    const value = new Date(clock());
    if (!Number.isFinite(value.getTime())) throw new Error('Invalid commerce clock.');
    return value;
  }, transaction: callback => commerceTransaction(connection, callback),
  // Only a durable outbox write runs inside a transaction, never SMTP/R2.
  notify: (kind, order, session) => queueOrderMail(kind, order, session, { model: models.OrderMail, env }) };
}
export async function transactionOrder(OrderModel, id, session) {
  const order = await OrderModel.findById(id).session(session).lean();
  if (!order) throw new CommerceError('Order not found.', 'NOT_FOUND', 404);
  return order;
}
export function requireRevision(order, expected) {
  if (!Number.isSafeInteger(expected) || expected < 0 || order.revision !== expected) throw new CommerceError('Order changed. Reload before trying again.', 'EDIT_CONFLICT', 409);
}
export function requireUncollected(order) {
  if (['paid', 'refunded'].includes(order.paymentState) || (order.paymentHistory || []).some(event => ['paid', 'refunded'].includes(event.state))) throw new CommerceError('Collected orders require a separate verified refund procedure.', 'REFUND_REQUIRED', 409);
}
