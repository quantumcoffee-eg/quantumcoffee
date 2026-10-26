import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Session from '../src/models/Session.js';
import User from '../src/models/User.js';
import { createOverviewRouter } from '../src/routes/overview.routes.js';
import { createApp } from '../src/app.js';
import { createRefundFoundation, refundableBalance, REFUND_RECORDING_ENABLED } from '../src/accounting/refund-foundation.js';
import { assembleOverview } from '../src/admin/overview-service.js';
import { reportingPeriod } from '../src/admin/overview-values.js';

test('reconciliation uses real authentication/role guards, strict parameters and no-store; no writes', async t => {
  let role = 'customer', calls = 0;
  t.mock.method(Session, 'findOne', () => ({ lean: async () => ({ userId: '507f1f77bcf86cd799439011' }) }));
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ role }) }) }));
  const app = express();
  app.use('/api/admin/overview', createOverviewRouter({ isDatabaseReady: () => true, reconciliation: async () => { calls++; return { complete: true, items: [] }; } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}/api/admin/overview/reconciliation`;
  const headers = { Cookie: `qc_session=${'a'.repeat(64)}` };
  for (const [options, status] of [[{}, 401], [{ headers }, 403]]) {
    const response = await fetch(origin, options); assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(calls, 0); role = 'admin';
  for (const query of ['?limit=500', '?range=today', '?orderId[$ne]=null', '?limit=1&limit=2']) assert.equal((await fetch(origin + query, { headers })).status, 400);
  const response = await fetch(origin, { headers }); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { reconciliation: { complete: true, items: [] } }); assert.equal(calls, 1);
  assert.equal((await fetch(origin, { headers, method: 'POST' })).status, 404);
});
test('no live refund or correction route exists, including with flag-like environment values', async t => {
  const server = createApp().listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  for (const path of ['/api/admin/refunds', '/api/admin/accounting/refund', '/api/admin/accounting/corrections']) {
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173' } })).status, 404);
  }
  assert.equal(REFUND_RECORDING_ENABLED, false);
  assert.throws(() => createRefundFoundation({ authorize: async () => true }), error => error.code === 'REFUNDS_DISABLED');
});
test('refundable balance rejects missing/unsafe collections, bad sources, non-refunds and over-refunds', () => {
  const collection = { _id: 'collection', amountPiastres: 10001 };
  const row = { kind: 'refund', direction: -1, sourceEventId: 'collection', amountPiastres: 1000 };
  assert.equal(refundableBalance(collection, [row, row]), 8001);
  for (const events of [[{ ...row, amountPiastres: 10002 }], [{ ...row, amountPiastres: 1.2 }], [{ ...row, sourceEventId: 'other' }], [{ ...row, kind: 'reversal' }], [{ ...row, direction: 1 }]]) assert.throws(() => refundableBalance(collection, events));
  assert.throws(() => refundableBalance(null, []));
});
test('known ledger amounts remain explicit while incomplete diagnostics withhold net; valid period net may be negative', () => {
  const period = reportingPeriod('today', new Date('2026-10-26T12:00:00Z'));
  const financial = { series: [{ _id: '2026-10-26', collectedPiastres: 101, refundPiastres: 201, paidOrders: 1 }], refundedOrders: [{ count: 2 }] };
  const incomplete = assembleOverview(period, { financial, reconciliation: { complete: false, issueCount: 1, issueCounts: { MISSING_COLLECTION: 1 } } });
  assert.equal(incomplete.financial.netCollectedPiastres, null); assert.equal(incomplete.financial.refundAmountsPiastres, 201);
  const complete = assembleOverview(period, { financial, reconciliation: { complete: true, issueCount: 0 } });
  assert.equal(complete.financial.netCollectedPiastres, -100); assert.equal(complete.financial.recordedRefundOrdersInPeriod, 2);
  assert.equal(assembleOverview(period, { financial }).financial.accountingComplete, false);
});
