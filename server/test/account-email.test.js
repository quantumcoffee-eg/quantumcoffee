import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountActionLink, digestToken, validAccountToken, EXPIRY_MS } from '../src/security/account-token-values.js';

test('account tokens are exact random 32-byte hex values and digests are stable', () => {
  const raw='a'.repeat(64);
  assert.equal(validAccountToken(raw), true);
  assert.equal(validAccountToken('short'), false);
  assert.equal(validAccountToken('A'.repeat(64)), false);
  assert.equal(digestToken(raw),digestToken(raw));
  assert.notEqual(digestToken(raw),raw);
});
test('links use URL fragment instead of HTTP query and reject invalid paths', () => {
  const token='a'.repeat(64);
  assert.equal(accountActionLink('https://coffee.example','reset-password',token),`https://coffee.example/reset-password#token=${token}`);
  assert.throws(()=>accountActionLink('javascript:alert(1)','reset-password',token));
  assert.throws(()=>accountActionLink('https://coffee.example','other',token));
});
test('verification lasts 24h, reset lasts 30 minutes', () => {
  assert.equal(EXPIRY_MS.email_verification,24*60*60*1000);
  assert.equal(EXPIRY_MS.password_reset,30*60*1000);
});
