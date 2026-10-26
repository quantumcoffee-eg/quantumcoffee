import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

// Equivalent IPv6 spellings share a /64 bucket. Use only Express's trusted IP.
export function rateLimitIdentity(address) {
  if (typeof address !== 'string') return 'unknown';
  if (isIP(address) === 4) return address;
  if (isIP(address) !== 6) return 'unknown';
  let normalized;
  try { normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1); } catch { return 'unknown'; }
  const [left, right = ''] = normalized.split('::');
  const a = left ? left.split(':') : [], b = right ? right.split(':') : [];
  const words = normalized.includes('::') ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a;
  const numbers = words.map(word => parseInt(word, 16));
  if (numbers.slice(0, 5).every(n => n === 0) && numbers[5] === 65535) return `${numbers[6] >> 8}.${numbers[6] & 255}.${numbers[7] >> 8}.${numbers[7] & 255}`;
  return `v6:${numbers.slice(0, 4).map(n => n.toString(16)).join(':')}/64`;
}

export function createRateLimitStore({ maxEntries = 5000, now = Date.now } = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 100000) throw new Error('Invalid rate-limit capacity.');
  const entries = new Map(), heap = [];
  let lastTime = 0;
  const swap = (a, b) => { [heap[a], heap[b]] = [heap[b], heap[a]]; };
  const push = item => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (heap[parent].expires <= heap[i].expires) break;
      swap(i, parent); i = parent;
    }
  };
  const pop = () => {
    const first = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0;;) {
        let child = i * 2 + 1;
        if (child >= heap.length) break;
        if (child + 1 < heap.length && heap[child + 1].expires < heap[child].expires) child++;
        if (heap[i].expires <= heap[child].expires) break;
        swap(i, child); i = child;
      }
    }
    return first;
  };
  return Object.freeze({
    get size() { return entries.size; },
    get expiryEntries() { return heap.length; },
    take(key, { limit, windowMs }) {
      if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1 || windowMs > 86400000) throw new Error('Invalid rate-limit policy.');
      const time = now();
      if (!Number.isFinite(time)) throw new Error('Invalid rate-limit clock.');
      lastTime = Math.max(lastTime, time);
      while (heap.length && heap[0].expires <= lastTime) entries.delete(pop().key);
      const digest = createHash('sha256').update(key).digest('hex');
      let entry = entries.get(digest);
      if (!entry) {
        // Fail closed: evicting a live bucket would reset its allowance.
        if (entries.size === maxEntries) return { allowed: false, retryAfter: Math.max(1, Math.ceil((heap[0].expires - lastTime) / 1000)), capacity: true };
        entry = { key: digest, count: 0, expires: lastTime + windowMs };
        entries.set(digest, entry); push(entry);
      }
      entry.count = Math.min(limit + 1, entry.count + 1);
      return { allowed: entry.count <= limit, retryAfter: Math.max(1, Math.ceil((entry.expires - lastTime) / 1000)), capacity: false };
    },
  });
}

const store = createRateLimitStore();
let policyNumber = 0;
export function rateLimit({ windowMs = 15 * 60 * 1000, limit = 8, state = store } = {}) {
  const policy = ++policyNumber;
  return (req, res, next) => {
    // One bucket per middleware policy, not per attacker-controlled record URL.
    const result = state.take(`${policy}:${rateLimitIdentity(req.ip || req.socket?.remoteAddress || '')}`, { limit, windowMs });
    if (result.allowed) return next();
    res.setHeader('Retry-After', String(result.retryAfter));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(429).json({ error: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' });
  };
}
