import { LOW_STOCK_THRESHOLD, ORDER_QUEUE_FILTERS } from './overview-values.js';

const countWhen = condition => ({ $sum: { $cond: [condition, 1, 0] } });
export function operationsPipeline(period) {
  return [{ $group: { _id: null,
    totalOrders: countWhen({ $and: [{ $gte: ['$createdAt', period.from] }, { $lt: ['$createdAt', period.to] }] }),
    currentRefundedOrders: countWhen({ $eq: ['$paymentState', 'refunded'] }),
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
