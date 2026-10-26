const copy = {
  loading: ['Loading page…', 'جارٍ تحميل الصفحة…'], retry: ['Try again', 'حاول مجدداً'],
  failed: ['This page could not be loaded.', 'تعذر تحميل هذه الصفحة.'], refresh: ['Reload this page', 'إعادة تحميل الصفحة'],
  failedHint: ['Check your connection, then reload. Your saved cart will remain on this device.', 'تحقق من الاتصال ثم أعد التحميل. تبقى سلتك المحفوظة على هذا الجهاز.'],
  home: ['Return home', 'العودة للرئيسية'], skip: ['Skip to main content', 'انتقل إلى المحتوى الرئيسي'],
  pause: ['Pause announcement', 'إيقاف حركة الإعلان'], resume: ['Resume announcement', 'استئناف حركة الإعلان'],
  collectionLoading: ['Loading collection…', 'جارٍ تحميل المجموعة…'], collectionError: ['The collection is temporarily unavailable.', 'المجموعة غير متاحة مؤقتاً.'],
};
export const uiText = (lang, key) => copy[key]?.[lang === 'ar' ? 1 : 0] || key;
