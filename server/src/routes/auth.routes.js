import { Router } from 'express';
import User from '../models/User.js';
import AccountToken from '../models/AccountToken.js';
import Session from '../models/Session.js';
import { passwordError, hashPassword, verifyPassword } from '../security/password.js';
import { createSession, revokeSession, clearSessionCookie, loadUser, publicUser } from '../security/session.js';
import { issueAccountToken, consumeAccountToken, accountActionLink, validAccountToken } from '../security/account-tokens.js';
import { mailConfigured, sendAccountMail } from '../mailer.js';
import { rateLimit } from '../security/rate-limit.js';
import { databaseReady } from '../db/connect.js';

const router = Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = email => email.length <= 254 && emailPattern.test(email);
const validateName = name => typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 80;
const genericMailResponse = { ok: true, message: 'If the account is eligible, check its email for a link.' };
function dbGuard(_req, res, next) { return databaseReady() ? next() : res.status(503).json({ error: 'Account service is not configured yet.', code: 'SERVICE_UNAVAILABLE' }); }
function smtpGuard(_req, res, next) { return mailConfigured() ? next() : res.status(503).json({ error: 'Email service is not configured yet.', code: 'MAIL_UNAVAILABLE' }); }
function siteOrigin() { return process.env.PUBLIC_SITE_ORIGIN || ''; }

async function deliverToken(user, purpose) {
  const issued = await issueAccountToken(user._id, purpose);
  try {
    const path = purpose === 'email_verification' ? 'verify-email' : 'reset-password';
    await sendAccountMail({ to: user.email, purpose, link: accountActionLink(siteOrigin(), path, issued.token) });
  } catch (error) {
    await AccountToken.deleteOne({ _id: issued.id });
    throw error;
  }
}

router.get('/me', dbGuard, loadUser, (req, res) => res.json({ user: req.authUser ? publicUser(req.authUser) : null }));
router.post('/register', dbGuard, rateLimit({ limit: 5 }), async (req, res, next) => {
  try {
    if (process.env.REGISTRATION_ENABLED !== 'true') return res.status(503).json({ error: 'Registration is not open yet.', code: 'REGISTRATION_DISABLED' });
    if (!mailConfigured()) return res.status(503).json({ error: 'Email setup is incomplete.', code: 'MAIL_UNAVAILABLE' });
    const { name, password } = req.body || {};
    const email = cleanEmail(req.body?.email);
    if (!validateName(name) || !validEmail(email) || passwordError(password)) return res.status(400).json({ error: 'Enter a valid name, email and password (12–128 characters).', code: 'INVALID_INPUT' });
    const user = await User.create({ name: name.trim(), email, passwordHash: await hashPassword(password), role: 'customer' });
    try { await deliverToken(user, 'email_verification'); }
    catch (err) {
      console.error('Account verification email could not be delivered:', err?.code || err?.name || 'SMTP error');
      return res.status(503).json({ error: 'Email could not be sent. Please use resend verification later.', code: 'MAIL_FAILED' });
    }
    // No authenticated cookie before address ownership is verified.
    res.status(201).json({ verificationPending: true });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.', code: 'DUPLICATE_EMAIL' });
    next(error);
  }
});
router.post('/login', dbGuard, rateLimit({ limit: 8 }), async (req, res, next) => {
  try {
    const email = cleanEmail(req.body?.email);
    const password = req.body?.password;
    if (!validEmail(email) || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 512)
      return res.status(400).json({ error: 'Enter a valid email and password.', code: 'INVALID_INPUT' });
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await verifyPassword(password, user.passwordHash)))
      return res.status(401).json({ error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
    if (user.role === 'customer' && !user.emailVerifiedAt)
      return res.status(403).json({ error: 'Verify your email before signing in.', code: 'EMAIL_NOT_VERIFIED' });
    await revokeSession(req);
    await createSession(res, user);
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});
router.post('/resend-verification', dbGuard, smtpGuard, rateLimit({ limit: 4, windowMs: 60 * 60 * 1000 }), async (req, res, next) => {
  try {
    const email = cleanEmail(req.body?.email);
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email.', code: 'INVALID_INPUT' });
    const user = await User.findOne({ email, role: 'customer', emailVerifiedAt: null });
    if (user) try { await deliverToken(user, 'email_verification'); }
    catch (error) { console.error('Verification resend failed:', error?.code || error?.name || 'SMTP error'); }
    res.json(genericMailResponse);
  } catch (error) { next(error); }
});
router.post('/verify-email', dbGuard, rateLimit({ limit: 10 }), async (req, res, next) => {
  try {
    const record = await consumeAccountToken(req.body?.token, 'email_verification');
    if (!record) return res.status(400).json({ error: 'This verification link is invalid or expired.', code: 'INVALID_TOKEN' });
    await User.updateOne({ _id: record.userId, role: 'customer', emailVerifiedAt: null }, { $set: { emailVerifiedAt: new Date() } });
    await AccountToken.deleteMany({ userId: record.userId, purpose: 'email_verification' });
    res.json({ ok: true });
  } catch (error) { next(error); }
});
router.post('/forgot-password', dbGuard, smtpGuard, rateLimit({ limit: 4, windowMs: 60 * 60 * 1000 }), async (req, res, next) => {
  try {
    const email = cleanEmail(req.body?.email);
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email.', code: 'INVALID_INPUT' });
    const user = await User.findOne({ email });
    if (user) try { await deliverToken(user, 'password_reset'); }
    catch (error) { console.error('Password reset mail failed:', error?.code || error?.name || 'SMTP error'); }
    res.json(genericMailResponse);
  } catch (error) { next(error); }
});
router.post('/reset-password', dbGuard, rateLimit({ limit: 8 }), async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!validAccountToken(token) || passwordError(password)) return res.status(400).json({ error: 'Invalid link or password. Use 12–128 characters.', code: 'INVALID_INPUT' });
    // Hash before consuming a one-use reset token. Never store the original token.
    const hash = await hashPassword(password);
    const record = await consumeAccountToken(token, 'password_reset');
    if (!record) return res.status(400).json({ error: 'This reset link is invalid or expired.', code: 'INVALID_TOKEN' });
    const user = await User.findByIdAndUpdate(record.userId, { $set: { passwordHash: hash } }, { new: true });
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or expired.', code: 'INVALID_TOKEN' });
    await Session.deleteMany({ userId: user._id });
    await AccountToken.deleteMany({ userId: user._id, purpose: 'password_reset' });
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) { next(error); }
});
router.post('/logout', async (req, res, next) => {
  try { if (databaseReady()) await revokeSession(req); clearSessionCookie(res); res.json({ ok: true }); }
  catch (error) { next(error); }
});
export default router;
