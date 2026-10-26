// Prelaunch metadata. No source-level flag can bypass the HTML + Pages noindex locks.
// Canonical URLs require a real HTTPS origin supplied only after domain approval.
const translations = {
  en: {
    home: ['Quantum Coffee — Coffee, Reimagined', 'Explore Quantum Coffee, a coffee experience inspired by curiosity and physics.'],
    shop: ['Shop Coffee | Quantum Coffee', 'Explore the Quantum Coffee collection, available bag sizes, and grind preparations.'],
    about: ['Our Story | Quantum Coffee', 'Learn about Quantum Coffee and its coffee-and-physics inspired identity.'],
    'shipping-policy': ['Shipping Information | Quantum Coffee', 'Read Quantum Coffee shipping and delivery information.'],
    'refund-policy': ['Returns & Refunds | Quantum Coffee', 'Read Quantum Coffee returns and refunds information.'],
    'privacy-policy': ['Privacy Policy | Quantum Coffee', 'Read how Quantum Coffee handles customer information.'],
    terms: ['Terms & Conditions | Quantum Coffee', 'Read Quantum Coffee terms and conditions.'],
    product: 'Coffee | Quantum Coffee',
  },
  ar: {
    home: ['كوانتم كوفي — القهوة بشكل مختلف', 'اكتشف كوانتم كوفي، تجربة قهوة مستوحاة من الفضول وعالم الفيزياء.'],
    shop: ['تسوق القهوة | كوانتم كوفي', 'اكتشف مجموعة كوانتم كوفي وأحجام العبوات واختيارات الطحن.'],
    about: ['قصتنا | كوانتم كوفي', 'تعرّف على كوانتم كوفي وهويتها المستوحاة من القهوة والفيزياء.'],
    'shipping-policy': ['معلومات الشحن | كوانتم كوفي', 'تعرف على معلومات الشحن والتوصيل لدى كوانتم كوفي.'],
    'refund-policy': ['الاسترجاع والاسترداد | كوانتم كوفي', 'اقرأ سياسة الاسترجاع والاسترداد لدى كوانتم كوفي.'],
    'privacy-policy': ['سياسة الخصوصية | كوانتم كوفي', 'اقرأ كيفية التعامل مع معلومات العملاء لدى كوانتم كوفي.'],
    terms: ['الشروط والأحكام | كوانتم كوفي', 'اقرأ الشروط والأحكام لدى كوانتم كوفي.'],
    product: 'قهوة | كوانتم كوفي',
  },
};
const publicPages = new Set(['home','shop','about','shipping-policy','refund-policy','privacy-policy','terms']);
const safeSlug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const removeTrailingSlash = text => text.replace(/\/$/, '');
export function normalizeOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' && value === url.origin ? value : '';
  } catch { return ''; }
}
export function localizedPath(page, lang, slug = '') {
  if (page !== 'home' && !publicPages.has(page) && page !== 'product') return '';
  const segment = page === 'home' ? '' : page === 'product' ? `/products/${slug}` : `/${page}`;
  if (page === 'product' && !safeSlug(slug)) return '';
  return (lang === 'ar' ? '/ar' : '') + (segment || '/');
}
export const validDescription = value => typeof value === 'string' && value.trim().length > 0;
export function getPageSeo({ pathname = '/', product = null, siteOrigin = '' } = {}) {
  const locale = pathname === '/ar' || pathname.startsWith('/ar/') ? 'ar' : 'en';
  const raw = (locale === 'ar' ? pathname.slice(3) : pathname) || '/';
  const path = raw.length > 1 ? removeTrailingSlash(raw) : '/';
  const key = path === '/' ? 'home' : path.slice(1);
  const productSlug = /^\/products\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path)?.[1];
  const page = publicPages.has(key) ? key : productSlug && product ? 'product' : '';
  const origin = normalizeOrigin(siteOrigin);
  const titleFallback = locale === 'ar' ? 'كوانتم كوفي' : 'Quantum Coffee';
  const genericTitle = page ? translations[locale][page]?.[0] || translations[locale].product : titleFallback;
  const name = product?.name?.[locale] || product?.name?.en || '';
  const summary = product?.description?.[locale] || product?.description?.en || '';
  const productHasData = page === 'product' && product?.slug === productSlug && product?.status === 'published';
  const productDescription = validDescription(summary) ? summary.trim().slice(0, 160) : (locale === 'ar' ? 'اكتشف هذا المنتج من كوانتم كوفي.' : 'Discover this coffee from Quantum Coffee.');
  const title = productHasData && name ? `${name} | ${titleFallback}` : genericTitle;
  const description = productHasData ? productDescription : page ? translations[locale][page]?.[1] || '' : '';
  const canonicalPath = productHasData ? localizedPath('product',locale,productSlug) : publicPages.has(page) ? localizedPath(page,locale) : '';
  const canonical = origin && canonicalPath ? origin + canonicalPath : '';
  const alternates = origin && canonicalPath ? {
    en: origin + localizedPath(page,'en',productSlug),
    ar: origin + localizedPath(page,'ar',productSlug),
    default: origin + localizedPath(page,'en',productSlug),
  } : null;
  const image = productHasData ? (product.imageUrl || product.imageUrls?.[0] || '') : '';
  return {
    locale, page, title, description, canonical, alternates, image,
    ogType: productHasData ? 'product' : 'website',
    // Important: server HTML and Pages headers still enforce prelaunch noindex.
    robots: 'noindex,nofollow',
    internal: !page,
  };
}

// Prepared for launch. Never emit Offer markup until checkout is really enabled;
// no mock prices, fake reviews, or purchasable availability in prelaunch.
export function productStructuredData({ product, siteOrigin, locale = 'en', checkoutEnabled = false } = {}) {
  if (!checkoutEnabled || product?.status !== 'published') return null;
  const origin = normalizeOrigin(siteOrigin);
  const path = localizedPath('product',locale,product?.slug);
  const price = product?.pricePiastres;
  const image = product?.imageUrl || product?.imageUrls?.[0];
  const name = product?.name?.[locale] || product?.name?.en;
  if (!origin || !path || !name || !image || !/^https:\/\//.test(image) || !Number.isSafeInteger(price) || price < 1) return null;
  const result = {
    '@context': 'https://schema.org', '@type': 'Product',
    name, image: [image], url: origin + path,
    offers: { '@type': 'Offer', url: origin + path, priceCurrency: 'EGP',
      price: (price / 100).toFixed(2), availability: product.stockQuantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
  };
  const description = product?.description?.[locale] || product?.description?.en;
  if (validDescription(description)) result.description = description.trim();
  return result;
}
