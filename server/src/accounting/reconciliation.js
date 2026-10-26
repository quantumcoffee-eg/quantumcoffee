import Order from '../models/Order.js';
import PaymentEvent from '../models/PaymentEvent.js';
import PaymentProof from '../models/PaymentProof.js';
import RefundCase from '../models/RefundCase.js';

export const RECONCILIATION_LIMIT = 25;
const count = condition => ({ $sum: { $cond: [condition, 1, 0] } });
const money = kind => ({ $sum: { $cond: [{ $eq: ['$kind', kind] }, '$amountPiastres', 0] } });
const when = (condition, code) => ({ $cond: [condition, [code], []] });
const facet = () => ({ $facet: {
  summary: [{ $unwind: '$issues' }, { $group: { _id: '$issues', count: { $sum: 1 } } }],
  items: [{ $sort: { createdAt: -1, _id: -1 } }, { $limit: RECONCILIATION_LIMIT },
    { $project: { _id: 0, orderId: { $toString: '$orderId' }, orderNumber: 1, issues: 1 } }],
} });

export function orderReconciliationPipeline() {
  return [
    { $lookup: { from: 'paymentevents', let: { id: '$_id', historyIds: { $ifNull: ['$paymentHistory.eventId', []] } }, pipeline: [
      { $match: { $expr: { $eq: ['$orderId', '$$id'] } } },
      { $group: { _id: null, collections: count({ $eq: ['$kind', 'collection'] }), collected: money('collection'), refunded: money('refund'), refunds: count({ $eq: ['$kind', 'refund'] }),
        adjustments: count({ $in: ['$kind', ['reversal', 'correction']] }),
        invalid: count({ $or: [{ $not: [{ $in: ['$kind', ['collection', 'refund', 'reversal', 'correction']] }] }, { $ne: [{ $type: '$occurredAt' }, 'date'] }, { $ne: [{ $type: '$recordedAt' }, 'date'] }, { $ne: [{ $type: '$by' }, 'objectId'] },
          { $ne: ['$currency', 'EGP'] }, { $not: [{ $isNumber: '$amountPiastres' }] }, { $lte: ['$amountPiastres', 0] }, { $ne: ['$amountPiastres', { $cond: [{ $isNumber: '$amountPiastres' }, { $trunc: '$amountPiastres' }, null] }] }, { $gt: ['$amountPiastres', 1000000000] }, { $gt: ['$occurredAt', '$recordedAt'] },
          { $and: [{ $eq: ['$kind', 'collection'] }, { $ne: ['$direction', 1] }] }, { $and: [{ $eq: ['$kind', 'refund'] }, { $or: [{ $ne: ['$direction', -1] }, { $ne: [{ $type: '$sourceEventId' }, 'objectId'] }, { $ne: [{ $type: '$refundCaseId' }, 'objectId'] }] }] }] }),
        unlinked: count({ $not: [{ $in: ['$_id', '$$historyIds'] }] }),
        collectionId: { $max: { $cond: [{ $eq: ['$kind', 'collection'] }, '$_id', null] } },
        collectionMethod: { $max: { $cond: [{ $eq: ['$kind', 'collection'] }, '$paymentMethod', null] } },
        collectionAt: { $max: { $cond: [{ $eq: ['$kind', 'collection'] }, '$occurredAt', null] } },
        collectionBy: { $max: { $cond: [{ $eq: ['$kind', 'collection'] }, '$by', null] } },
        collectionProof: { $max: { $cond: [{ $eq: ['$kind', 'collection'] }, '$proofId', null] } },
        sources: { $addToSet: { $cond: [{ $eq: ['$kind', 'refund'] }, '$sourceEventId', null] } },
      } },
    ], as: 'ledger' } },
    { $set: { l: { $ifNull: [{ $arrayElemAt: ['$ledger', 0] }, { collections: 0, collected: 0, refunded: 0, refunds: 0, adjustments: 0, invalid: 0, unlinked: 0, sources: [] }] },
      paidHistory: { $filter: { input: { $ifNull: ['$paymentHistory', []] }, as: 'h', cond: { $eq: ['$$h.state', 'paid'] } } },
      refundHistory: { $filter: { input: { $ifNull: ['$paymentHistory', []] }, as: 'h', cond: { $in: ['$$h.state', ['refunded', 'partial_refund']] } } } } },
    { $set: { issues: { $concatArrays: [
      when({ $and: [{ $eq: ['$l.collections', 0] }, { $or: [{ $in: ['$paymentState', ['paid', 'refunded']] }, { $gt: [{ $size: '$paidHistory' }, 0] }] }] }, 'MISSING_COLLECTION'),
      when({ $gt: ['$l.collections', 1] }, 'DUPLICATE_COLLECTION'),
      when({ $gt: [{ $size: '$paidHistory' }, 1] }, 'DUPLICATE_PAID_HISTORY'),
      when({ $and: [{ $gt: ['$l.collections', 0] }, { $or: [{ $ne: ['$l.collected', '$totalPiastres'] }, { $ne: ['$l.collectionMethod', '$paymentMethod'] },
        { $ne: [{ $size: { $filter: { input: '$paidHistory', as: 'h', cond: { $and: [{ $eq: ['$$h.eventId', '$l.collectionId'] }, { $eq: ['$$h.at', '$l.collectionAt'] }, { $eq: ['$$h.by', '$l.collectionBy'] }] } } } }, 1] },
        { $and: [{ $ne: ['$paymentMethod', 'cod'] }, { $ne: ['$l.collectionProof', '$paymentProofId'] }] }] }] }, 'COLLECTION_MISMATCH'),
      when({ $gt: ['$l.refunded', '$l.collected'] }, 'EXCESS_REFUNDS'),
      when({ $and: [{ $gt: ['$l.collections', 0] }, { $or: [{ $eq: ['$fulfillmentState', 'cancelled'] }, { $ne: ['$paymentState', { $cond: [{ $gte: ['$l.refunded', '$l.collected'] }, 'refunded', 'paid'] }] },
        { $and: [{ $eq: ['$paymentMethod', 'cod'] }, { $ne: ['$fulfillmentState', 'delivered'] }] }] }] }, 'STATE_LEDGER_CONFLICT'),
      when({ $or: [{ $gt: ['$l.unlinked', 0] }, { $ne: [{ $size: '$refundHistory' }, '$l.refunds'] },
        { $and: [{ $eq: ['$paymentState', 'refunded'] }, { $eq: ['$l.refunds', 0] }] }] }, 'UNRECONCILED_HISTORY'),
      when({ $gt: [{ $size: { $filter: { input: '$l.sources', as: 'source', cond: { $and: [{ $ne: ['$$source', null] }, { $ne: ['$$source', '$l.collectionId'] }] } } } }, 0] }, 'REFUND_SOURCE_MISMATCH'),
      when({ $gt: ['$l.adjustments', 0] }, 'ADJUSTMENT_REQUIRES_REVIEW'),
      when({ $gt: ['$l.invalid', 0] }, 'INVALID_EVENT'),
    ] } } },
    { $match: { 'issues.0': { $exists: true } } }, { $set: { orderId: '$_id' } }, facet(),
  ];
}

