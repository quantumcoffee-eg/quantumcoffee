import test from 'node:test';
import assert from 'node:assert/strict';
import { overviewRange, reportingPeriod, cairoDayStart, cairoDate, orderQueueFilter } from '../src/admin/overview-values.js';
import { assembleOverview, loadOverview } from '../src/admin/overview-service.js';

const now = new Date('2026-10-26T12:00:00Z');
test('overview accepts only explicitly supported scalar ranges; invalid dates and unknown keys fail', () => {
  assert.equal(overviewRange({}), '30d');
  for (const range of ['today', '7d', '30d', '90d']) assert.equal(overviewRange({ range }), range);
  for (const query of [{ range: '365d' }, { range: '' }, { range: ['7d', '30d'] }, { range: { $ne: '' } }, { start: '2026-02-30' }, { range: 'today', end: '2026-10-26' }]) assert.throws(() => overviewRange(query));
  assert.throws(() => cairoDayStart('2026-02-30'));
  assert.throws(() => cairoDayStart('2026-13-01'));
  assert.throws(() => reportingPeriod('30d', new Date('invalid')));
});
test('Cairo reporting dates respect both daylight-saving transitions and UTC day boundaries', () => {
  assert.equal(cairoDate(new Date('2026-10-25T22:00:00Z')), '2026-10-26');
  assert.equal(cairoDayStart('2026-10-26').toISOString(), '2026-10-25T21:00:00.000Z');
  assert.equal(cairoDayStart('2026-04-25') - cairoDayStart('2026-04-24'), 23 * 3600000);
  assert.equal(cairoDayStart('2026-10-30') - cairoDayStart('2026-10-29'), 25 * 3600000);
  assert.equal(reportingPeriod('7d', now).dates.length, 7);
  assert.equal(reportingPeriod('90d', now).dates.length, 90);
  assert.equal(reportingPeriod('today', now).to.getTime(), now.getTime());
});
test('zero orders and three draft products/one category produce honest zero-state metrics', () => {
  const overview = assembleOverview(reportingPeriod('7d', now), { inventory: { counts: [{ totalProducts: 3, draftProducts: 3, publishedProducts: 0 }] }, categories: { totalCategories: 1, activeCategories: 1 } });
  assert.equal(overview.metrics.totalProducts, 3);
  assert.equal(overview.metrics.totalCategories, 1);
  assert.equal(overview.metrics.draftProducts, 3);
  assert.equal(overview.metrics.totalOrders, 0);
  assert.equal(overview.financial.collectedPiastres, 0);
  assert.equal(overview.financial.averageOrderValuePiastres, 0);
  assert.equal(overview.financial.refundAmountsPiastres, null);
  assert.equal(overview.financial.netCollectedPiastres, null);
  assert.equal(overview.series.length, 7);
  assert.ok(overview.series.every(point => point.collectedPiastres === 0));
});
test('collected AOV uses first-paid count, rounds piastres, and never leaks recent-order personal data', () => {
  const overview = assembleOverview(reportingPeriod('today', now), {
    financial: { series: [{ _id: '2026-10-26', collectedPiastres: 10001, paidOrders: 2 }] },
    recent: [{ _id: '123', orderNumber: 'QC-TEST', totalPiastres: 10001, paymentState: 'paid', fulfillmentState: 'delivered', createdAt: now, customer: { phone: 'private' }, userId: 'secret', paymentHistory: [], paymentProofId: 'private-key' }],
  });
  assert.equal(overview.financial.averageOrderValuePiastres, 5001);
  assert.deepEqual(Object.keys(overview.recentOrders[0]).sort(), ['id', 'orderNumber', 'totalPiastres', 'paymentState', 'fulfillmentState', 'createdAt'].sort());
  assert.ok(!JSON.stringify(overview).includes('private'));
  assert.throws(() => assembleOverview(reportingPeriod('today', now), { financial: { series: [{ _id: '2026-10-26', collectedPiastres: Number.MAX_SAFE_INTEGER + 1, paidOrders: 1 }] } }));
});
test('attention filter allowlist is shared, rejects injection, and cannot be mutated by callers', () => {
  assert.equal(orderQueueFilter('confirmation').fulfillmentState, 'received');
  assert.equal(orderQueueFilter('payment_reviews').paymentState, 'awaiting_verification');
  const filter = orderQueueFilter('packing_shipping'); filter.fulfillmentState.$in.push('cancelled');
  assert.equal(orderQueueFilter('packing_shipping').fulfillmentState.$in.length, 2);
  assert.throws(() => orderQueueFilter({ $ne: null }));
  assert.throws(() => orderQueueFilter('unknown'));
});
test('service performs a fixed number of bounded read-only queries with time limits', async () => {
  const calls = [];
  const fake = { aggregate(pipeline) { calls.push(pipeline); return { option(options) { assert.equal(options.maxTimeMS, 5000); return Promise.resolve([]); } }; } };
  const Order = { ...fake, find(filter) { assert.deepEqual(filter, {}); return { sort(value) { assert.deepEqual(value, { createdAt: -1, _id: -1 }); return this; }, limit(n) { assert.equal(n, 8); return this; }, select(value) { assert.ok(!value.includes('customer')); return this; }, maxTimeMS(n) { assert.equal(n, 5000); return this; }, lean() { return Promise.resolve([]); } }; } };
  const result = await loadOverview('today', { now, models: { Order, Product: fake, Category: fake, PaymentProof: fake } });
  assert.equal(calls.length, 5);
  assert.equal(result.metrics.totalOrders, 0);
  assert.ok(!JSON.stringify(calls).match(/\$out|\$merge/));
});
