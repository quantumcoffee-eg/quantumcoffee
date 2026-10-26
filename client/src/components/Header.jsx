import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { Menu, X, UserRound, ShoppingBag, Globe, ArrowUpRight } from 'lucide-react';
import { useLocale } from '../lib/i18n.jsx';
import { useSession } from '../lib/session.jsx';
import { useCart } from '../commerce/CartProvider.jsx';
import { handleSamePageClick } from '../lib/navigation.js';
import AnnouncementBar from './AnnouncementBar.jsx';

export default function Header() {
  const { t, url, lang, otherUrl } = useLocale();
  const { role } = useSession();
  const { count } = useCart();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const closeButtonRef = useRef(null);
  const drawerRef = useRef(null);

  // Close on every navigation, including query/hash changes and browser Back.
  useEffect(() => { setOpen(false); }, [location.key]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const onWidthChange = () => { if (!media.matches) setOpen(false); };
    media.addEventListener('change', onWidthChange);
    return () => media.removeEventListener('change', onWidthChange);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        menuButtonRef.current?.focus();
      } else if (event.key === 'Tab') {
        const focusable = Array.from(drawerRef.current?.querySelectorAll('a[href],button:not([disabled])') || []);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const navigate = (target = null) => (event) => {
    setOpen(false);
    if (open) menuButtonRef.current?.focus();
    if (target) handleSamePageClick(event, location, url(target));
  };
  const links = [
    { to: '/', label: t('home') },
    { to: '/shop', label: t('shop') },
    { to: '/about', label: t('about') },
    { to: role === 'customer' ? '/my-orders' : '/track-order', label: role === 'customer' ? t('orders') : t('track') },
  ];
  const accountDestination = role === 'admin' ? '/admin' : role === 'customer' ? '/account' : '/login';

  return <>
    <AnnouncementBar />
    <header className="site-header">
      <div className="header-inner">
        <button ref={menuButtonRef} className="icon-button mobile-menu" type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-controls="qc-mobile-navigation" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? <X size={23} /> : <Menu size={23} />}</button>
        <Link className="brand-link" to={url('/')} onClick={navigate('/')} aria-label={lang === 'ar' ? 'العودة للرئيسية' : 'Quantum Coffee home'}><img src="/quantum-logo-light.webp" alt="Quantum Coffee" width="337" height="310" /></Link>
        <nav className="desktop-links" aria-label="Main navigation">{links.map(item => <NavLink key={item.to} to={url(item.to)} onClick={navigate(item.to)} end={item.to === '/'}>{item.label}</NavLink>)}</nav>
        <div className="header-actions">
          <Link className="icon-button" title={role === 'admin' ? t('admin') : role === 'customer' ? t('account') : t('login')} aria-label={role === 'admin' ? t('admin') : role === 'customer' ? t('account') : t('login')} to={url(accountDestination)} onClick={navigate(accountDestination)}><UserRound size={20} strokeWidth={1.7} /></Link>
          <Link className="icon-button" to={url('/cart')} onClick={navigate('/cart')} aria-label={t('cart')} title={t('cart')}><ShoppingBag size={20} strokeWidth={1.7} />{count > 0 && <span className="qc-cart-count" aria-hidden="true">{count > 99 ? '99+' : count}</span>}</Link>
        </div>
      </div>
    </header>
    {open && <button type="button" className="drawer-backdrop" aria-label="Close navigation menu" onClick={() => { setOpen(false); menuButtonRef.current?.focus(); }} />}
    <aside ref={drawerRef} id="qc-mobile-navigation" role="dialog" aria-modal={open} className={`mobile-drawer ${open ? 'is-open' : ''}`} inert={!open} aria-hidden={!open} aria-label="Mobile navigation">
      <div className="drawer-top"><span>QUANTUM COFFEE</span><button ref={closeButtonRef} className="icon-button" type="button" aria-label="Close menu" onClick={() => { setOpen(false); menuButtonRef.current?.focus(); }}><X size={22} /></button></div>
      <nav aria-label="Mobile main navigation">{links.map((item, i) => <NavLink key={item.to} to={url(item.to)} onClick={navigate(item.to)} end={item.to === '/'}><span className="drawer-number">0{i + 1}</span><span>{item.label}</span><ArrowUpRight size={18} /></NavLink>)}</nav>
      <Link className="drawer-language" to={otherUrl()} onClick={navigate()}><Globe size={18} />{lang === 'en' ? 'العربية' : 'English'}</Link>
      <div className="drawer-bottom">COFFEE, REIMAGINED.</div>
    </aside>
  </>;
}
