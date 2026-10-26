import OrderMail from '../models/OrderMail.js';
import { databaseReady } from '../db/connect.js';
import { makeMailTransport } from '../mailer.js';
import { orderMailContent, isMailAddress } from './order-mail-content.js';
import { notificationDocuments, orderEmailIssues } from './order-mail-values.js';
import { createMailQueue } from './mail-queue.js';
import { verifyMonetaryMail } from './mail-integrity.js';
import { MAIL_BATCH_SIZE, MAIL_SEND_MS, MAIL_POLL_MS, MAIL_DB_MS, mailFailure } from './mail-policy.js';

export async function queueOrderMail(kind, order, session, { model = OrderMail, env = process.env, monetary = null, models } = {}) {
  if (env.ORDER_EMAILS_ENABLED !== 'true') return;
  if (!session?.inTransaction()) throw new Error('Notification enqueueing requires the business transaction.');
  const docs = notificationDocuments(kind, order, env, monetary);
  if (!docs.length) return;
  await verifyMonetaryMail(docs[0], { models, session });
  await model.bulkWrite(docs.map(item => ({ updateOne: { filter: item.monetaryEventId ? { monetaryEventId: item.monetaryEventId, audience: item.audience } : { dedupeKey: item.dedupeKey }, update: { $setOnInsert: item }, upsert: true } })), { ordered: true, session });
}

export function createOrderMailWorker({ env = process.env, model = OrderMail, models, clock = () => new Date(), isReady = databaseReady,
  transportFactory = signal => makeMailTransport(env, { signal }), timers = { setTimeout, clearTimeout },
  log = code => console.error('Quantum notification worker:', code) } = {}) {
  const queue = createMailQueue({ model, clock });
  let stopped = false, active = null, poll = null, controller = null, started = false;
  async function send(job) {
    if (+job.lockUntil <= +new Date(clock()) + MAIL_SEND_MS + 2 * MAIL_DB_MS) throw new Error('Insufficient lease budget for SMTP.');
    controller = new AbortController();
    const signal = controller.signal;
    let deadline, sender;
    try {
      sender = transportFactory(signal);
      if (!sender) throw Object.assign(new Error('SMTP unavailable.'), { code: 'EAUTH' });
      const timeout = new Promise((_, reject) => {
        deadline = timers.setTimeout(() => { controller?.abort(); reject(Object.assign(new Error('SMTP deadline exceeded.'), { code: 'SEND_DEADLINE' })); }, MAIL_SEND_MS);
      });
      const aborted = new Promise((_, reject) => { signal.addEventListener('abort', () => reject(Object.assign(new Error('SMTP attempt stopped.'), { code: 'SEND_ABORTED' })), { once: true }); });
      const result = await Promise.race([Promise.resolve().then(() => sender.sendMail({ from: env.MAIL_FROM, replyTo: env.MAIL_REPLY_TO || undefined, to: job.to,
        ...orderMailContent({ ...job, siteOrigin: env.PUBLIC_SITE_ORIGIN }),
        messageId: job.messageId || `<qc.${job.dedupeKey}@legacy.quantumcoffee.invalid>`, headers: { 'X-Quantum-Notification': job.dedupeKey },
        disableFileAccess: true, disableUrlAccess: true })), timeout, aborted]);
      if (!Array.isArray(result?.accepted) || !result.accepted.some(address => typeof address === 'string' && address.toLowerCase() === job.to.toLowerCase())) {
        if (result?.rejected?.length) throw Object.assign(new Error('Recipient rejected.'), { responseCode: 550 });
        throw new Error('SMTP acceptance is unknown.');
      }
    } finally { timers.clearTimeout(deadline); sender?.close?.(); controller = null; }
  }
  async function batch() {
    if (stopped || env.ORDER_EMAILS_ENABLED !== 'true') return { processed: 0, status: 'disabled' };
    if (!isReady()) return { processed: 0, status: 'database_unavailable' };
    if (orderEmailIssues(env).length) return { processed: 0, status: 'unconfigured' };
    let processed = 0;
    try {
      await queue.recover();
      for (let i = 0; i < MAIL_BATCH_SIZE && !stopped; i++) {
        const job = await queue.claim();
        if (!job) break;
        if (stopped) { await queue.finish(job, { state: 'pending', code: 'STOPPED_BEFORE_SEND', category: 'temporary' }); break; }
        try {
          orderMailContent({ ...job, siteOrigin: env.PUBLIC_SITE_ORIGIN });
          if (!/^[a-f0-9]{64}$/.test(job.dedupeKey) || !isMailAddress(job.to) || (job.messageId && !/^<qc\.[a-f0-9]{64}@[a-zA-Z0-9.-]+>$/.test(job.messageId))) throw new Error('Invalid notification identity.');
        } catch { await queue.finish(job, { state: 'dead', code: 'INVALID_NOTIFICATION', category: 'integrity' }); continue; }
        try { await verifyMonetaryMail(job, { models }); }
        catch (error) {
          if (error.code !== 'MONETARY_EVENT_MISMATCH') throw error;
          await queue.finish(job, { state: 'dead', code: 'MONETARY_EVENT_MISMATCH', category: 'integrity' }); continue;
        }
        if (stopped || !await queue.dispatch(job)) continue;
        processed++;
        let outcome;
        try { await send(job); outcome = { state: 'sent' }; }
        catch (error) { outcome = mailFailure(error); }
        // Finalization DB errors never enter the SMTP failure/retry path.
        if (!await queue.finish(job, outcome)) log('LEASE_OWNERSHIP_LOST');
      }
      return { processed, status: 'processed' };
    } catch { log('NOTIFICATION_DATABASE_UNAVAILABLE'); return { processed, status: 'database_unavailable' }; }
  }
  function processBatch() {
    if (active) return active;
    active = batch().finally(() => { active = null; });
    return active;
  }
  function start() {
    if (stopped || started || env.ORDER_EMAILS_ENABLED !== 'true' || orderEmailIssues(env).length) return;
    started = true;
    const tick = async () => {
      poll = null;
      await processBatch();
      if (!stopped) { poll = timers.setTimeout(tick, MAIL_POLL_MS); poll?.unref?.(); }
    };
    void tick();
  }
  return { processBatch, start, abort: () => controller?.abort(),
    async stop() { stopped = true; timers.clearTimeout(poll); poll = null; await active; } };
}
export async function processOrderMailBatch(options = {}) { return createOrderMailWorker(options).processBatch(); }
export function startOrderMailWorker(env = process.env) {
  const worker = createOrderMailWorker({ env }); worker.start(); return worker;
}
