import { REPORTING_TIMEZONE } from '../admin/overview-values.js';

export function ledgerFinancialPipeline({ from, to }) {
  return [
    { $match: { occurredAt: { $gte: from, $lt: to } } },
    // Corrupt records must become reconciliation diagnostics, never fractional
    // currency or a failed $trunc that hides the read-only report.
    { $match: { currency: 'EGP', kind: { $in: ['collection', 'refund'] }, $expr: { $and: [
      { $isNumber: '$amountPiastres' }, { $gte: ['$amountPiastres', 1] }, { $lte: ['$amountPiastres', 1000000000] },
      { $eq: ['$amountPiastres', { $cond: [{ $isNumber: '$amountPiastres' }, { $trunc: '$amountPiastres' }, null] }] },
      { $eq: ['$direction', { $cond: [{ $eq: ['$kind', 'collection'] }, 1, -1] }] },
    ] } } },
    { $facet: {
      series: [{ $group: { _id: { $dateToString: { date: '$occurredAt', format: '%Y-%m-%d', timezone: REPORTING_TIMEZONE } },
        collectedPiastres: { $sum: { $cond: [{ $eq: ['$kind', 'collection'] }, '$amountPiastres', 0] } },
        refundPiastres: { $sum: { $cond: [{ $eq: ['$kind', 'refund'] }, '$amountPiastres', 0] } },
        paidOrders: { $sum: { $cond: [{ $eq: ['$kind', 'collection'] }, 1, 0] } },
      } }, { $sort: { _id: 1 } }],
      refundedOrders: [{ $match: { kind: 'refund' } }, { $group: { _id: '$orderId' } }, { $count: 'count' }],
      bestSellers: [
        { $match: { kind: 'collection' } },
        { $lookup: { from: 'paymentevents', localField: 'orderId', foreignField: 'orderId', pipeline: [{ $match: { kind: { $ne: 'collection' } } }, { $limit: 1 }, { $project: { _id: 1 } }], as: 'adjustments' } },
        { $match: { 'adjustments.0': { $exists: false } } },
        { $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', pipeline: [{ $match: { paymentState: 'paid', fulfillmentState: { $ne: 'cancelled' } } }, { $project: { lines: 1 } }], as: 'order' } },
        { $unwind: '$order' }, { $sort: { occurredAt: 1, _id: 1 } }, { $unwind: '$order.lines' },
        { $group: { _id: '$order.lines.productId', name: { $last: '$order.lines.name' }, units: { $sum: '$order.lines.quantity' }, merchandisePiastres: { $sum: '$order.lines.lineTotalPiastres' } } },
        { $sort: { units: -1, merchandisePiastres: -1, _id: 1 } }, { $limit: 5 },
        { $project: { _id: 0, productId: { $toString: '$_id' }, name: 1, units: 1, merchandisePiastres: 1 } },
      ],
    } },
  ];
}
