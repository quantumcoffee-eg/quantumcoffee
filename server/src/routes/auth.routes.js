import { Router } from 'express';
import User from '../models/User.js';
import { passwordError, hashPassword, verifyPassword } from '../security/password.js';
import { createSession, revokeSession, clearSessionCookie, loadUser, publicUser } from '../security/session.js';
import { rateLimit } from '../security/rate-limit.js';
import { databaseReady } from '../db/connect.js';

const router = Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
function validateName(name) { return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 80; }
function dbGuard(_req, res, next) { return databaseReady() ? next() : res.status(503).json({ error: 'Account service is not configured yet.', code: 'SERVICE_UNAVAILABLE' }); }

router.get('/me', dbGuard, loadUser, (req, res) => res.json({ user: req.authUser ? publicUser(req.authUser) : null }));
router.post('/register', dbGuard, rateLimit({ limit: 5 }), async (req, res, next) => {
  try {
    // Registration remains switchable off until email verification is implemented.
    if (process.env.REGISTRATION_ENABLED !== 'true') return res.status(503).json({ error: 'Registration is not open yet.', code: 'REGISTRATION_DISABLED' });
    const { name, password } = req.body || {};
    const email = cleanEmail(req.body?.email);
    if (!validateName(name) || !emailPattern.test(email) || email.length > 254 || passwordError(password)) {
      return res.status(400).json({ error: 'Enter a valid name, email and password (12–128 characters).', code: 'INVALID_INPUT' });
    }
    const passwordHash = await hashPassword(password);
    // Public registration can ONLY create customers. Admin is never accepted from requests.
    const user = await User.create({ name: name.trim(), email, passwordHash, role: 'customer' });
    await revokeSession(req);
    await createSession(res, user);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.', code: 'DUPLICATE_EMAIL' });
    next(error);
  }
});
router.post('/login', dbGuard, rateLimit({ limit: 8 }), async (req, res, next) => {
  try {
    const email = cleanEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || email.length > 254 || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 512)
      return res.status(400).json({ error: 'Enter a valid email and password.', code: 'INVALID_INPUT' });
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await verifyPassword(password, user.passwordHash)))
      return res.status(401).json({ error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
    await revokeSession(req);
    await createSession(res, user);
    return res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});
router.post('/logout', async (req, res, next) => {
  try { if (databaseReady()) await revokeSession(req); clearSessionCookie(res); res.json({ ok: true }); }
  catch (error) { next(error); }
});
export default router;
