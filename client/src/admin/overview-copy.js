const labels = {
  recordedRefunds: ['Recorded refunds', 'الاستردادات المسجلة'], netCollections: ['Net collections', 'صافي التحصيل'], refundedOrders: ['Orders with recorded refunds in this period', 'طلبات باستردادات مسجلة خلال الفترة'],
  unavailable: ['Unavailable', 'غير متاح'],
  incompleteAccounting: ['Accounting is incomplete. Gross collections and refunds show known ledger events only; net collections are unavailable. Open reconciliation to review discrepancies. Legacy history has not been backfilled.', 'المحاسبة غير مكتملة. التحصيل والاستردادات يعرضان أحداث السجل المعروفة فقط؛ صافي التحصيل غير متاح. افتح المطابقة لمراجعة الاختلافات. لم تتم إضافة سجلات تاريخية تلقائياً.'],
  ledgerDefinitions: ['Ledger amounts include delivery and are not profit. Collections use administrator verification time; refunds use verified external completion time. Refunds may relate to earlier collections, so period net can be negative.', 'مبالغ السجل تشمل الشحن ولا تمثل الربح. التحصيل حسب وقت تحقق المسؤول، والاسترداد حسب وقت الإتمام الخارجي المتحقق منه. قد تخص الاستردادات تحصيلات سابقة، لذا قد يكون صافي الفترة سالباً.'],
  missingLedger: ['orders with payment history/state have no monetary collection event and are excluded. Manual reconciliation is required.', 'طلبات لها حالة أو سجل دفع دون حدث تحصيل مالي ومستبعدة. تلزم مطابقة يدوية.'],
  reconciliation: ['Accounting reconciliation', 'مطابقة الحسابات'],
  reconciliationHint: ['Read-only, all-date checks. Review order records and external evidence; this report never repairs records or issues refunds.', 'فحص للقراءة فقط لكل التواريخ. راجع الطلبات والأدلة الخارجية؛ التقرير لا يعدل السجلات أو ينفذ استردادات.'],
  loadingAccounting: ['Checking accounting records…', 'جارٍ فحص سجلات المحاسبة…'], accountingError: ['Reconciliation could not be loaded.', 'تعذر تحميل المطابقة.'],
  reconciled: ['No discrepancies detected in the recorded data. This is not bank reconciliation.', 'لم يتم اكتشاف اختلافات في البيانات المسجلة. هذا ليس كشف مطابقة بنك.'],
  accountingIssues: ['accounting discrepancies detected.', 'اختلافات محاسبية مكتشفة.'], reportLimit: ['Report displays up to', 'يعرض التقرير حتى'],
  refreshAccounting: ['Refresh reconciliation', 'تحديث المطابقة'], refundsLocked: ['Refund and correction actions remain disabled pending owner approval of external evidence and authorization procedures.', 'تظل إجراءات الاسترداد والتصحيح معطلة لحين اعتماد المالك لإجراءات الأدلة الخارجية والتفويض.'],
  MISSING_COLLECTION: ['Paid/history record has no monetary collection event.', 'سجل دفع بلا حدث تحصيل مالي.'], DUPLICATE_COLLECTION: ['Multiple initial collection records.', 'سجلات تحصيل أولي مكررة.'],
  DUPLICATE_PAID_HISTORY: ['Repeated paid history entries need review.', 'سجل دفع مكرر يحتاج مراجعة.'], COLLECTION_MISMATCH: ['Collection amount, method or audit reference does not match the order.', 'مبلغ التحصيل أو الوسيلة أو المرجع لا يطابق الطلب.'],
  EXCESS_REFUNDS: ['Refunds exceed known collections.', 'الاستردادات تتجاوز التحصيل المعروف.'], STATE_LEDGER_CONFLICT: ['Order state conflicts with monetary records.', 'حالة الطلب تتعارض مع السجل المالي.'],
  UNRECONCILED_HISTORY: ['Monetary events and audit history do not match.', 'الأحداث المالية وسجل التدقيق غير متطابقين.'], REFUND_SOURCE_MISMATCH: ['Refund references a different collection.', 'الاسترداد يشير إلى تحصيل مختلف.'],
  ADJUSTMENT_REQUIRES_REVIEW: ['A reversal/correction requires an approved accounting review.', 'عكس أو تصحيح يحتاج مراجعة محاسبية معتمدة.'], INVALID_EVENT: ['Invalid monetary event.', 'حدث مالي غير صالح.'],
  APPROVED_PROOF_WITHOUT_COLLECTION: ['Approved proof has no matching collection.', 'إثبات معتمد بلا تحصيل مطابق.'], ORPHAN_MONETARY_EVENT: ['Monetary event has no order.', 'حدث مالي بلا طلب.'],
  UNVERIFIED_REFUND: ['Refund event has no matching independently verified external completion.', 'حدث استرداد بلا إتمام خارجي مطابق تم التحقق منه بشكل مستقل.'],
  COLLECTION_PROOF_CONFLICT: ['Digital collection does not match an approved proof review.', 'التحصيل الرقمي لا يطابق مراجعة إثبات معتمدة.'], EXTERNAL_REFUND_AWAITING_VERIFICATION: ['External refund completion has been reported but is not independently verified.', 'تم الإبلاغ عن إتمام استرداد خارجي ولم يتم التحقق منه بشكل مستقل.'],
  overview: ['Overview', 'نظرة عامة'], subtitle: ['Your store, at a glance.', 'متجرك في لمحة.'],
  today: ['Today', 'اليوم'], '7d': ['Last 7 days', 'آخر ٧ أيام'], '30d': ['Last 30 days', 'آخر ٣٠ يوماً'], '90d': ['Last 90 days', 'آخر ٩٠ يوماً'],
  period: ['Reporting period', 'فترة التقرير'], refresh: ['Refresh overview', 'تحديث النظرة العامة'], updated: ['Updated', 'آخر تحديث'],
  revenue: ['Gross collected revenue', 'الإيراد المحصّل'], gross: ['Gross collection · includes delivery · before refunds', 'إجمالي التحصيل · يشمل الشحن · قبل الاستردادات'],
  orders: ['Total Orders', 'إجمالي الطلبات'], placed: ['Placed in the selected period', 'الطلبات المنشأة خلال الفترة المحددة'],
  products: ['Total Products', 'إجمالي المنتجات'], categories: ['Total Categories', 'إجمالي الفئات'], current: ['Current catalog · all statuses', 'الكتالوج الحالي · كل الحالات'],
  activeCategories: ['visible categories', 'فئات ظاهرة'], average: ['Average collected order value', 'متوسط قيمة الطلب المحصّل'], averageHint: ['Gross collection ÷ first-paid orders; rounded to the nearest piastre.', 'إجمالي التحصيل ÷ الطلبات المحصّلة لأول مرة؛ مقرب لأقرب قرش.'],
  paid: ['First-paid orders', 'طلبات محصّلة لأول مرة'], reviews: ['Pending Payment Reviews', 'مدفوعات بانتظار المراجعة'], fulfillment: ['Awaiting Fulfillment', 'بانتظار التجهيز'],
  drafts: ['Draft Products', 'منتجات مسودة'], published: ['Published Products', 'منتجات منشورة'], low: ['Low-Stock Variants', 'خيارات منخفضة المخزون'],
  chart: ['Collection over time', 'التحصيل عبر الوقت'], cairo: ['Africa/Cairo · current day is partial', 'توقيت القاهرة · اليوم الحالي غير مكتمل'],
  noRevenue: ['No collected payments in this period', 'لا توجد مدفوعات محصّلة في هذه الفترة'], noRevenueHint: ['Recorded collections will appear here automatically.', 'ستظهر التحصيلات المسجلة هنا تلقائياً.'],
  daily: ['View daily values', 'عرض القيم اليومية'], date: ['Date', 'التاريخ'], amount: ['Amount', 'المبلغ'],
  attention: ['Requires Attention', 'يحتاج إلى متابعة'], now: ['Current queues · all dates', 'قوائم المتابعة الحالية · كل الفترات'],
  confirmation: ['Awaiting confirmation', 'بانتظار التأكيد'], packingShipping: ['Packing or shipping', 'التجهيز أو الشحن'], unpaidDigital: ['Unpaid digital orders', 'طلبات تحويل غير مدفوعة'],
  paymentReviews: ['Payment proofs to review', 'إثباتات دفع للمراجعة'], draftProducts: ['Drafts awaiting publication', 'مسودات بانتظار النشر'], lowStock: ['Low-stock combinations', 'خيارات تحتاج إعادة تزويد'],
  recent: ['Recent Orders', 'أحدث الطلبات'], recentHint: ['Latest 8 orders · all dates', 'آخر ٨ طلبات · كل الفترات'], allOrders: ['View all orders', 'عرض كل الطلبات'],
  order: ['Order', 'الطلب'], payment: ['Payment', 'الدفع'], fulfillmentStatus: ['Fulfillment', 'التجهيز'], details: ['View order', 'عرض الطلب'],
  noOrders: ['No orders yet', 'لا توجد طلبات بعد'], noOrdersHint: ['New orders will appear here when ordering opens.', 'ستظهر الطلبات الجديدة هنا عند إتاحة الطلب.'],
  best: ['Best Sellers', 'الأكثر مبيعاً'], bestHint: ['Paid in this period · excludes refunded or cancelled sales', 'محصّلة خلال الفترة · باستثناء المبيعات المستردة أو الملغاة'],
  noSales: ['No eligible paid sales yet', 'لا توجد مبيعات مدفوعة مؤهلة بعد'], units: ['units', 'وحدات'], merchandise: ['Merchandise value, excluding delivery', 'قيمة المنتجات بدون الشحن'],
  inventory: ['Inventory watch', 'متابعة المخزون'], threshold: ['Published products only · alert at 5 units or fewer per size and grind', 'منتجات منشورة فقط · تنبيه عند ٥ وحدات أو أقل لكل حجم وطحن'],
  noLow: ['No published variants need restocking', 'لا توجد خيارات منشورة تحتاج إعادة تزويد'], draftHint: ['Draft inventory is excluded from these alerts.', 'مخزون المسودات مستبعد من هذه التنبيهات.'], stock: ['remaining', 'متبقية'], manage: ['Open product', 'فتح المنتج'],
  loading: ['Loading overview…', 'جار تحميل النظرة العامة…'], error: ['Overview could not be loaded.', 'تعذر تحميل النظرة العامة.'], retry: ['Try again', 'إعادة المحاولة'],
  access: ['An administrator session is required to view these figures.', 'يلزم تسجيل الدخول كمسؤول لعرض هذه البيانات.'],
  paidState: ['Paid', 'مدفوع'], unpaid: ['Unpaid', 'غير مدفوع'], awaiting_transfer: ['Awaiting transfer', 'بانتظار التحويل'], awaiting_verification: ['Awaiting review', 'بانتظار المراجعة'], rejected: ['Rejected', 'مرفوض'], refunded: ['Refunded', 'مسترد'],
  received: ['Received', 'مستلم'], confirmed: ['Confirmed', 'مؤكد'], packing: ['Packing', 'قيد التجهيز'], shipped: ['Shipped', 'تم الشحن'], delivered: ['Delivered', 'تم التسليم'], cancelled: ['Cancelled', 'ملغى'],
};
export const overviewText = (lang, key) => labels[key]?.[lang === 'ar' ? 1 : 0] || key;
const currencies = {}, dates = {};
export const overviewMoney = (value, lang) => {
  const locale = lang === 'ar' ? 'ar-EG' : 'en-EG';
  return (currencies[locale] ||= new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' })).format(value / 100);
};
export const overviewDate = (value, lang, time = false) => {
  const locale = lang === 'ar' ? 'ar-EG' : 'en-GB', key = `${locale}:${Boolean(time)}`;
  return (dates[key] ||= new Intl.DateTimeFormat(locale, {
  timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
})).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
};
