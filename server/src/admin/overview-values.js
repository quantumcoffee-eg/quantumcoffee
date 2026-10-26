export const REPORTING_TIMEZONE = 'Africa/Cairo';
export const LOW_STOCK_THRESHOLD = 5;
const ranges = Object.freeze({ today: 1, '7d': 7, '30d': 30, '90d': 90 });
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORTING_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
export class OverviewInputError extends Error {
  constructor(message = 'Use range=today, 7d, 30d or 90d. No other query parameters are supported.') {
    super(message); this.status = 400; this.code = 'INVALID_OVERVIEW_QUERY';
  }
}
export function overviewRange(query = {}) {
  if (Object.keys(query).some(key => key !== 'range')) throw new OverviewInputError();
  const range = query.range === undefined ? '30d' : query.range;
  if (typeof range !== 'string' || !Object.hasOwn(ranges, range)) throw new OverviewInputError();
  return range;
}
export function cairoDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new OverviewInputError('Invalid reporting date.');
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function shiftDate(key, days) {
  const date = new Date(`${key}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
// Find the first instant in a Cairo calendar day, including days whose midnight
// is skipped/repeated by DST. A fixed UTC offset or 24h subtraction is incorrect.
export function cairoDayStart(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new OverviewInputError('Invalid calendar date.');
  const nominal = Date.parse(`${key}T00:00:00.000Z`);
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 10) !== key) throw new OverviewInputError('Invalid calendar date.');
  let low = nominal - 18 * 3600000, high = nominal + 18 * 3600000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (cairoDate(new Date(middle)) < key) low = middle + 1;
    else high = middle;
  }
  return new Date(low);
}
export function reportingPeriod(range = '30d', now = new Date()) {
  overviewRange({ range });
  const endDate = cairoDate(now);
  const startDate = shiftDate(endDate, 1 - ranges[range]);
  const dates = Array.from({ length: ranges[range] }, (_, i) => shiftDate(startDate, i));
  return { range, timezone: REPORTING_TIMEZONE, startDate, endDate, from: cairoDayStart(startDate), to: new Date(now), dates };
}

// Shared by the operational counts and the existing Orders list. These are
// current queues, independent of the dashboard's selected financial period.
export const ORDER_QUEUE_FILTERS = Object.freeze({
  payment_reviews: { paymentState: 'awaiting_verification', fulfillmentState: { $ne: 'cancelled' } },
  confirmation: { fulfillmentState: 'received' },
  packing_shipping: { fulfillmentState: { $in: ['confirmed', 'packing'] } },
  unpaid_digital: { paymentMethod: { $in: ['instapay', 'vodafone_cash'] }, paymentState: { $in: ['unpaid', 'awaiting_transfer', 'rejected'] }, fulfillmentState: { $ne: 'cancelled' } },
});
export function orderQueueFilter(value) {
  if (value === undefined || value === '') return {};
  if (typeof value !== 'string' || !Object.hasOwn(ORDER_QUEUE_FILTERS, value)) throw new OverviewInputError('Invalid order queue.');
  return structuredClone(ORDER_QUEUE_FILTERS[value]);
}
