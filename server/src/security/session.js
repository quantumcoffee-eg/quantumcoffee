import { createHash, randomBytes } from 'node:crypto';
import Session from '../models/Session.js';
import User from '../models/User.js';

const COOKIE_NAME = 'qc_session';
const DURATION_MS = 14 * 24 * 60 * 60 * 1000;
const tokenDigest = (token) => createHash('sha256').update(token).digest('hex');
const secureCookie = () => process.env.NODE_ENV === 'production';

function getCookie(req) {
  const header = req.headers.cookie || '';
  const part = header.split(';').map(item => item.trim()).find(item => item.startsWith(`${COOKIE_NAME}=`));
  const token = part?.slice(COOKIE_NAME.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
function cookieOptions(maxAge) {
  return { httpOnly: true, secure: secureCookie(), sameSite: 'lax', path: '/', maxAge };
}
export function clearSessionCookie(res) { res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: secureCookie(), sameSite: 'lax', path: '/' }); }
export async function revokeSession(req) {
  const token = getCookie(req);
  if (token) await Session.deleteOne({ tokenHash: tokenDigest(token) });
}
export async function createSession(res, user) {
  const token = randomBytes(32).toString('hex');
  await Session.create({ userId: user._id, tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + DURATION_MS) });
  res.cookie(COOKIE_NAME, token, cookieOptions(DURATION_MS));
}
export async function loadUser(req, _res, next) {
  try {
    req.authUser = null;
    const token = getCookie(req);
    if (!token) return next();
    const session = await Session.findOne({ tokenHash: tokenDigest(token), expiresAt: { $gt: new Date() } }).lean();
    if (!session) return next();
    req.authUser = await User.findById(session.userId).select('_id name email role emailVerifiedAt').lean();
    next();
  } catch (error) { next(error); }
}
export function publicUser(user) {
  return { id: String(user._id), name: user.name, email: user.email, role: user.role, emailVerified: Boolean(user.emailVerifiedAt) };
}
export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.authUser) return res.status(401).json({ error: 'Please sign in.', code: 'AUTH_REQUIRED' });
    if (!allowed.includes(req.authUser.role)) return res.status(403).json({ error: 'Access denied.', code: 'FORBIDDEN' });
    next();
  };
}
