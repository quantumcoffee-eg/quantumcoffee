import { randomUUID } from 'node:crypto';
import OrderMail from '../models/OrderMail.js';
import { MAIL_MAX_ATTEMPTS, MAIL_BATCH_SIZE, MAIL_LEASE_MS, MAIL_DB_MS, MAIL_WRITE_OPTIONS, retryDelay } from './mail-policy.js';

export function createMailQueue({ model = OrderMail, clock = () => new Date(), token = randomUUID } = {}) {
  const now = () => new Date(clock());
  const owned = job => ({ _id: job._id, state: 'sending', leaseToken: job.leaseToken, lockUntil: { $gt: now() } });
  const lease = phase => ({ state: 'sending', phase, leaseToken: token(), lockUntil: new Date(+now() + MAIL_LEASE_MS), lastAttemptAt: now() });
  async function claim() {
    return model.findOneAndUpdate({ state: 'pending', attempts: { $lt: MAIL_MAX_ATTEMPTS }, nextAttemptAt: { $lte: now() } },
      { $set: lease('claimed'), $inc: { attempts: 1 } }, { ...MAIL_WRITE_OPTIONS, new: true, sort: { nextAttemptAt: 1, _id: 1 } }).lean();
  }
  async function dispatch(job) {
    const result = await model.updateOne({ ...owned(job), phase: 'claimed' }, { $set: { phase: 'dispatching' } }, MAIL_WRITE_OPTIONS);
    return result.modifiedCount === 1;
  }
  async function finish(job, { state, code = '', category = null }) {
    const at = now();
    if (state === 'pending' && job.attempts >= MAIL_MAX_ATTEMPTS) { state = 'dead'; code = 'RETRY_EXHAUSTED'; }
    const changes = { state, lastError: code, failureClass: category, processedAt: at, lockUntil: null, phase: null,
      ...(state === 'pending' ? { nextAttemptAt: new Date(+at + retryDelay(job.attempts)) } : {}),
      ...(state === 'sent' ? { sentAt: at, expiresAt: new Date(+at + 90 * 86400000) } : {}) };
    // A DB acknowledgement failure may retry this update, never SMTP. Retaining
    // the terminal token allows recognition of an already committed update.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await model.updateOne(owned(job), { $set: changes }, MAIL_WRITE_OPTIONS);
        if (result.modifiedCount === 1) return true;
        return Boolean(await model.exists({ _id: job._id, leaseToken: job.leaseToken, state, processedAt: at }).maxTimeMS(MAIL_DB_MS).setOptions({ timeoutMS: MAIL_DB_MS }));
      } catch (error) { if (attempt === 1) throw error; }
    }
    return false;
  }
  async function recover() {
    let recovered = 0;
    for (let i = 0; i < MAIL_BATCH_SIZE; i++) {
      const at = now(), replacement = lease('recovering');
      const expired = await model.findOneAndUpdate({ state: 'sending', $or: [{ lockUntil: { $lte: at } }, { lockUntil: null, updatedAt: { $lte: new Date(+at - MAIL_LEASE_MS) } }] },
        { $set: replacement }, { ...MAIL_WRITE_OPTIONS, new: false, sort: { lockUntil: 1, _id: 1 } }).lean();
      if (!expired) break;
      const job = { ...expired, leaseToken: replacement.leaseToken };
      await finish(job, expired.phase === 'claimed'
        ? { state: 'pending', code: 'LEASE_EXPIRED_BEFORE_SEND', category: 'temporary' }
        : { state: 'uncertain', code: 'DELIVERY_OUTCOME_UNKNOWN', category: 'uncertain' });
      recovered++;
    }
    for (let i = 0; i < MAIL_BATCH_SIZE; i++) {
      const job = await model.findOneAndUpdate({ state: 'pending', attempts: { $gte: MAIL_MAX_ATTEMPTS } }, { $set: lease('recovering') }, { ...MAIL_WRITE_OPTIONS, new: true }).lean();
      if (!job) break;
      await finish(job, { state: 'dead', code: 'RETRY_EXHAUSTED', category: 'permanent' }); recovered++;
    }
    return recovered;
  }
  return { claim, dispatch, finish, recover };
}
