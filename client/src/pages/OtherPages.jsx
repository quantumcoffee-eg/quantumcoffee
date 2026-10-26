import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, UserRound, ArrowLeft } from 'lucide-react';
import { useLocale } from '../lib/i18n.jsx';
import { useSession } from '../lib/session.jsx';
import { api } from '../lib/api.js';
import { publicRead } from '../lib/public-read.js';

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
export function AccountPage() {
  const { t } = useLocale(); const { user } = useSession();
  return <Page label="ACCOUNT" title={t('account')}><UserRound size={35}/><div className="account-detail"><h2>{t('accountDetails')}</h2><p>{user?.name}</p><p>{user?.email}</p></div><SignOutButton/></Page>;
}
export function AuthPage({ signup = false }) {
  const { t, url } = useLocale(); const { login, register, user } = useSession();
  const navigate = useNavigate();
  const [fields, setFields] = useState({ name: '', email: '', password: '' });
  const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const [verificationPending, setVerificationPending] = useState(false);
  if (verificationPending) return <Page label="ACCOUNT" title={t('verifyPendingTitle')}><p>{t('verifyPendingText')}</p><Link className="text-link" to={url('/resend-verification')}>{t('resendVerification')}</Link><Link className="text-link" to={url('/login')}>{t('loginAction')}</Link></Page>;
  if (user) return <Page label="ACCOUNT" title={t('account')}><p>{t('accountDetails')}: {user.email}</p><Link className="button button-dark" to={url(user.role === 'admin' ? '/admin' : '/account')}>{t('account')}</Link></Page>;
  const update = key => e => setFields(p => ({ ...p, [key]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setPending(true); setError('');
    try {
      if (signup) { await register(fields); setVerificationPending(true); }
      else { const account = await login({ email: fields.email, password: fields.password }); navigate(url(account.role === 'admin' ? '/admin' : '/account'), { replace: true }); }
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
      {!signup && <Link className="text-link" to={url('/forgot-password')}>{t('forgotPassword')}</Link>}
      <Link className="text-link" to={url(signup ? '/login' : '/signup')}>{signup ? t('loginAction') : t('signUp')}</Link>
    </form>
  </Page>;
}
function TokenAction({ purpose, title, action }) {
  const { t, url } = useLocale();
  const { hash } = useLocation();
  const token = new URLSearchParams(hash.slice(1)).get('token');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const submit = async e => {
    e.preventDefault(); setPending(true); setError('');
    try {
      await api(action, { method: 'POST', body: purpose === 'reset' ? { token, password } : { token } });
      setDone(true); setPassword('');
    } catch (err) { setError(err.message); }
    finally { setPending(false); }
  };
  return <Page label="ACCOUNT" title={title}>
    {done ? <><p role="status">{purpose === 'reset' ? t('resetSuccess') : t('verifySuccess')}</p><Link className="button button-dark" to={url('/login')}>{t('loginAction')}</Link></> :
      token && /^[a-f0-9]{64}$/.test(token) ? <form className="auth-form" onSubmit={submit}>
        {purpose === 'reset' && <label>{t('newPassword')}<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="button button-dark" disabled={pending}>{pending?t('signingIn'):purpose === 'reset' ? t('resetPassword') : t('verifyEmail')}</button>
      </form> : <p role="alert">{t('invalidEmailLink')}</p>}
  </Page>;
}
export function VerifyEmailPage() { const { t } = useLocale(); return <TokenAction purpose="verify" title={t('verifyEmail')} action="/auth/verify-email"/>; }
export function ResetPasswordPage() { const { t } = useLocale(); return <TokenAction purpose="reset" title={t('resetPassword')} action="/auth/reset-password"/>; }
export function EmailRequestPage({ verification = false }) {
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const submit = async e => {
    e.preventDefault(); setPending(true); setError('');
    try {
      await api(verification ? '/auth/resend-verification' : '/auth/forgot-password', { method: 'POST', body: { email } });
      setDone(true);
    } catch (err) { setError(err.message); }
    finally { setPending(false); }
  };
  return <Page label="ACCOUNT" title={verification?t('resendVerification'):t('forgotPassword')}>
    {done ? <p role="status">{t('emailRequestDone')}</p> : <form className="auth-form" onSubmit={submit}>
      <p>{verification?t('resendVerificationHelp'):t('forgotPasswordHelp')}</p>
      <label>{t('email')}<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="button button-dark" disabled={pending}>{pending?t('signingIn'):t('sendEmailLink')}</button>
    </form>}
  </Page>;
}
const LEGAL_ROUTES = {'shipping-policy':['shipping','shipping'],'refund-policy':['refunds','refund'],'privacy-policy':['privacy','privacy'],'terms':['terms','terms']};
export function LegalPage() {
  const {t,lang}=useLocale();const {pathname}=useLocation();
  const route=pathname.split('/').filter(Boolean).at(-1);
  const [key,titleKey]=LEGAL_ROUTES[route]||['terms','terms'];
  const [content,setContent]=useState('');
  useEffect(()=>{const ctrl=new AbortController();setContent('');
    publicRead('/store/settings',{signal:ctrl.signal}).then(r=>{if(!ctrl.signal.aborted)setContent(r.settings?.policies?.[key]?.[lang]||'')})
      .catch(()=>{});return()=>ctrl.abort();
  },[key,lang]);
  return <Page label="INFORMATION" title={t(titleKey)}><ShieldCheck size={36}/>
    <p style={{whiteSpace:'pre-wrap'}}>{content||t('legalBody')}</p></Page>;
}
export function NotFound() { const { t } = useLocale(); return <Page label="404" title={t('notFound')}><p>{t('comingSoon')}</p></Page>; }
