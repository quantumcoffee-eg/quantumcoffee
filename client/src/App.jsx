import { Routes, Route, Navigate } from 'react-router-dom';
import { LocaleProvider, useLocale } from './lib/i18n.jsx';
import { SessionProvider, useSession } from './lib/session.jsx';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import HomePage from './pages/HomePage.jsx';
import ShopPage from './pages/ShopPage.jsx';
import { AboutPage, TrackPage, OrdersPage, AccountPage, AuthPage, CartPage, LegalPage, AdminPage, NotFound } from './pages/OtherPages.jsx';

function Guard({ role, children }) {
  const { url, t } = useLocale();
  const session = useSession();
  if (session.status === 'loading') return <main className="page-cream interior-page"><div className="interior-card" role="status">{t('signingIn')}</div></main>;
  if (session.status === 'error') return <main className="page-cream interior-page"><div className="interior-card"><h1>{t('authError')}</h1><p role="alert">{session.error}</p><button className="button button-dark" onClick={() => session.refresh()}>{t('retry')}</button></div></main>;
  if (!session.user) return <Navigate to={url('/login')} replace />;
  if (session.user.role !== role) return <Navigate to={url(session.user.role === 'admin' ? '/admin' : '/account')} replace />;
  return children;
}
function Layout() {
  return <><Header/><Routes>
    <Route index element={<HomePage/>}/>
    <Route path="shop" element={<ShopPage/>}/>
    <Route path="about" element={<AboutPage/>}/>
    <Route path="track-order" element={<TrackPage/>}/>
    <Route path="my-orders" element={<Guard role="customer"><OrdersPage/></Guard>}/>
    <Route path="account" element={<Guard role="customer"><AccountPage/></Guard>}/>
    <Route path="login" element={<AuthPage/>}/>
    <Route path="signup" element={<AuthPage signup/>}/>
    <Route path="cart" element={<CartPage/>}/>
    <Route path="shipping-policy" element={<LegalPage/>}/>
    <Route path="refund-policy" element={<LegalPage/>}/>
    <Route path="privacy-policy" element={<LegalPage/>}/>
    <Route path="terms" element={<LegalPage/>}/>
    <Route path="admin/*" element={<Guard role="admin"><AdminPage/></Guard>}/>
    <Route path="*" element={<NotFound/>}/>
  </Routes><Footer/></>;
}
export default function App() {
  return <SessionProvider><LocaleProvider><Routes>
    <Route path="/*" element={<Layout/>}/>
    <Route path="/ar/*" element={<Layout/>}/>
  </Routes></LocaleProvider></SessionProvider>;
}
