// Code only: importing a module never mounts it or requests protected records.
export const routeModules = Object.freeze({
  shop: () => import('../pages/ShopPage.jsx'), product: () => import('../pages/ProductPage.jsx'),
  other: () => import('../pages/OtherPages.jsx'), commerce: () => import('../commerce/CartPages.jsx'),
  admin: () => import('../admin/CatalogAdmin.jsx'), overview: () => import('../admin/AdminOverview.jsx'),
  orders: () => import('../admin/AdminOrders.jsx'), settings: () => import('../admin/StoreSettingsAdmin.jsx'),
});
export function loadAdminPage(tab) {
  const panel = ['orders','settings'].includes(tab) ? tab : ['products','categories'].includes(tab) ? null : 'overview';
  return Promise.all([routeModules.admin(), panel ? routeModules[panel]() : null]).then(([shell]) => shell);
}
const primed = new Set(); // At most the eight fixed module functions above.
function prime(load) {
  if (!load || primed.has(load)) return;
  primed.add(load); void load().catch(() => primed.delete(load));
}
export function preloadAdminTab(tab, role) {
  if (role !== 'admin' || navigator.connection?.saveData) return;
  prime(routeModules[['orders','settings'].includes(tab) ? tab : tab === 'overview' ? 'overview' : 'admin']);
}
export function preloadRoute(href, role = 'guest') {
  if (navigator.connection?.saveData) return;
  let target;
  try { target = new URL(href, location.origin); } catch { return; }
  if (target.origin !== location.origin) return;
  const path = target.pathname.replace(/^\/ar(?=\/|$)/, '') || '/';
  if (/^\/admin(?:\/|$)/.test(path)) {
    if (role !== 'admin') return;
    prime(routeModules.admin); preloadAdminTab(target.searchParams.get('tab') || 'overview', role); return;
  }
  if (['/account','/my-orders'].includes(path) && role !== 'customer') return;
  const key = path === '/shop' ? 'shop' : /^\/products\/[a-z0-9-]+$/.test(path) ? 'product'
    : ['/cart','/checkout','/my-orders','/track-order'].includes(path) ? 'commerce'
    : ['/about','/login','/signup','/account','/shipping-policy','/refund-policy','/privacy-policy','/terms','/forgot-password','/reset-password','/verify-email','/resend-verification'].includes(path) ? 'other' : null;
  prime(routeModules[key]);
}
