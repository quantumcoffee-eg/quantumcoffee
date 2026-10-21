import { randomBytes } from 'node:crypto';
import AccountToken from '../models/AccountToken.js';
import { PURPOSES, EXPIRY_MS, digestToken, validAccountToken } from './account-token-values.js';
export { accountActionLink, validAccountToken, digestToken, EXPIRY_MS } from './account-token-values.js';

export async function issueAccountToken(userId, purpose) {
  if (!PURPOSES.includes(purpose)) throw new Error('Invalid token purpose.');
  const raw = randomBytes(32).toString('hex');
  await AccountToken.deleteMany({ userId, purpose });
  const record = await AccountToken.create({ userId, purpose, digest: digestToken(raw), expiresAt: new Date(Date.now() + EXPIRY_MS[purpose]) });
  return { token: raw, id: record._id };
}
export async function consumeAccountToken(token, purpose) {
  if (!validAccountToken(token) || !PURPOSES.includes(purpose)) return null;
  return AccountToken.findOneAndDelete({ digest: digestToken(token), purpose, expiresAt: { $gt: new Date() } });
}