export function proofReconciliationPipeline() {
  return [{ $match: { state: 'approved' } },
    { $lookup: { from: 'paymentevents', let: { id: '$_id', order: '$orderId' }, pipeline: [
      { $match: { kind: 'collection', $expr: { $and: [{ $eq: ['$orderId', '$$order'] }, { $eq: ['$proofId', '$$id'] }] } } }, { $limit: 1 }, { $project: { _id: 1 } },
    ], as: 'collection' } },
    { $match: { 'collection.0': { $exists: false } } }, { $set: { issues: ['APPROVED_PROOF_WITHOUT_COLLECTION'] } }, facet()];
}
export function orphanReconciliationPipeline() {
  return [{ $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', pipeline: [{ $project: { _id: 1 } }], as: 'order' } },
    { $lookup: { from: 'paymentproofs', let: { proof: '$proofId', order: '$orderId', by: '$by', at: '$recordedAt' }, pipeline: [
      { $match: { state: 'approved', $expr: { $and: [{ $eq: ['$_id', '$$proof'] }, { $eq: ['$orderId', '$$order'] }, { $eq: ['$reviewedBy', '$$by'] }, { $eq: ['$reviewedAt', '$$at'] }] } } }, { $project: { _id: 1 } }, { $limit: 1 },
    ], as: 'verifiedProof' } },
    { $set: { issues: { $concatArrays: [when({ $eq: [{ $size: '$order' }, 0] }, 'ORPHAN_MONETARY_EVENT'),
      when({ $and: [{ $eq: ['$kind', 'collection'] }, { $ne: ['$paymentMethod', 'cod'] }, { $eq: [{ $size: '$verifiedProof' }, 0] }] }, 'COLLECTION_PROOF_CONFLICT')] } } },
    { $match: { 'issues.0': { $exists: true } } }, facet()];
}
export function refundReconciliationPipeline() {
  return [{ $match: { kind: 'refund' } },
    { $lookup: { from: 'refundcases', localField: 'refundCaseId', foreignField: '_id', as: 'case' } },
    { $set: { r: { $arrayElemAt: ['$case', 0] } } },
    { $match: { $expr: { $not: [{ $and: [
      { $eq: ['$r.state', 'recorded'] }, { $eq: ['$r.eventId', '$_id'] }, { $eq: ['$r.orderId', '$orderId'] },
      { $eq: ['$r.collectionId', '$sourceEventId'] }, { $eq: ['$r.amountPiastres', '$amountPiastres'] },
      { $eq: ['$r.externalReference', '$externalReference'] }, { $eq: ['$r.evidenceSha256', '$evidenceSha256'] },
      { $eq: ['$r.paymentMethod', '$paymentMethod'] },
      { $eq: ['$r.verifiedBy', '$by'] }, { $eq: ['$r.verifiedAt', '$recordedAt'] }, { $eq: ['$r.occurredAt', '$occurredAt'] },
      { $ne: ['$r.verifiedBy', '$r.reportedBy'] }, { $ne: ['$r.verifiedBy', '$r.requestedBy'] },
    ] }] } } }, { $set: { issues: ['UNVERIFIED_REFUND'] } }, facet()];
}
export function pendingRefundReconciliationPipeline() {
  return [{ $match: { state: 'external_completed' } },
    { $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', pipeline: [{ $project: { orderNumber: 1 } }], as: 'order' } },
    { $set: { issues: ['EXTERNAL_REFUND_AWAITING_VERIFICATION'], orderNumber: { $arrayElemAt: ['$order.orderNumber', 0] } } }, facet()];
}

export function assembleReconciliation(results) {
  const issueCounts = {}, items = [];
  for (const result of results) {
    for (const row of result?.summary || []) issueCounts[row._id] = (issueCounts[row._id] || 0) + row.count;
    for (const row of result?.items || []) if (items.length < RECONCILIATION_LIMIT) items.push({ orderId: String(row.orderId), ...(row.orderNumber ? { orderNumber: row.orderNumber } : {}), issues: row.issues });
  }
  const issueCount = Object.values(issueCounts).reduce((sum, n) => sum + n, 0);
  return { complete: issueCount === 0, issueCount, issueCounts, items, limit: RECONCILIATION_LIMIT,
    refundRecordingEnabled: false, adjustmentRecordingEnabled: false };
}
export async function loadReconciliation({ models = { Order, PaymentEvent, PaymentProof, RefundCase } } = {}) {
  const results = await Promise.all([[models.Order, orderReconciliationPipeline()], [models.PaymentProof, proofReconciliationPipeline()], [models.PaymentEvent, orphanReconciliationPipeline()], [models.PaymentEvent, refundReconciliationPipeline()], [models.RefundCase, pendingRefundReconciliationPipeline()]]
    .map(async ([model, pipeline]) => (await model.aggregate(pipeline).option({ maxTimeMS: 5000 }))[0]));
  return assembleReconciliation(results);
}
