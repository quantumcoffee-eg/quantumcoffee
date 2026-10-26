import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Session from '../src/models/Session.js';
import User from '../src/models/User.js';
import { createOverviewRouter } from '../src/routes/overview.routes.js';

test('real session/role middleware protects overview, validates queries, never caches responses', async t => {
  let role = 'customer', called = 0;
  t.mock.method(Session, 'findOne', () => ({ lean: async () => ({ userId: '507f1f77bcf86cd799439011' }) }));
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ role }) }) }));
  const app = express();
  app.use('/api/admin/overview', createOverviewRouter({ isDatabaseReady: () => true, service: async range => { called++; return { range, metrics: { totalProducts: 3 } }; } }));
  app.use((_error, _req, res, _next) => res.status(500).json({ error: 'Internal error' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}/api/admin/overview`;
  const cookie = { Cookie: `qc_session=${'a'.repeat(64)}` };
  let response = await fetch(origin);
  assert.equal(response.status, 401); assert.equal(response.headers.get('cache-control'), 'no-store');
  response = await fetch(origin, { headers: cookie });
  assert.equal(response.status, 403); assert.equal(called, 0);
  role = 'admin';
  for (const suffix of ['?range=invalid', '?range=7d&range=30d', '?range[$ne]=today', '?start=2026-02-30']) {
    response = await fetch(origin + suffix, { headers: cookie }); assert.equal(response.status, 400); assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  response = await fetch(origin + '?range=7d', { headers: cookie });
  assert.equal(response.status, 200); assert.equal(called, 1);
  assert.deepEqual(await response.json(), { overview: { range: '7d', metrics: { totalProducts: 3 } } });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('unconfigured database fails closed before any analytics query', async t => {
  const app = express();
  app.use('/api/admin/overview', createOverviewRouter({ isDatabaseReady: () => false, service: () => { throw new Error('Must not query'); } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/overview`);
  assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store');
});
