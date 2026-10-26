const copy = {
  title: ['Notification & storage health', 'حالة الإشعارات والتخزين'],
  disabled: ['Email sending is disabled. New notifications are not queued while disabled; historical jobs remain visible.', 'إرسال البريد معطل. لا تُنشأ إشعارات جديدة أثناء التعطيل؛ تبقى المهام السابقة ظاهرة.'],
  unconfigured: ['Email configuration is incomplete. Sending is paused.', 'إعداد البريد غير مكتمل. الإرسال متوقف.'],
  ready: ['Worker configuration is ready. This does not verify provider credentials or inbox delivery.', 'إعداد العامل جاهز. هذا لا يتحقق من بيانات مزود البريد أو وصول الرسائل.'],
  pending: ['Pending', 'بانتظار الإرسال'], dead: ['Dead / failed', 'فشل نهائي'], uncertain: ['Uncertain — review required', 'نتيجة غير مؤكدة — تلزم المراجعة'], stuck: ['Expired / invalid leases', 'حجوزات منتهية أو غير صالحة'],
  lastAcceptedAt: ['Last SMTP acceptance', 'آخر قبول من خادم البريد'], lastProcessedAt: ['Last processed attempt', 'آخر محاولة معالجة'], none: ['None recorded', 'لا يوجد سجل'],
  loading: ['Loading operational health…', 'جارٍ تحميل الحالة التشغيلية…'], error: ['Operational health is unavailable.', 'الحالة التشغيلية غير متاحة.'], refresh: ['Refresh operational health', 'تحديث الحالة التشغيلية'],
  expiredProofIntents: ['Expired proof upload intents', 'طلبات رفع إثبات منتهية'], unattachedProofCopies: ['Known unattached proof copies', 'نسخ إثبات معروفة غير مرتبطة'], uncertainProofCopies: ['Unresolved proof copy attempts', 'محاولات نسخ إثبات غير محسومة'], expiredImageIntents: ['Expired image upload intents', 'طلبات رفع صور منتهية'], unattachedImages: ['Verified images not assigned to products', 'صور متحققة غير مرتبطة بمنتجات'],
  limits: ['Database diagnostics only; storage objects have not been inventoried. These counts do not prove an object exists or should be deleted. No automatic cleanup or manual replay is enabled.', 'تشخيص قاعدة البيانات فقط؛ لم تُفحص قائمة كائنات التخزين. الأعداد لا تثبت وجود كائن أو وجوب حذفه. لا يوجد تنظيف تلقائي أو إعادة إرسال يدوية.'],
  semantics: ['SMTP acceptance is not inbox delivery. Unknown outcomes are held for provider review; the dashboard never resends a message.', 'قبول خادم البريد لا يعني الوصول لصندوق الوارد. النتائج غير المؤكدة تنتظر مراجعة المزود؛ اللوحة لا تعيد إرسال الرسائل.'],
};
export const operationsText = (lang, key) => copy[key]?.[lang === 'ar' ? 1 : 0] || key;
