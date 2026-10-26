// Pure, bounded notification copy. Never include payment proofs, private storage
// keys, checkout tokens or the customer's address in transactional emails.
const STATES = Object.freeze({
  received: ['Order received', 'تم استلام الطلب'], confirmed: ['Order confirmed', 'تم تأكيد الطلب'],
  packing: ['Preparing your order', 'جاري تجهيز طلبك'], shipped: ['Order shipped', 'تم شحن الطلب'],
  delivered: ['Order delivered', 'تم تسليم الطلب'], cancelled: ['Order cancelled', 'تم إلغاء الطلب'],
  unpaid: ['Payment pending', 'الدفع معلّق'], awaiting_transfer: ['Awaiting bank transfer', 'بانتظار التحويل'],
  awaiting_verification: ['Payment under review', 'جاري مراجعة الدفع'], paid: ['Payment verified', 'تم تأكيد الدفع'],
  rejected: ['Payment proof rejected', 'تم رفض إثبات الدفع'], refunded: ['Payment refunded', 'تم رد المبلغ'],
});
const KINDS = new Set(['placed', 'fulfillment', 'proof_submitted', 'payment', 'refund_recorded']);
const AUDIENCES = new Set(['customer', 'admin']);
export const isMailAddress = value => typeof value === 'string' && value.length <= 254 && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
const escapeHtml = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const formatMoney = piastres => `${(piastres / 100).toFixed(2)} EGP`;
export function orderMailContent({kind,audience,orderNumber,fulfillmentState,paymentState,totalPiastres,monetaryAmountPiastres,siteOrigin}) {
  if (!KINDS.has(kind) || !AUDIENCES.has(audience) || !/^QC-[A-F0-9]{12}$/.test(orderNumber) ||
      !STATES[fulfillmentState] || !STATES[paymentState] ||
      !Number.isSafeInteger(totalPiastres) || totalPiastres <= 0) throw new Error('Invalid order notification.');
  if (typeof siteOrigin !== 'string' || !/^https:\/\/[^/?#]+$/.test(siteOrigin)) throw new Error('Notification site origin must use HTTPS.');
  if (kind === 'refund_recorded' && (!Number.isSafeInteger(monetaryAmountPiastres) || monetaryAmountPiastres < 1 || monetaryAmountPiastres > totalPiastres)) throw new Error('Invalid verified refund amount.');
  if (kind === 'payment' && paymentState === 'paid' && monetaryAmountPiastres !== totalPiastres) throw new Error('Invalid verified collection amount.');
  let title;
  let arabic;
  if (kind === 'placed') {
    title = audience === 'admin' ? 'New customer order' : 'We received your order';
    arabic = audience === 'admin' ? 'طلب عميل جديد' : 'استلمنا طلبك';
  } else if (kind === 'fulfillment') [title,arabic] = STATES[fulfillmentState];
  else if (kind === 'proof_submitted') { title='Payment proof submitted for review'; arabic='تم إرسال إثبات الدفع للمراجعة'; }
  else if (kind === 'refund_recorded') { title='Verified refund recorded'; arabic='تم تسجيل استرداد تم التحقق منه'; }
  else [title,arabic] = STATES[paymentState];
  // A guest can track with their own phone number and order reference. Do not
  // place phone numbers or customer PII inside URLs or notifications.
  const path = audience === 'admin' ? '/admin' : '/track-order';
  const link = `${siteOrigin}${path}`;
  const details = [
    `Order: ${orderNumber}`,
    `Order status: ${STATES[fulfillmentState][0]}`,
    `Payment status: ${STATES[paymentState][0]}`,
    `Total: ${formatMoney(totalPiastres)}`,
    ...(kind === 'payment' && paymentState === 'paid' ? [`Verified collection: ${formatMoney(monetaryAmountPiastres)}`] : []),
    ...(kind === 'refund_recorded' ? [`Verified refund: ${formatMoney(monetaryAmountPiastres)}`] : []),
  ];
  const instruction = audience === 'admin'
    ? 'Review this order from the secure admin dashboard.'
    : 'You can track your order using this reference and the phone number you used at checkout. For digital payments, uploaded screenshots are reviewed manually and do not confirm receipt of funds.';
  const text = [`Quantum Coffee — ${title}`,arabic,'',...details,'',instruction,link,'','Quantum Coffee'].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;background:#100e0c;color:#e9dfd3;padding:32px;max-width:560px"><h1 style="color:#e9dfd3">Quantum Coffee</h1><h2 style="color:#c49a72">${escapeHtml(title)}</h2><p dir="rtl">${escapeHtml(arabic)}</p>${details.map(d=>`<p>${escapeHtml(d)}</p>`).join('')}<p>${escapeHtml(instruction)}</p><p><a style="background:#a47148;color:#100e0c;padding:12px 20px;display:inline-block;text-decoration:none" href="${escapeHtml(link)}">${audience==='admin'?'Open dashboard':'Track order'}</a></p><p style="color:#bfae9f;font-size:12px">Do not reply with payment screenshots or sensitive account details.</p></div>`;
  return {subject:`Quantum Coffee — ${title} (${orderNumber})`,text,html};
}
