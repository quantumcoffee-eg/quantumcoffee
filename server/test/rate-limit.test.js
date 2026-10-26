import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createRateLimitStore, rateLimit, rateLimitIdentity } from '../src/security/rate-limit.js';

test('rate limiter and expiry heap have a strict cap under unique-key flooding', () => {
  const state = createRateLimitStore({ maxEntries: 5, now: () => 100 });
  for (let i = 0; i < 10000; i++) assert.equal(state.take(`unique-${i}`, { limit: 2, windowMs: 1000 }).allowed, i < 5);
  assert.equal(state.size, 5); assert.equal(state.expiryEntries, 5);
  assert.equal(state.take('unique-0', { limit: 2, windowMs: 1000 }).allowed, true);
  assert.equal(state.take('unique-0', { limit: 2, windowMs: 1000 }).allowed, false, 'capacity cannot reset live allowances');
});
test('expired entries are reclaimed with mixed windows; retry-after is rounded up and clock rollback cannot reopen windows', () => {
  let now = 100;
  const state = createRateLimitStore({ maxEntries: 2, now: () => now });
  state.take('long', { limit: 1, windowMs: 2501 });
  state.take('short', { limit: 1, windowMs: 1000 });
  assert.deepEqual(state.take('third', { limit: 1, windowMs: 1000 }), { allowed: false, retryAfter: 1, capacity: true });
  now = 1100;
  assert.equal(state.take('third', { limit: 1, windowMs: 1000 }).allowed, true);
  now = 50;
  assert.equal(state.take('long', { limit: 1, windowMs: 2501 }).allowed, false);
  now = 2700;
  assert.equal(state.take('fresh', { limit: 1, windowMs: 1000 }).allowed, true);
  assert.equal(state.size, 1); assert.equal(state.expiryEntries, 1);
});
test('IP spellings are normalized, IPv6 rotation within /64 shares a bucket, malformed values are safe', () => {
  assert.equal(rateLimitIdentity('::ffff:192.0.2.1'), '192.0.2.1');
  assert.equal(rateLimitIdentity('0:0:0:0:0:ffff:c000:201'), '192.0.2.1');
  assert.equal(rateLimitIdentity('2001:db8::1'), rateLimitIdentity('2001:0db8:0:0:ffff::5'));
  assert.notEqual(rateLimitIdentity('2001:db8:1::1'), rateLimitIdentity('2001:db8:2::1'));
  for (const address of [null, undefined, 'forged-address', 'fe80::1%eth0']) assert.equal(rateLimitIdentity(address), 'unknown');
});
test('middleware shares one allowance across record URLs and isolates different policies', () => {
  const state = createRateLimitStore({ maxEntries: 10, now: () => 0 });
  const a = rateLimit({ limit: 1, windowMs: 2501, state }), b = rateLimit({ limit: 1, state });
  const invoke = (middleware, path) => {
    const result = { headers: {}, next: false };
    const response = { setHeader: (key, value) => { result.headers[key] = value; }, status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } };
    middleware({ ip: '192.0.2.1', path }, response, () => { result.next = true; }); return result;
  };
  assert.equal(invoke(a, '/one/confirm').next, true);
  const blocked = invoke(a, '/different-id/confirm');
  assert.equal(blocked.status, 429); assert.equal(blocked.headers['Retry-After'], '3'); assert.equal(blocked.headers['Cache-Control'], 'no-store');
  assert.equal(invoke(b, '/different-id/confirm').next, true);
});
test('Express one-hop trust uses the nearest forwarded address, not attacker-controlled prefixes', async t => {
  const app = express(); app.set('trust proxy', 1);
  app.get('/test', rateLimit({ limit: 1, state: createRateLimitStore() }), (req, res) => res.json({ ip: req.ip }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/test`;
  let response = await fetch(url, { headers: { 'X-Forwarded-For': '198.51.100.1, 203.0.113.1' } });
  assert.equal(response.status, 200); assert.equal((await response.json()).ip, '203.0.113.1');
  response = await fetch(url, { headers: { 'X-Forwarded-For': '198.51.100.99, 203.0.113.1' } });
  assert.equal(response.status, 429); assert.ok(Number(response.headers.get('retry-after')) > 0);
  response = await fetch(url, { headers: { 'X-Forwarded-For': '198.51.100.99, 203.0.113.2' } });
  assert.equal(response.status, 200);
});
