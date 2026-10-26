// Test-only API fixtures assembled by the production response formatter. Never
// inserted in Atlas or bundled in the client.
import { reportingPeriod } from '../../server/src/admin/overview-values.js';
import { assembleOverview } from '../../server/src/admin/overview-service.js';
import { defaultStoreSettings } from '../../server/src/store/settings-values.js';
export const fixtureId = '507f1f77bcf86cd799439011';
export const fixtureCategory = { _id: '507f1f77bcf86cd799439012', name: { en: 'Test category', ar: 'فئة اختبار' }, slug: 'test-category', active: true };
export const fixtureProduct = { _id: fixtureId, revision: 1, name: { en: 'Test coffee', ar: 'قهوة اختبار' }, description: { en: 'Test only', ar: '' }, slug: 'test-coffee', categoryId: fixtureCategory._id, status: 'draft', pricePiastres: 10000, stockQuantity: 0, sizes: [{ grams: 250, pricePiastres: 10000, grindOptions: [{ code: 'espresso', stockQuantity: 0 }] }], imageKeys: [], imageUrls: [] };
export const fixtureOrder = { id: fixtureId, orderNumber: 'QC-ABCDEF123456', createdAt: '2026-10-26T09:00:00Z', totalPiastres: 20000, subtotalPiastres: 18000, shippingPiastres: 2000, paymentState: 'paid', paymentMethod: 'instapay', fulfillmentState: 'confirmed', revision: 1, paymentProofId: null,
  customer: { name: 'Browser test', phone: '01000000000', email: 'test@example.invalid', governorate: 'cairo', city: 'Test', street: 'Test' }, lines: [], history: [{ status: 'received', at: '2026-10-26T09:00:00Z' }], paymentHistory: [] };
export function overviewFixture(range = '30d', populated = false) {
  return assembleOverview(reportingPeriod(range, new Date('2026-10-26T12:00:00Z')), {
    reconciliation: { complete: true, issueCount: 0, issueCounts: {} },
    inventory: { counts: [{ totalProducts: populated ? 4 : 3, draftProducts: 3, publishedProducts: populated ? 1 : 0 }], ...(populated ? { lowStockTotal: [{ count: 1 }], lowStock: [{ productId: fixtureId, name: fixtureProduct.name, sizeGrams: 250, grindCode: 'espresso', stockQuantity: 3 }] } : {}) },
    categories: { totalCategories: 1, activeCategories: 1 },
    financial: populated ? { series: [{ _id: '2026-10-26', collectedPiastres: 20000, paidOrders: 1 }], bestSellers: [{ productId: fixtureId, name: fixtureProduct.name, units: 2, merchandisePiastres: 18000 }] } : {},
    operations: populated ? { totalOrders: 1, awaitingFulfillment: 1, confirmation: 1, packingShipping: 1, unpaidDigital: 1 } : {},
    proofs: populated ? 1 : 0, recent: populated ? [{ ...fixtureOrder, _id: fixtureId }] : [],
  });
}
export function adminFixtureResponse(_request, u) {
  if (u.pathname === '/api/admin/overview/reconciliation') return { json: { reconciliation: { complete: true, issueCount: 0, issueCounts: {}, items: [], limit: 25, refundRecordingEnabled: false, adjustmentRecordingEnabled: false } } };
  if (u.pathname === '/api/admin/overview') return { json: { overview: overviewFixture(u.searchParams.get('range') || '30d', true) } };
  if (u.pathname === '/api/admin/store/settings') return { json: { settings: defaultStoreSettings(), revision: 0 } };
  if (u.pathname === '/api/admin/orders') return { json: { items: [fixtureOrder], pagination: { page: 1, pages: 1, total: 1 } } };
  if (u.pathname === `/api/admin/orders/${fixtureId}`) return { json: { order: fixtureOrder } };
  if (u.pathname === '/api/admin/catalog/categories') return { json: { categories: [fixtureCategory] } };
  if (u.pathname === '/api/admin/catalog/products') return { json: { items: [fixtureProduct], pagination: { page: 1, pages: 1, total: 1 } } };
  if (u.pathname === `/api/admin/catalog/products/${fixtureId}`) return { json: { product: fixtureProduct } };
}
