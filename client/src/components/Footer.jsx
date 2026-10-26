import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { publicRead } from '../lib/public-read.js';
import { ArrowUpRight } from 'lucide-react';
import { useLocale } from '../lib/i18n.jsx';
import { useSession } from '../lib/session.jsx';
import { handleSamePageClick } from '../lib/navigation.js';

export default function Footer() {
  const { t, url, lang, otherUrl } = useLocale();
  const { role } = useSession();
  const location = useLocation();
  const [contact, setContact] = useState(null);
  useEffect(() => { const ctrl = new AbortController(); publicRead('/store/settings', { signal: ctrl.signal }).then(r => { if (!ctrl.signal.aborted) setContact(r.settings?.contact || null); }).catch(() => {}); return () => ctrl.abort(); }, []);
  const onNavigate = (target) => event => handleSamePageClick(event, location, url(target));
  const ordersPath = role === 'customer' ? '/my-orders' : '/track-order';
  return <footer className="footer"><div className="footer-inner"><div className="footer-main">
    <div className="footer-brand"><Link className="qc-footer-logo-link" to={url('/')} onClick={onNavigate('/')} aria-label={lang === 'ar' ? 'العودة للرئيسية' : 'Quantum Coffee home'}><img src="/quantum-logo-light.webp" alt="Quantum Coffee" width="337" height="310" loading="lazy" decoding="async" /></Link><p>{t('footerLine')}</p></div>
    <div className="footer-column"><h3>{t('quickLinks')}</h3><Link to={url('/')} onClick={onNavigate('/')}>{t('home')}</Link><Link to={url('/shop')} onClick={onNavigate('/shop')}>{t('shop')}</Link><Link to={url('/about')} onClick={onNavigate('/about')}>{t('about')}</Link><Link to={url(ordersPath)} onClick={onNavigate(ordersPath)}>{role === 'customer' ? t('orders') : t('track')}</Link></div>
    <div className="footer-column"><h3>{t('help')}</h3><Link to={url('/shipping-policy')}>{t('shipping')}</Link><Link to={url('/refund-policy')}>{t('refund')}</Link><Link to={url('/privacy-policy')}>{t('privacy')}</Link><Link to={url('/terms')}>{t('terms')}</Link></div>
    <div className="footer-column"><h3>{t('language')}</h3><Link to={otherUrl()}>{lang === 'en' ? 'العربية' : 'English'} <ArrowUpRight size={14} /></Link>{contact?.whatsapp && <a href={`https://wa.me/${contact.whatsapp.slice(1)}`} rel="noopener noreferrer" target="_blank">WhatsApp</a>}{contact?.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}{contact?.instagramUrl && <a href={contact.instagramUrl} target="_blank" rel="noopener noreferrer">Instagram</a>}</div>
  </div><div className="footer-bottom"><span>© {new Date().getFullYear()} Quantum Coffee</span><span>{t('siteUnderConstruction')}</span></div></div></footer>;
}
