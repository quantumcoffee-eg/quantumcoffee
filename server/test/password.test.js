import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, passwordError, verifyPassword } from '../src/security/password.js';
test('password validation rejects weak / oversized inputs', () => {
  assert.ok(passwordError('123456789'));
  assert.ok(passwordError('x'.repeat(129)));
  assert.equal(passwordError('a strong password 2026!'), null);
});
test('hashing salts each password and verifies only the correct secret', async () => {
  const secret = 'Quantum coffee password 2026!';
  const one = await hashPassword(secret);
  const two = await hashPassword(secret);
  assert.notEqual(one, two);
  assert.equal(await verifyPassword(secret, one), true);
  assert.equal(await verifyPassword('bad password!', one), false);
  assert.equal(await verifyPassword(secret, 'invalid'), false);
});
