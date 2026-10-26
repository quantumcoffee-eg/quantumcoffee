import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import nodemailer from 'nodemailer';
import { EventEmitter } from 'node:events';
import { mailFailure, retryDelay } from '../src/notifications/mail-policy.js';
import { orderEmailIssues, notificationDocuments } from '../src/notifications/order-mail-values.js';
import { makeMailTransport } from '../src/mailer.js';
import { loadOperations } from '../src/admin/operations-service.js';
import { createOverviewRouter } from '../src/routes/overview.routes.js';
import Session from '../src/models/Session.js';
import User from '../src/models/User.js';
import { installShutdown } from '../src/shutdown.js';

const env = { ORDER_EMAILS_ENABLED: 'true', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', SMTP_USER: 'fake@example.invalid', SMTP_PASSWORD: 'FAKE', MAIL_FROM: 'Quantum Coffee <fake@example.invalid>', PUBLIC_SITE_ORIGIN: 'https://quantum.example' };
test('SMTP failures distinguish rejection, connection failures and ambiguous DATA/timeout outcomes without copying provider text', () => {
  for (const [error, state] of [[{ responseCode: 451 },'pending'],[{ code: 'EAUTH', responseCode: 454 },'pending'],[{ responseCode: 550 },'dead'],[{ code: 'EAUTH' },'dead'],[{ code: 'EDNS' },'pending'],[{ code: 'ETIMEDOUT', command: 'CONN' },'pending'],[{ code: 'ETIMEDOUT', command: 'DATA' },'uncertain'],[{ code: 'ESOCKET', command: 'DATA' },'uncertain'],[{},'uncertain']]) {
    const result = mailFailure({ ...error, message: 'PRIVATE password customer@example.invalid', response: 'PRIVATE' });
    assert.equal(result.state, state); assert.doesNotMatch(JSON.stringify(result), /PRIVATE|password|@/);
  }
  assert.equal(retryDelay(1), 30000); assert.equal(retryDelay(3), 120000); assert.equal(retryDelay(1000), 3600000);
});
test('SMTP configuration validates TLS/port/origin/header values without exposing credentials', () => {
  assert.deepEqual(orderEmailIssues(env), []);
  assert.deepEqual(orderEmailIssues({ ...env, SMTP_PORT: '465', SMTP_SECURE: 'true' }), []);
  for (const extra of [{ SMTP_PORT: 'NaN' }, { SMTP_PORT: '465', SMTP_SECURE: 'false' }, { SMTP_SECURE: 'true' }, { PUBLIC_SITE_ORIGIN: 'https://user:PRIVATE@host.example' }, { MAIL_FROM: 'fake@example.invalid\nBcc:private@example.invalid' }, { SMTP_HOST: 'smtp://PRIVATE' }]) {
    const issues = orderEmailIssues({ ...env, ...extra }); assert.ok(issues.length); assert.doesNotMatch(JSON.stringify(issues), /PRIVATE|Bcc:|user:/);
  }
});
test('owned SMTP socket is abortable and requires certificate-validated TLS; no network or provider delivery occurs', t => {
  let options, closes = 0;
  t.mock.method(nodemailer, 'createTransport', settings => { options = settings; return { sendMail() { throw new Error('Must not send'); }, close() { closes++; } }; });
  const controller = new AbortController(), transport = makeMailTransport(env, { signal: controller.signal });
  assert.equal(options.requireTLS, true); assert.equal(options.tls.rejectUnauthorized, true); assert.equal(options.secure, false);
  controller.abort(); assert.equal(options.socket.destroyed, true); transport.close(); assert.equal(closes, 1);
});
test('financial notification identity follows event/audience across revisions or changed recipient data', () => {
  const order = { _id: '507f1f77bcf86cd799439011', revision: 2, orderNumber: 'QC-AABBCC112233', customer: { email: 'one@example.invalid' }, totalPiastres: 10000, paymentState: 'paid', fulfillmentState: 'received' };
  const money = { eventId: '507f1f77bcf86cd799439099', amountPiastres: 10000 };
  const original = notificationDocuments('payment', order, env, money)[0];
  const repeat = notificationDocuments('payment', { ...order, revision: 9, customer: { email: 'two@example.invalid' } }, env, money)[0];
  assert.equal(original.dedupeKey, repeat.dedupeKey); assert.equal(original.messageId, repeat.messageId);
  assert.throws(() => notificationDocuments('payment', order, env));
});
test('zero-notification operational view is honest, read-only and bounded even when mail is disabled', async () => {
  let calls = 0;
  const model = { aggregate(pipeline) { assert.doesNotMatch(JSON.stringify(pipeline), /\$out|\$merge/); calls++; return { option({ maxTimeMS }) { assert.equal(maxTimeMS, 5000); return []; } }; } };
  const result = await loadOperations({ models: { OrderMail: model, PaymentProof: model, MediaAsset: model }, env: {} });
  assert.equal(calls, 3); assert.equal(result.email.mode, 'disabled'); assert.equal(result.email.configured, false); assert.equal(result.email.pending, 0); assert.equal(result.email.lastAcceptedAt, null);
  assert.equal(result.email.manualReplayEnabled, false); assert.equal(result.storage.automaticCleanupEnabled, false);
});
test('operations endpoint requires real admin session/role guards, strict queries and no-store', async t => {
  let role = 'customer', calls = 0;
  t.mock.method(Session, 'findOne', () => ({ lean: async () => ({ userId: '507f1f77bcf86cd799439011' }) }));
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ role }) }) }));
  const app = express(); app.use('/api/admin/overview', createOverviewRouter({ isDatabaseReady: () => true, operations: async () => { calls++; return { email: { enabled: false } }; } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/admin/overview/operations`, headers = { Cookie: `qc_session=${'a'.repeat(64)}` };
  assert.equal((await fetch(url)).status, 401); assert.equal((await fetch(url, { headers })).status, 403); assert.equal(calls, 0);
  role = 'admin';
  for (const query of ['?limit=1', '?range=7d', '?state[$ne]=dead']) assert.equal((await fetch(url + query, { headers })).status, 400);
  const response = await fetch(url, { headers }); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(calls, 1);
  assert.equal((await fetch(url, { method: 'POST', headers })).status, 404);
});
test('shutdown drains workers before disconnect, is idempotent and removes signal handlers', async () => {
  const runtime = new EventEmitter(), calls = []; runtime.exit = () => { throw new Error('Unexpected forced exit'); };
  const stop = installShutdown({ runtime, server: { close(callback) { calls.push('http'); callback(); } }, worker: { async stop() { calls.push('worker'); } }, disconnect: async () => { calls.push('disconnect'); } });
  const first = stop(); assert.equal(stop(), first); await first;
  assert.deepEqual(calls, ['http','worker','disconnect']); assert.equal(runtime.listenerCount('SIGTERM'), 0); assert.equal(runtime.exitCode, 0);
});
test('shutdown deadline aborts active work and terminates without logging raw errors', async () => {
  const runtime = new EventEmitter(), events = []; let release;
  const ended = new Promise(resolve => { runtime.exit = code => { events.push(code); resolve(); }; });
  const stop = installShutdown({ runtime, deadlineMs: 5, server: { close(callback) { callback(); }, closeAllConnections() { events.push('connections'); } }, worker: { stop: () => new Promise(resolve => { release = resolve; }), abort() { events.push('abort'); } }, disconnect: async () => {}, log: code => events.push(code) });
  const stopping = stop(); await ended; assert.deepEqual(events, ['abort','connections','DEADLINE_REACHED',1]); release(); await stopping;
});
