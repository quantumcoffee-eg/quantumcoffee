import test from 'node:test';
import assert from 'node:assert/strict';
import { expirationPolicy } from '../src/commerce/expiration-policy.js';
import { createOrderService } from '../src/commerce/order-service.js';
import { productionConfigIssues } from '../src/config/production.js';
import { assertIsolatedReplicaUri } from '../testing/isolated-commerce.js';
import { databaseCommerceError } from '../src/commerce/transactions.js';
import { ORDERING_IMPLEMENTED } from '../src/commerce/checkout.js';
import { createApp } from '../src/app.js';

test('expiration has no invented duration, is disabled by default, and production startup rejects activation', async () => {
  assert.deepEqual(expirationPolicy({}), { enabled: false, windowMs: null });
  for (const env of [{ UNPAID_ORDER_EXPIRATION_ENABLED: 'true' }, { UNPAID_ORDER_EXPIRATION_ENABLED: 'yes' }, { UNPAID_ORDER_EXPIRATION_MINUTES: '0' }, { UNPAID_ORDER_EXPIRATION_MINUTES: '1.5' }]) assert.throws(() => expirationPolicy(env));
  const service = createOrderService({ connection: { transaction: () => { throw new Error('Must not start a transaction'); } }, models: {}, env: {} });
  assert.deepEqual(await service.expirationBatch(), { enabled: false, scanned: 0, expired: 0 });
  assert.equal((await service.expireOrder('unused')).reason, 'DISABLED');
  assert.ok(productionConfigIssues({ NODE_ENV: 'production', UNPAID_ORDER_EXPIRATION_ENABLED: 'true', UNPAID_ORDER_EXPIRATION_MINUTES: '10' }).some(message => message.startsWith('UNPAID_ORDER_EXPIRATION_ENABLED')));
});
test('transaction test infrastructure rejects Atlas, remote hosts, credentials and database names before connecting', () => {
  for (const uri of ['mongodb+srv://example.invalid', 'mongodb://remote.invalid:27029/?replicaSet=qc-c1-rs', 'mongodb://user:pass@127.0.0.1:27029/?replicaSet=qc-c1-rs', 'mongodb://127.0.0.1:27029/production?replicaSet=qc-c1-rs', 'mongodb://127.0.0.1:27029/qc_c1_test_existing?replicaSet=qc-c1-rs', 'mongodb://127.0.0.1:27029/?replicaSet=other', 'mongodb://127.0.0.1:27029/?replicaSet=qc-c1-rs&authSource=admin']) assert.throws(() => assertIsolatedReplicaUri(uri));
  assert.doesNotThrow(() => assertIsolatedReplicaUri('mongodb://127.0.0.1:27029/?replicaSet=qc-c1-rs'));
});
test('safe database errors distinguish uncertainty and never echo private error text', () => {
  const raw = Object.assign(new Error('mongodb://private:credentials@example.invalid customer@example.invalid'), { name: 'MongoServerSelectionError' });
  const safe = databaseCommerceError(raw);
  assert.equal(safe.code, 'DATABASE_BUSY'); assert.equal(safe.status, 503); assert.ok(!safe.message.includes('private'));
  const uncertain = databaseCommerceError({ errorLabels: ['UnknownTransactionCommitResult'] });
  assert.equal(uncertain.code, 'TRANSACTION_UNCERTAIN'); assert.match(uncertain.message, /same reference/);
});
test('real HTTP checkout stays hard-disabled even if CHECKOUT_ENABLED is true and before DB access', async t => {
  assert.equal(ORDERING_IMPLEMENTED, false);
  const previous = process.env.CHECKOUT_ENABLED;
  process.env.CHECKOUT_ENABLED = 'true';
  t.after(() => { if (previous === undefined) delete process.env.CHECKOUT_ENABLED; else process.env.CHECKOUT_ENABLED = previous; });
  const server = createApp().listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/commerce/checkout`, { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'CHECKOUT_DISABLED');
});
