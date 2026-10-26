import {createHash} from 'node:crypto';
import {isMailAddress} from './order-mail-content.js';
const queueEnabled = (env=process.env) => env.ORDER_EMAILS_ENABLED==='true';
export function senderAddress(value) {
  if (typeof value !== 'string' || value.length > 254 || /[\r\n]/.test(value)) return null;
  if (isMailAddress(value)) return value;
  const match = /^[^<>\r\n]{1,80}<([^<>]+)>$/.exec(value);
  return match && isMailAddress(match[1]) ? match[1] : null;
}
export function notificationMessageId(dedupeKey, env = process.env) {
  if (!/^[a-f0-9]{64}$/.test(dedupeKey)) throw new Error('Invalid notification identity.');
  const domain = new URL(env.PUBLIC_SITE_ORIGIN).hostname;
  return `<qc.${dedupeKey}@${domain}>`;
}
export function orderEmailIssues(env=process.env) {
  if (!queueEnabled(env)) return [];
  const problems=[];
  if (!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.MAIL_FROM && env.PUBLIC_SITE_ORIGIN)) problems.push('ORDER_EMAILS_ENABLED requires authenticated SMTP, MAIL_FROM and PUBLIC_SITE_ORIGIN.');
  try {
    const origin = new URL(env.PUBLIC_SITE_ORIGIN);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.origin !== env.PUBLIC_SITE_ORIGIN) throw new Error();
  } catch { problems.push('ORDER_EMAILS_ENABLED requires an HTTPS PUBLIC_SITE_ORIGIN.'); }
  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || (env.SMTP_SECURE && !['true','false'].includes(env.SMTP_SECURE)) || (port === 465 && env.SMTP_SECURE === 'false') || (port === 587 && env.SMTP_SECURE === 'true')) problems.push('SMTP port and TLS mode are inconsistent.');
  if (typeof env.SMTP_HOST !== 'string' || !/^[a-zA-Z0-9.-]{1,253}$/.test(env.SMTP_HOST)) problems.push('SMTP_HOST must be a hostname.');
  if (typeof env.SMTP_USER !== 'string' || /[\r\n]/.test(env.SMTP_USER)) problems.push('SMTP_USER is invalid.');
  if (!senderAddress(env.MAIL_FROM) || (env.MAIL_REPLY_TO && !senderAddress(env.MAIL_REPLY_TO))) problems.push('Mail sender or reply address is invalid.');
  if (env.ORDER_ALERT_EMAIL && !isMailAddress(env.ORDER_ALERT_EMAIL)) problems.push('ORDER_ALERT_EMAIL is not a valid email.');
  return problems;
}
export function notificationTargets(kind,order,env=process.env) {
  if (!queueEnabled(env)) return [];
  const targets=[];
  if (isMailAddress(order.customer?.email)) targets.push({to:order.customer.email.toLowerCase(),audience:'customer'});
  if (['placed','proof_submitted'].includes(kind) && isMailAddress(env.ORDER_ALERT_EMAIL)) targets.push({to:env.ORDER_ALERT_EMAIL.toLowerCase(),audience:'admin'});
  return targets;
}
export function notificationDocuments(kind,order,env=process.env,monetary=null) {
  if (!['placed','fulfillment','proof_submitted','payment','refund_recorded'].includes(kind)) throw new Error('Invalid order mail kind.');
  if ((kind === 'refund_recorded' || (kind === 'payment' && order.paymentState === 'paid')) && (!monetary?.eventId || !Number.isSafeInteger(monetary.amountPiastres) || monetary.amountPiastres <= 0 || monetary.amountPiastres > order.totalPiastres || (kind === 'payment' && monetary.amountPiastres !== order.totalPiastres))) throw new Error('A verified monetary event is required.');
  const targets=notificationTargets(kind,order,env);
  return targets.map(({to,audience})=>{
    const financial = kind === 'refund_recorded' || (kind === 'payment' && order.paymentState === 'paid');
    const identity = financial ? `event:${monetary.eventId}:${audience}` : `${order._id}:${order.revision}:${kind}:${audience}:${to}`;
    const dedupeKey = createHash('sha256').update(identity).digest('hex');
    return {
    dedupeKey, orderId: order._id,
    messageId: notificationMessageId(dedupeKey, env),
    to,audience,kind,orderNumber:order.orderNumber,
    fulfillmentState:order.fulfillmentState,paymentState:order.paymentState,totalPiastres:order.totalPiastres,
    ...(monetary ? { monetaryEventId:monetary.eventId, monetaryAmountPiastres:monetary.amountPiastres } : {}),
    state:'pending',nextAttemptAt:new Date(),
  }; });
}
