// Per-instance limiter for the single Render starter instance. Move to a shared store
// before scaling horizontally. Login always returns a generic credential error.
const attempts = new Map();
export function rateLimit({ windowMs = 15 * 60 * 1000, limit = 8 } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    let record = attempts.get(key);
    if (!record || record.expires <= now) record = { count: 0, expires: now + windowMs };
    record.count++;
    attempts.set(key, record);
    if (attempts.size > 5000) for (const [k, v] of attempts) if (v.expires <= now) attempts.delete(k);
    if (record.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((record.expires - now) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' });
    }
    next();
  };
}
