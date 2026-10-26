import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useLayoutEffect } from 'react';
import HomePage from './pages/HomePage.jsx';
import { LocaleProvider, useLocale } from './lib/i18n.jsx';
import { SessionProvider, useSession } from './lib/session.jsx';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import { CartProvider } from './commerce/CartProvider.jsx';
import SeoRouter from './seo/SeoRouter.jsx';
import NavigationEffects from './components/NavigationEffects.jsx';
import FloatingLanguageSwitcher from './components/FloatingLanguageSwitcher.jsx';
import RouteBoundary, { RouteLoading } from './components/RouteBoundary.jsx';
import { uiText } from './lib/ui-copy.js';
import { routeModules, loadAdminPage } from './lib/route-modules.js';
import NavigationIntent from './components/NavigationIntent.jsx';

const ShopPage = lazy(routeModules.shop);
const ProductPage = lazy(routeModules.product);
// Called only after Guard authorizes rendering. Load the requested panel and
// shell together, avoiding a second cold-start waterfall or unrelated tab data.
const AdminPage = lazy(() => loadAdminPage(new URLSearchParams(window.location.search).get('tab')));
const other = name => lazy(() => routeModules.other().then(module => ({ default: module[name] })));
const AboutPage = other('AboutPage'), AccountPage = other('AccountPage'), AuthPage = other('AuthPage'), LegalPage = other('LegalPage'), NotFound = other('NotFound'), VerifyEmailPage = other('VerifyEmailPage'), ResetPasswordPage = other('ResetPasswordPage'), EmailRequestPage = other('EmailRequestPage');
const commerce = name => lazy(() => routeModules.commerce().then(module => ({ default: module[name] })));
const CartPage = commerce('CartPage'), CheckoutPage = commerce('CheckoutPage'), OrdersPage = commerce('OrdersPage'), TrackPage = commerce('TrackPage');

function Guard({ role, children }) {
  const { url, t } = useLocale();
  const session = useSession();
  if (session.status === 'loading') return <RouteLoading/>;
  if (session.status === 'error') return <main id="main-content" tabIndex={-1} className="page-cream interior-page"><div className="interior-card"><h1>{t('authError')}</h1><p role="alert">{session.error}</p><button className="button button-dark" onClick={() => session.refresh()}>{t('retry')}</button></div></main>;
  if (!session.user) return <Navigate to={url('/login')} replace />;
  if (session.user.role !== role) return <Navigate to={url(session.user.role === 'admin' ? '/admin' : '/account')} replace />;
  return children;
}
function Layout() {
  const { lang } = useLocale();
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration; window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);
  return <SeoRouter><NavigationIntent/><a className="qc-skip-link" href="#main-content">{uiText(lang, 'skip')}</a><Header/><RouteBoundary><Suspense fallback={<RouteLoading/>}><NavigationEffects/><Routes>
    <Route index element={<HomePage/>}/>
    <Route path="shop" element={<ShopPage/>}/>
    <Route path="products/:slug" element={<ProductPage/>}/>
    <Route path="about" element={<AboutPage/>}/>
    <Route path="track-order" element={<TrackPage/>}/>
    <Route path="my-orders" element={<Guard role="customer"><OrdersPage/></Guard>}/>
    <Route path="account" element={<Guard role="customer"><AccountPage/></Guard>}/>
    <Route path="login" element={<AuthPage/>}/>
    <Route path="signup" element={<AuthPage signup/>}/>
    <Route path="verify-email" element={<VerifyEmailPage/>}/>
    <Route path="reset-password" element={<ResetPasswordPage/>}/>
    <Route path="forgot-password" element={<EmailRequestPage/>}/>
    <Route path="resend-verification" element={<EmailRequestPage verification/>}/>
    <Route path="cart" element={<CartPage/>}/>
    <Route path="checkout" element={<CheckoutPage/>}/>
    <Route path="shipping-policy" element={<LegalPage/>}/>
    <Route path="refund-policy" element={<LegalPage/>}/>
    <Route path="privacy-policy" element={<LegalPage/>}/>
    <Route path="terms" element={<LegalPage/>}/>
    <Route path="admin/*" element={<Guard role="admin"><AdminPage/></Guard>}/>
    <Route path="*" element={<NotFound/>}/>
  </Routes></Suspense></RouteBoundary><Footer/><FloatingLanguageSwitcher/></SeoRouter>;
}
export default function App() {
  return <SessionProvider><CartProvider><LocaleProvider><Routes>
    <Route path="/*" element={<Layout/>}/>
    <Route path="/ar/*" element={<Layout/>}/>
  </Routes></LocaleProvider></CartProvider></SessionProvider>;
}
