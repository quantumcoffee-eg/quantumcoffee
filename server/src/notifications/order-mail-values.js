import {createHash} from 'node:crypto';
import {isMailAddress} from './order-mail-content.js';
const queueEnabled = (env=process.env) => env.ORDER_EMAILS_ENABLED==='true';
export function orderEmailIssues(env=process.env) {
  if (!queueEnabled(env)) return [];
  const problems=[];
  if (!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.MAIL_FROM && env.PUBLIC_SITE_ORIGIN)) problems.push('ORDER_EMAILS_ENABLED requires authenticated SMTP, MAIL_FROM and PUBLIC_SITE_ORIGIN.');
  if (!/^https:\/\/[^/?#]+$/.test(env.PUBLIC_SITE_ORIGIN||'')) problems.push('ORDER_EMAILS_ENABLED requires an HTTPS PUBLIC_SITE_ORIGIN.');
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
export function notificationDocuments(kind,order,env=process.env) {
  if (!['placed','fulfillment','proof_submitted','payment'].includes(kind)) throw new Error('Invalid order mail kind.');
  const targets=notificationTargets(kind,order,env);
  return targets.map(({to,audience})=>({
    dedupeKey:createHash('sha256').update(`${order._id}:${order.revision}:${kind}:${audience}:${to}`).digest('hex'),
    to,audience,kind,orderNumber:order.orderNumber,
    fulfillmentState:order.fulfillmentState,paymentState:order.paymentState,totalPiastres:order.totalPiastres,
    state:'pending',nextAttemptAt:new Date(),
  }));
}
