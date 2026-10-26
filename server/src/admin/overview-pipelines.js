import { LOW_STOCK_THRESHOLD, REPORTING_TIMEZONE, ORDER_QUEUE_FILTERS } from './overview-values.js';

const inPeriod = (field, { from, to }) => ({ [field]: { $gte: from, $lt: to } });
// Reduce across ALL history before the period match. A repeated approval in a
// later period must never count the order again. Invalid/missing dates fail closed.
const firstEvent = state => ({ $reduce: {
  input: { $ifNull: ['$paymentHistory', []] }, initialValue: null,
  in: { $cond: [
    { $and: [{ $eq: ['$$this.state', state] }, { $eq: [{ $type: '$$this.at' }, 'date'] },
      { $or: [{ $eq: ['$$value', null] }, { $lt: ['$$this.at', '$$value'] }] }] },
    '$$this.at', '$$value',
  ] },
} });

export function financialPipeline(period) {
  return [
    { $match: { $or: [{ 'paymentHistory.state': 'paid' }, { paymentState: { $in: ['paid', 'refunded'] } }, { 'paymentHistory.state': 'refunded' }] } },
    { $project: { totalPiastres: 1, paymentState: 1, fulfillmentState: 1, lines: 1,
      collectedAt: firstEvent('paid'), refundedAt: firstEvent('refunded') } },
    { $facet: {
      series: [
        { $match: inPeriod('collectedAt', period) },
        { $group: { _id: { $dateToString: { date: '$collectedAt', format: '%Y-%m-%d', timezone: REPORTING_TIMEZONE } }, collectedPiastres: { $sum: '$totalPiastres' }, paidOrders: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ],
      bestSellers: [
        { $match: { ...inPeriod('collectedAt', period), paymentState: 'paid', fulfillmentState: { $ne: 'cancelled' }, refundedAt: null } },
        { $sort: { collectedAt: 1, _id: 1 } },
        { $unwind: '$lines' },
        { $group: { _id: '$lines.productId', name: { $last: '$lines.name' }, units: { $sum: '$lines.quantity' }, merchandisePiastres: { $sum: '$lines.lineTotalPiastres' } } },
        { $sort: { units: -1, merchandisePiastres: -1, _id: 1 } }, { $limit: 5 },
        { $project: { _id: 0, productId: { $toString: '$_id' }, name: 1, units: 1, merchandisePiastres: 1 } },
      ],
      diagnostics: [{ $group: { _id: null,
        missingCollectionEvents: { $sum: { $cond: [{ $and: [{ $in: ['$paymentState', ['paid', 'refunded']] }, { $eq: ['$collectedAt', null] }] }, 1, 0] } },
        currentRefundedOrders: { $sum: { $cond: [{ $eq: ['$paymentState', 'refunded'] }, 1, 0] } },
        recordedRefundOrdersInPeriod: { $sum: { $cond: [{ $and: [{ $ne: ['$refundedAt', null] }, { $gte: ['$refundedAt', period.from] }, { $lt: ['$refundedAt', period.to] }] }, 1, 0] } },
      } }],
    } },
  ];
}

const countWhen = condition => ({ $sum: { $cond: [condition, 1, 0] } });
export function operationsPipeline(period) {
  return [{ $group: { _id: null,
    totalOrders: countWhen({ $and: [{ $gte: ['$createdAt', period.from] }, { $lt: ['$createdAt', period.to] }] }),
    awaitingFulfillment: countWhen({ $in: ['$fulfillmentState', ['received', 'confirmed', 'packing']] }),
    confirmation: countWhen({ $eq: ['$fulfillmentState', 'received'] }),
    packingShipping: countWhen({ $in: ['$fulfillmentState', ['confirmed', 'packing']] }),
    unpaidDigital: countWhen({ $and: [{ $in: ['$paymentMethod', ['instapay', 'vodafone_cash']] }, { $in: ['$paymentState', ['unpaid', 'awaiting_transfer', 'rejected']] }, { $ne: ['$fulfillmentState', 'cancelled'] }] }),
  } }];
}

export function inventoryPipeline() {
  const low = [
    { $match: { status: 'published' } },
    { $set: { currentSizes: { $cond: [{ $gt: [{ $size: { $ifNull: ['$sizes', []] } }, 0] }, '$sizes',
      [{ grams: { $ifNull: ['$packGrams', 250] }, grindOptions: { $ifNull: ['$grindOptions', []] } }]] } } },
    { $unwind: '$currentSizes' }, { $unwind: '$currentSizes.grindOptions' },
    { $match: { 'currentSizes.grindOptions.stockQuantity': { $gte: 0, $lte: LOW_STOCK_THRESHOLD } } },
  ];
  return [{ $facet: {
    counts: [{ $group: { _id: null, totalProducts: { $sum: 1 }, draftProducts: countWhen({ $eq: ['$status', 'draft'] }), publishedProducts: countWhen({ $eq: ['$status', 'published'] }) } }],
    lowStockTotal: [...low, { $count: 'count' }],
    lowStock: [...low, { $sort: { 'currentSizes.grindOptions.stockQuantity': 1, _id: 1, 'currentSizes.grams': 1, 'currentSizes.grindOptions.code': 1 } }, { $limit: 8 },
      { $project: { _id: 0, productId: { $toString: '$_id' }, name: 1, sizeGrams: '$currentSizes.grams', grindCode: '$currentSizes.grindOptions.code', stockQuantity: '$currentSizes.grindOptions.stockQuantity' } }],
  } }];
}

export function proofReviewPipeline() {
  return [{ $match: { state: 'submitted' } },
    { $lookup: { from: 'orders', let: { orderId: '$orderId', proofId: '$_id' }, pipeline: [
      { $match: { ...ORDER_QUEUE_FILTERS.payment_reviews, $expr: { $and: [{ $eq: ['$_id', '$$orderId'] }, { $eq: ['$paymentProofId', '$$proofId'] }] } } },
      { $project: { _id: 1 } }, { $limit: 1 },
    ], as: 'currentOrder' } },
    { $match: { 'currentOrder.0': { $exists: true } } }, { $count: 'count' }];
}
