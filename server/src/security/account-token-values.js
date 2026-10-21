import { createHash } from 'node:crypto';

export const PURPOSES = Object.freeze(['email_verification', 'password_reset']);
export const EXPIRY_MS = Object.freeze({ email_verification: 24 * 60 * 60 * 1000, password_reset: 30 * 60 * 1000 });
export const digestToken = token => createHash('sha256').update(token).digest('hex');
export function validAccountToken(token) { return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token); }
export function accountActionLink(siteOrigin, kind, token) {
  if (!validAccountToken(token) || !['verify-email', 'reset-password'].includes(kind)) throw new Error('Invalid account action.');
  const url = new URL(siteOrigin);
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Invalid site origin.');
  return `${url.origin}/${kind}#token=${token}`;
}
