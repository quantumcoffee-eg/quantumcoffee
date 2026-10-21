import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { Menu, X, UserRound, ShoppingBag, Globe, ArrowUpRight } from 'lucide-react';
import { useLocale } from '../lib/i18n.jsx';
import { useSession } from '../lib/session.jsx';
import { useCart } from '../commerce/CartProvider.jsx';

export default function Header(){
 const {t,url,lang,otherUrl}=useLocale();const {role}=useSession();const {count}=useCart();const [open,setOpen]=useState(false);const location=useLocation();
 useEffect(()=>setOpen(false),[location.pathname]);
 useEffect(()=>{document.body.style.overflow=open?'hidden':'';return()=>{document.body.style.overflow='';};},[open]);
 const links=[{to:'/',label:t('home')},{to:'/shop',label:t('shop')},{to:'/about',label:t('about')},{to:role==='customer'?'/my-orders':'/track-order',label:role==='customer'?t('orders'):t('track')}];
 const accountDestination=role==='admin'?'/admin':role==='customer'?'/account':'/login';
 return <>
  <div className="announcement" aria-label={t('announcement')}><div className="announcement-track" aria-hidden="true">{Array.from({length:2},(_,i)=><span className="announcement-message" key={i}>{t('announcement')} <span aria-hidden="true">✦</span> {t('announcement')} <span aria-hidden="true">✦</span></span>)}</div></div>
  <header className="site-header">
   <div className="header-inner">
    <button className="icon-button mobile-menu" type="button" aria-label={open?'Close menu':'Open menu'} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?<X size={23}/>:<Menu size={23}/>}</button>
    <Link className="brand-link" to={url('/')} aria-label="Quantum Coffee home"><img src="/quantum-logo-light.webp" alt="Quantum Coffee" width="337" height="310" /></Link>
    <nav className="desktop-links" aria-label="Main navigation">{links.map(item=><NavLink key={item.to} to={url(item.to)} end={item.to==='/'}>{item.label}</NavLink>)}</nav>
    <div className="header-actions">
     <Link className="icon-button" title={role==='admin'?t('admin'):role==='customer'?t('account'):t('login')} aria-label={role==='admin'?t('admin'):role==='customer'?t('account'):t('login')} to={url(accountDestination)}><UserRound size={20} strokeWidth={1.7}/></Link>
     <Link className="icon-button" to={url('/cart')} aria-label={t('cart')} title={t('cart')}><ShoppingBag size={20} strokeWidth={1.7}/>{count>0&&<span className="qc-cart-count" aria-hidden="true">{count>99?'99+':count}</span>}</Link>
     <Link className="lang-header" to={otherUrl()} aria-label={lang==='en'?'Switch to Arabic':'Switch to English'}><span>{lang==='en'?'AR':'EN'}</span></Link>
    </div>
   </div>
  </header>
  {open&&<div className="drawer-backdrop" onClick={()=>setOpen(false)} aria-hidden="true"/>}
  <aside className={`mobile-drawer ${open?'is-open':''}`} inert={!open} aria-label="Mobile navigation">
    <div className="drawer-top"><span>QUANTUM COFFEE</span><button className="icon-button" type="button" aria-label="Close menu" onClick={()=>setOpen(false)}><X size={22}/></button></div>
    <nav>{links.map((item,i)=><NavLink key={item.to} to={url(item.to)} end={item.to==='/'}><span className="drawer-number">0{i+1}</span><span>{item.label}</span><ArrowUpRight size={18}/></NavLink>)}</nav>
    <Link className="drawer-language" to={otherUrl()}><Globe size={18}/>{lang==='en'?'العربية':'English'}</Link>
    <div className="drawer-bottom">COFFEE, REIMAGINED.</div>
  </aside>
 </>;
}
