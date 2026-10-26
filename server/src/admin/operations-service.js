import OrderMail from '../models/OrderMail.js';
import PaymentProof from '../models/PaymentProof.js';
import MediaAsset from '../models/MediaAsset.js';
import { orderEmailIssues } from '../notifications/order-mail-values.js';
import { MAIL_LEASE_MS } from '../notifications/mail-policy.js';

const count = condition => ({ $sum: { $cond: [condition, 1, 0] } });
export function notificationHealthPipeline(now) {
  return [{ $group: { _id: null,
    pending: count({ $eq: ['$state', 'pending'] }), dead: count({ $eq: ['$state', 'dead'] }), uncertain: count({ $eq: ['$state', 'uncertain'] }),
    sending: count({ $eq: ['$state', 'sending'] }),
    stuck: count({ $and: [{ $eq: ['$state', 'sending'] }, { $or: [{ $lte: ['$lockUntil', now] }, { $eq: [{ $ifNull: ['$lockUntil', null] }, null] }] }] }),
    retrying: count({ $and: [{ $eq: ['$state', 'pending'] }, { $gt: ['$attempts', 0] }] }),
    integrityFailures: count({ $and: [{ $eq: ['$state', 'dead'] }, { $eq: ['$failureClass', 'integrity'] }] }),
    lastAcceptedAt: { $max: '$sentAt' }, lastProcessedAt: { $max: '$processedAt' },
  } }];
}
export function proofHealthPipeline(now) {
  const stale = new Date(+now - 15 * 60000);
  return [{ $facet: {
    expiredIntents: [{ $match: { state: 'pending', expiresAt: { $lte: now } } }, { $count: 'count' }],
    unattachedCopies: [{ $unwind: '$freezeAttempts' }, { $match: { 'freezeAttempts.startedAt': { $lte: stale }, 'freezeAttempts.copiedAt': { $type: 'date' }, $expr: { $ne: ['$freezeAttempts.key', '$verifiedKey'] } } }, { $count: 'count' }],
    uncertainCopies: [{ $unwind: '$freezeAttempts' }, { $match: { 'freezeAttempts.startedAt': { $lte: stale }, 'freezeAttempts.copiedAt': null } }, { $count: 'count' }],
  } }];
}
export function mediaHealthPipeline(now) {
  return [{ $facet: {
    expiredIntents: [{ $match: { state: 'pending', createdAt: { $lte: new Date(+now - 15 * 60000) } } }, { $count: 'count' }],
    unattachedVerified: [{ $match: { state: 'verified' } },
      { $lookup: { from: 'products', localField: 'key', foreignField: 'imageKeys', pipeline: [{ $project: { _id: 1 } }, { $limit: 1 }], as: 'product' } },
      { $match: { 'product.0': { $exists: false } } },
      { $lookup: { from: 'categories', localField: 'key', foreignField: 'imageKey', pipeline: [{ $project: { _id: 1 } }, { $limit: 1 }], as: 'category' } },
      { $match: { 'category.0': { $exists: false } } }, { $count: 'count' }],
  } }];
}
export async function loadOperations({ models = { OrderMail, PaymentProof, MediaAsset }, env = process.env, now = new Date() } = {}) {
  const [mail, proof, media] = await Promise.all([[models.OrderMail, notificationHealthPipeline(now)], [models.PaymentProof, proofHealthPipeline(now)], [models.MediaAsset, mediaHealthPipeline(now)]]
    .map(async ([model, pipeline]) => (await model.aggregate(pipeline).option({ maxTimeMS: 5000, timeoutMS: 5000 }))[0] || {}));
  const countOf = (data, key) => data[key]?.[0]?.count || 0;
  const configured = orderEmailIssues({ ...env, ORDER_EMAILS_ENABLED: 'true' }).length === 0;
  const enabled = env.ORDER_EMAILS_ENABLED === 'true';
  return { calculatedAt: now.toISOString(), email: { enabled, configured, mode: !enabled ? 'disabled' : configured ? 'ready' : 'unconfigured',
    pending: mail.pending || 0, dead: mail.dead || 0, uncertain: mail.uncertain || 0, sending: mail.sending || 0, stuck: mail.stuck || 0,
    retrying: mail.retrying || 0, integrityFailures: mail.integrityFailures || 0, lastAcceptedAt: mail.lastAcceptedAt || null, lastProcessedAt: mail.lastProcessedAt || null,
    manualReplayEnabled: false, leaseSeconds: MAIL_LEASE_MS / 1000 },
  storage: { expiredProofIntents: countOf(proof, 'expiredIntents'), unattachedProofCopies: countOf(proof, 'unattachedCopies'), uncertainProofCopies: countOf(proof, 'uncertainCopies'),
    expiredImageIntents: countOf(media, 'expiredIntents'), unattachedImages: countOf(media, 'unattachedVerified'), objectInventoryScanned: false, automaticCleanupEnabled: false } };
}
