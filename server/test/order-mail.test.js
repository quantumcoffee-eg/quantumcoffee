import test from 'node:test';
import assert from 'node:assert/strict';
import {orderMailContent,isMailAddress} from '../src/notifications/order-mail-content.js';
import {notificationDocuments,orderEmailIssues} from '../src/notifications/order-mail-values.js';

const order={_id:'507f1f77bcf86cd799439011',revision:4,orderNumber:'QC-AABBCC112233',customer:{email:'CUSTOMER@example.com'},fulfillmentState:'confirmed',paymentState:'awaiting_transfer',totalPiastres:45999};
const env={ORDER_EMAILS_ENABLED:'true',ORDER_ALERT_EMAIL:'owner@example.com',PUBLIC_SITE_ORIGIN:'https://quantum.example',SMTP_HOST:'smtp.example',SMTP_USER:'user',SMTP_PASSWORD:'not-a-real-secret',MAIL_FROM:'shop@quantum.example'};
test('order mail is disabled by default and never guesses recipients',()=>{
  assert.deepEqual(notificationDocuments('placed',order,{ORDER_EMAILS_ENABLED:'false'}),[]);
  assert.deepEqual(notificationDocuments('placed',{...order,customer:{email:''}},{...env,ORDER_ALERT_EMAIL:''}),[]);
});
test('verified refund outbox links the monetary event and renders the actual partial amount without private evidence', () => {
  const monetary = { eventId: '507f1f77bcf86cd799439099', amountPiastres: 1000 };
  const notice = notificationDocuments('refund_recorded', { ...order, paymentState: 'paid' }, env, monetary)[0];
  assert.equal(notice.monetaryEventId, monetary.eventId);
  assert.equal(notice.monetaryAmountPiastres, 1000);
  const content = orderMailContent({ ...notice, siteOrigin: env.PUBLIC_SITE_ORIGIN });
  assert.match(content.text, /Verified refund: 10\.00 EGP/);
  assert.doesNotMatch(content.text, /507f1f77|externalReference|evidence/);
  assert.throws(() => notificationDocuments('refund_recorded', order, env));
  assert.throws(() => orderMailContent({ ...notice, monetaryAmountPiastres: order.totalPiastres + 1, siteOrigin: env.PUBLIC_SITE_ORIGIN }));
});
test('new orders generate distinct customer/admin notices with stable dedupe keys',()=>{
  const notices=notificationDocuments('placed',order,env);
  assert.equal(notices.length,2);
  assert.equal(notices[0].to,'customer@example.com');
  assert.equal(notices[1].to,'owner@example.com');
  assert.equal(new Set(notices.map(n=>n.dedupeKey)).size,2);
  assert.deepEqual(notices.map(n=>n.dedupeKey),notificationDocuments('placed',order,env).map(n=>n.dedupeKey));
  assert.notEqual(notices[0].dedupeKey,notificationDocuments('placed',{...order,revision:5},env)[0].dedupeKey);
});
test('customer notices omit owner when only status changes',()=>{
  assert.equal(notificationDocuments('payment',order,env).length,1);
  assert.equal(notificationDocuments('fulfillment',order,env)[0].audience,'customer');
});
test('notification copy is bilingual, escaped and contains no customer private details',()=>{
  const contents=orderMailContent({kind:'placed',audience:'customer',orderNumber:order.orderNumber,fulfillmentState:'confirmed',paymentState:'awaiting_transfer',totalPiastres:45999,siteOrigin:'https://quantum.example'});
  assert.match(contents.text,/459\.99 EGP/);
  assert.match(contents.html,/استلمنا طلبك/);
  assert.match(contents.html,/https:\/\/quantum.example\/track-order/);
  assert.doesNotMatch(contents.html,/customer@example.com|507f1f77bcf86cd799439011/);
});
test('notification input rejects unsafe states or origins and email header injection',()=>{
  assert.equal(isMailAddress('a@example.com\nBcc:victim@example.com'),false);
  assert.throws(()=>orderMailContent({kind:'unknown',audience:'admin',orderNumber:order.orderNumber,fulfillmentState:'confirmed',paymentState:'paid',totalPiastres:100,siteOrigin:'https://quantum.example'}));
  assert.throws(()=>orderMailContent({kind:'placed',audience:'admin',orderNumber:order.orderNumber,fulfillmentState:'confirmed',paymentState:'paid',totalPiastres:100,siteOrigin:'http://localhost:5173'}));
});
test('enabling notifications requires valid mail settings and admin address',()=>{
  assert.deepEqual(orderEmailIssues({...env,ORDER_EMAILS_ENABLED:'false',SMTP_HOST:''}),[]);
  assert.deepEqual(orderEmailIssues(env),[]);
  assert.ok(orderEmailIssues({...env,SMTP_HOST:''}).length>0);
  assert.ok(orderEmailIssues({...env,ORDER_ALERT_EMAIL:'owner\r\nBcc:evil@example.com'}).length>0);
});
