import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Coffee } from 'lucide-react';
import { useLocale } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { money,translated } from '../components/CatalogCards.jsx';

export default function ProductPage() {
  const {slug}=useParams(),{lang,url,t}=useLocale();
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[selected,setSelected]=useState(0);
  useEffect(()=>{const ctrl=new AbortController();setBusy(true);setError('');setData(null);setSelected(0);
    api(`/catalog/products/${encodeURIComponent(slug)}`,{signal:ctrl.signal}).then(result=>setData(result.product)).catch(e=>{if(!ctrl.signal.aborted)setError(e.message)}).finally(()=>{if(!ctrl.signal.aborted)setBusy(false)});
    return()=>ctrl.abort();},[slug]);
  return <main className="qc-product-page">
    <nav className="qc-breadcrumb"><Link to={url('/')}>{t('home')}</Link> / <Link to={url('/shop')}>{t('shop')}</Link> / {data?translated(data.name,lang):'...'}</nav>
    {busy&&<div className="qc-catalog-note" role="status">{t('signingIn')}</div>}
    {!busy&&error&&<div className="qc-catalog-note" role="alert">{error} <Link to={url('/shop')}>{t('shop')}</Link></div>}
    {!busy&&data&&<div className="qc-product-detail">
      <div className="qc-product-gallery"><div className="qc-product-primary">{data.imageUrls?.[selected]?<img src={data.imageUrls[selected]} alt={translated(data.name,lang)} />:<Coffee size={72}/>}</div>
        {data.imageUrls?.length>1&&<div className="qc-product-thumbs">{data.imageUrls.map((src,i)=><button type="button" key={src} aria-label={`${lang==='ar'?'صورة':'Image'} ${i+1}`} aria-pressed={i===selected} onClick={()=>setSelected(i)}><img src={src} alt="" loading="lazy"/></button>)}</div>}
      </div>
      <div className="qc-product-summary"><span className="kicker">QUANTUM COFFEE / COLLECTION</span><h1>{translated(data.name,lang)}</h1>
        <div className="qc-product-prices"><strong>{money(data.pricePiastres)}</strong>{data.compareAtPiastres>data.pricePiastres&&<s>{money(data.compareAtPiastres)}</s>}</div>
        <span className="qc-availability">{data.stockQuantity>0?(lang==='ar'?'متوفر':'In stock'):(lang==='ar'?'غير متوفر':'Out of stock')}</span>
        <p>{translated(data.description,lang)}</p>
        <div className="qc-coming-soon">{lang==='ar'?'الشراء غير متاح حتى اكتمال نظام الطلب والدفع.':'Online checkout is not available until order processing and payments are complete.'}</div>
        <Link className="button button-dark" to={url('/shop')}>{t('shop')}</Link>
      </div>
    </div>}
  </main>;
}
