import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, ShieldCheck, UserRound, ArrowLeft } from 'lucide-react';
import { useLocale } from '../lib/i18n.jsx';
import { useSession } from '../lib/session.jsx';
import { api } from '../lib/api.js';

function Page({ label, title, children }) {
  const { t, url } = useLocale();
  return <main className="page-cream interior-page"><div className="interior-card"><span className="kicker">QUANTUM COFFEE / {label}</span><h1>{title}</h1>{children}<Link className="text-link" to={url('/')}><ArrowLeft size={17}/>{t('backHome')}</Link></div></main>;
}
function SignOutButton() {
  const { t, url } = useLocale();
  const { logout } = useSession();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return <div className="account-actions"><button type="button" className="button button-dark" disabled={pending} onClick={async () => {
    setPending(true); setError('');
    try { await logout(); navigate(url('/'), { replace: true }); }
    catch (e) { setError(e.message); }
    finally { setPending(false); }
  }}>{t('signOutAction')}</button>{error && <p role="alert" className="auth-error">{error}</p>}</div>;
}
export function AboutPage() { const { t } = useLocale(); return <Page label="STORY" title={t('aboutTitle')}><p>{t('aboutBody')}</p></Page>; }
export function TrackPage() { const { t } = useLocale(); return <Page label="ORDER STATUS" title={t('trackTitle')}><p>{t('trackingPending')}</p><div className="form-shell"><label>{t('orderNumber')}<input disabled placeholder="QC-000001" /></label><label>{t('phone')}<input disabled placeholder="01xxxxxxxxx" /></label><button className="button button-dark" disabled>{t('trackAction')}</button></div></Page>; }
export function OrdersPage() { const { t } = useLocale(); return <Page label="ACCOUNT" title={t('orders')}><p>{t('accountPending')}</p></Page>; }
export function AccountPage() {
  const { t } = useLocale(); const { user } = useSession();
  return <Page label="ACCOUNT" title={t('account')}><UserRound size={35}/><div className="account-detail"><h2>{t('accountDetails')}</h2><p>{user?.name}</p><p>{user?.email}</p></div><SignOutButton/></Page>;
}
export function AuthPage({ signup = false }) {
  const { t, url } = useLocale(); const { login, register, user } = useSession();
  const navigate = useNavigate();
  const [fields, setFields] = useState({ name: '', email: '', password: '' });
  const [pending, setPending] = useState(false); const [error, setError] = useState('');
  if (user) return <Page label="ACCOUNT" title={t('account')}><p>{t('accountDetails')}: {user.email}</p><Link className="button button-dark" to={url(user.role === 'admin' ? '/admin' : '/account')}>{t('account')}</Link></Page>;
  const update = key => e => setFields(p => ({ ...p, [key]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setPending(true); setError('');
    try {
      const account = signup ? await register(fields) : await login({ email: fields.email, password: fields.password });
      navigate(url(account.role === 'admin' ? '/admin' : '/account'), { replace: true });
    } catch (e) { setError(e.message); }
    finally { setPending(false); }
  };
  return <Page label="ACCOUNT" title={signup ? t('signUp') : t('logIn')}>
    <p className="quiet-text">{t('authNotice')}</p>
    <form className="auth-form" onSubmit={submit}>
      {signup && <label>{t('name')}<input name="name" autoComplete="name" required minLength={2} maxLength={80} value={fields.name} onChange={update('name')}/></label>}
      <label>{t('email')}<input name="email" type="email" autoComplete="email" required maxLength={254} value={fields.email} onChange={update('email')}/></label>
      <label>{t('password')}<input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 12 : undefined} maxLength={128} required value={fields.password} onChange={update('password')}/></label>
      {error && <p role="alert" className="auth-error">{error}</p>}
      <button className="button button-dark" disabled={pending} type="submit">{pending ? t('signingIn') : signup ? t('signUpAction') : t('loginAction')}</button>
      <Link className="text-link" to={url(signup ? '/login' : '/signup')}>{signup ? t('loginAction') : t('signUp')}</Link>
    </form>
  </Page>;
}
export function CartPage() { const { t } = useLocale(); return <Page label="CART" title={t('cartTitle')}><ShoppingBag size={36}/><p>{t('cartEmpty')}</p></Page>; }
export function LegalPage() { const { t } = useLocale(); return <Page label="INFORMATION" title={t('legalTitle')}><ShieldCheck size={36}/><p>{t('legalBody')}</p></Page>; }
export function AdminPage() {
  const { t } = useLocale(); const { user } = useSession();
  const [verified, setVerified] = useState(null); const [error, setError] = useState('');
  const check = async () => { setError(''); try { await api('/admin/check'); setVerified(true); } catch (e) { setVerified(false); setError(e.message); } };
  return <Page label="SECURE ADMIN" title={t('adminTitle')}><ShieldCheck size={36}/><p>{user?.email}</p><p>{t('adminPending')}</p><div className="account-actions"><button className="button button-dark" onClick={check} type="button">{t('retry')} admin permission check</button>{verified === true && <p role="status">Backend admin access verified.</p>}{error && <p role="alert" className="auth-error">{error}</p>}<SignOutButton/></div></Page>;
}
export function NotFound() { const { t } = useLocale(); return <Page label="404" title={t('notFound')}><p>{t('comingSoon')}</p></Page>; }
