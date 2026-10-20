import { randomBytes, scrypt as callbackScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(callbackScrypt);
const KEY_LENGTH = 64;
// Empty or ambiguous passwords are rejected before hashing to avoid excessive work.
export function passwordError(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) return 'Use a password between 12 and 128 characters.';
  if (Buffer.byteLength(password, 'utf8') > 512) return 'Password is too long.';
  return null;
}
export async function hashPassword(password) {
  const error = passwordError(password);
  if (error) throw new Error(error);
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 512 || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f\d]{32}$/.test(parts[1]) || !/^[a-f\d]{128}$/.test(parts[2])) return false;
  const actual = await scrypt(password, parts[1], KEY_LENGTH);
  return timingSafeEqual(actual, Buffer.from(parts[2], 'hex'));
}
