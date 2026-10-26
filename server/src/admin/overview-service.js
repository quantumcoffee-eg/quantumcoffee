import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import PaymentProof from '../models/PaymentProof.js';
import PaymentEvent from '../models/PaymentEvent.js';
import RefundCase from '../models/RefundCase.js';
import { reportingPeriod, LOW_STOCK_THRESHOLD } from './overview-values.js';
import { operationsPipeline, inventoryPipeline, proofReviewPipeline } from './overview-pipelines.js';
import { ledgerFinancialPipeline } from '../accounting/reporting.js';
import { loadReconciliation } from '../accounting/reconciliation.js';

const MAX_TIME_MS = 5000;
const aggregate = (model, pipeline) => model.aggregate(pipeline).option({ maxTimeMS: MAX_TIME_MS });
export function assembleOverview(period, { financial = {}, reconciliation, operations = {}, inventory = {}, categories = {}, proofs = 0, recent = [] }) {
  const byDate = new Map((financial.series || []).map(row => [row._id, row]));
  const series = period.dates.map(date => ({ date, collectedPiastres: byDate.get(date)?.collectedPiastres || 0, refundPiastres: byDate.get(date)?.refundPiastres || 0, paidOrders: byDate.get(date)?.paidOrders || 0 }));
  const collectedPiastres = series.reduce((n, point) => n + point.collectedPiastres, 0);
  const paidOrders = series.reduce((n, point) => n + point.paidOrders, 0);
  const counts = inventory.counts?.[0] || {};
  const refundAmountsPiastres = series.reduce((sum, point) => sum + point.refundPiastres, 0);
  // Missing diagnostics must fail closed, including future consumers/fixtures.
  const accountingComplete = reconciliation?.complete === true;
  const result = {
    period: { range: period.range, timezone: period.timezone, startDate: period.startDate, endDate: period.endDate, from: period.from.toISOString(), to: period.to.toISOString() },
    calculatedAt: period.to.toISOString(),
    financial: { collectedPiastres, paidOrders, averageOrderValuePiastres: paidOrders ? Math.round(collectedPiastres / paidOrders) : 0,
      refundAmountsPiastres, netCollectedPiastres: accountingComplete ? collectedPiastres - refundAmountsPiastres : null, refundAccountingComplete: accountingComplete,
      missingCollectionEvents: reconciliation?.issueCounts?.MISSING_COLLECTION || 0, currentRefundedOrders: operations.currentRefundedOrders || 0,
      recordedRefundOrdersInPeriod: financial.refundedOrders?.[0]?.count || 0,
      source: 'monetary_ledger', accountingComplete, issueCount: reconciliation?.issueCount ?? null },
    metrics: { totalOrders: operations.totalOrders || 0, totalProducts: counts.totalProducts || 0, totalCategories: categories.totalCategories || 0,
      activeCategories: categories.activeCategories || 0, draftProducts: counts.draftProducts || 0, publishedProducts: counts.publishedProducts || 0,
      pendingPaymentReviews: proofs, awaitingFulfillment: operations.awaitingFulfillment || 0 },
    attention: { paymentReviews: proofs, confirmation: operations.confirmation || 0, packingShipping: operations.packingShipping || 0,
      unpaidDigital: operations.unpaidDigital || 0, lowStock: inventory.lowStockTotal?.[0]?.count || 0, draftProducts: counts.draftProducts || 0 },
    lowStock: { threshold: LOW_STOCK_THRESHOLD, total: inventory.lowStockTotal?.[0]?.count || 0, items: inventory.lowStock || [] },
    series, bestSellers: financial.bestSellers || [],
    // Explicit allowlist even when model mocks / future projections change.
    recentOrders: recent.map(row => ({ id: String(row._id), orderNumber: row.orderNumber, createdAt: row.createdAt,
      totalPiastres: row.totalPiastres, paymentState: row.paymentState, fulfillmentState: row.fulfillmentState })),
  };
  const validateNumbers = value => {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Overview contains an invalid or unsafe integer.');
    if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'number' && item < 0 && key !== 'netCollectedPiastres') throw new Error('Overview contains a negative metric.');
      validateNumbers(item);
    }
  };
  validateNumbers(result);
  return result;
}

export async function loadOverview(range, { now = new Date(), models = { Order, Product, Category, PaymentProof, PaymentEvent, RefundCase } } = {}) {
  const period = reportingPeriod(range, now);
  const [financial, operations, inventory, categories, proofs, recent, reconciliation] = await Promise.all([
    aggregate(models.PaymentEvent, ledgerFinancialPipeline(period)),
    aggregate(models.Order, operationsPipeline(period)),
    aggregate(models.Product, inventoryPipeline()),
    aggregate(models.Category, [{ $group: { _id: null, totalCategories: { $sum: 1 }, activeCategories: { $sum: { $cond: ['$active', 1, 0] } } } }]),
    aggregate(models.PaymentProof, proofReviewPipeline()),
    models.Order.find({}).sort({ createdAt: -1, _id: -1 }).limit(8)
      .select('_id orderNumber createdAt totalPiastres paymentState fulfillmentState').maxTimeMS(MAX_TIME_MS).lean(),
    loadReconciliation({ models }),
  ]);
  return assembleOverview(period, { financial: financial[0], reconciliation, operations: operations[0], inventory: inventory[0], categories: categories[0], proofs: proofs[0]?.count || 0, recent });
}
