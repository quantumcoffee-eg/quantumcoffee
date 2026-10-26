import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Coffee } from 'lucide-react';
import { useLocale } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { useCart } from '../commerce/CartProvider.jsx';
import { money,translated } from '../components/CatalogCards.jsx';
import { preparationName } from '../lib/grinds.js';
import { useSetProductSeo } from '../seo/SeoRouter.jsx';
import { initialSelection, selectedStock } from './product-selection.mjs';

export default function ProductPage() {
  const {slug}=useParams(),{lang,url,t}=useLocale();const setSeoProduct=useSetProductSeo();const {add}=useCart();const [quantity,setQuantity]=useState(1),[sizeGrams,setSizeGrams]=useState(0),[grindCode,setGrindCode]=useState(''),[added,setAdded]=useState(false);
  const [data,setData]=useState(null),[error,setError]=useState(''),[cartError,setCartError]=useState(''),[busy,setBusy]=useState(true),[selected,setSelected]=useState(0);
  useEffect(()=>{const ctrl=new AbortController();setBusy(true);setError('');setData(null);setSelected(0);setAdded(false);setCartError('');
    api(`/catalog/products/${encodeURIComponent(slug)}`,{signal:ctrl.signal}).then(result=>{setData(result.product);const initial=initialSelection(result.product);setSizeGrams(initial.sizeGrams);setGrindCode(initial.grindCode);setQuantity(1)}).catch(e=>{if(!ctrl.signal.aborted)setError(e.message)}).finally(()=>{if(!ctrl.signal.aborted)setBusy(false)});
    return()=>ctrl.abort();},[slug]);
  useEffect(()=>{setSeoProduct(data?.slug===slug?data:null);return()=>setSeoProduct(null)},[data,slug,setSeoProduct]);
  const size=data?.sizes?.find(s=>s.grams===sizeGrams);
  const optionStock=selectedStock(data,sizeGrams,grindCode);
  return <main className="qc-product-page">
    <nav className="qc-breadcrumb"><Link to={url('/')}>{t('home')}</Link> / <Link to={url('/shop')}>{t('shop')}</Link> / {data?translated(data.name,lang):'...'}</nav>
    {busy&&<div className="qc-catalog-note" role="status">{t('signingIn')}</div>}
    {!busy&&error&&<div className="qc-catalog-note" role="alert">{error} <Link to={url('/shop')}>{t('shop')}</Link></div>}
    {!busy&&data&&<div className="qc-product-detail">
      <div className="qc-product-gallery"><div className="qc-product-primary">{data.imageUrls?.[selected]?<img src={data.imageUrls[selected]} alt={translated(data.name,lang)} />:<Coffee size={72}/>}</div>
        {data.imageUrls?.length>1&&<div className="qc-product-thumbs">{data.imageUrls.map((src,i)=><button type="button" key={src} aria-label={`${lang==='ar'?'صورة':'Image'} ${i+1}`} aria-pressed={i===selected} onClick={()=>setSelected(i)}><img src={src} alt="" loading="lazy"/></button>)}</div>}
      </div>
      <div className="qc-product-summary"><span className="kicker">QUANTUM COFFEE / COLLECTION</span><h1>{translated(data.name,lang)}</h1>
        <div className="qc-product-prices"><strong>{money(size?.pricePiastres||data.pricePiastres)}</strong>{size?.compareAtPiastres>size?.pricePiastres&&<s>{money(size.compareAtPiastres)}</s>}</div>
        <span className="qc-availability">{optionStock>0?(lang==='ar'?'متوفر':'In stock'):(lang==='ar'?'غير متوفر':'Out of stock')}</span>
        <p className="qc-pack-label">{lang==='ar'?'تحميص متوسط':'Medium roast'}</p>
        <label className="qc-grind-choice">{lang==='ar'?'حجم العبوة':'Bag size'}
          <select value={sizeGrams} onChange={e=>{const grams=Number(e.target.value);const next=data.sizes.find(s=>s.grams===grams);setSizeGrams(grams);setGrindCode(next?.grindOptions?.find(g=>g.stockQuantity>0)?.code||next?.grindOptions?.[0]?.code||'');setQuantity(1);setAdded(false);setCartError('')}}>
            {(data.sizes||[]).map(s=><option key={s.grams} value={s.grams}>{s.grams>=1000?`${s.grams/1000} kg`:`${s.grams} g`} — {money(s.pricePiastres)}</option>)}
          </select>
        </label>
        <label className="qc-grind-choice">{lang==='ar'?'اختار طريقة الطحن / التحضير':'Choose grind / preparation'}
          <select value={grindCode} onChange={e=>{setGrindCode(e.target.value);setQuantity(1);setAdded(false);setCartError('')}}>
            {(size?.grindOptions||[]).map(g=><option key={g.code} value={g.code} disabled={g.stockQuantity===0}>{preparationName(g.code,lang)}{g.stockQuantity===0?(lang==='ar'?' — غير متوفر':' — Out of stock'):''}</option>)}
          </select>
        </label>
        <p>{translated(data.description,lang)}</p>
        <div className="qc-add-to-cart"><label>{lang==='ar'?'الكمية':'Quantity'}<input type="number" min="1" max={Math.min(20,optionStock)} value={quantity} onChange={e=>{setQuantity(Math.max(1,Math.min(20,optionStock,Math.trunc(Number(e.target.value))||1)));setAdded(false);setCartError('')}} disabled={!optionStock}/></label><button type="button" className="button button-dark" disabled={!optionStock} onClick={()=>{const ok=add(data._id,sizeGrams,grindCode,quantity);setAdded(ok);setCartError(ok?'':lang==='ar'?'تعذر الإضافة. تأكد من الكمية والسلة.':'Could not add this quantity. Check your cart limit.')}}>{lang==='ar'?'أضف للسلة':'Add to Cart'}</button></div>
        {cartError&&<p role="alert">{cartError}</p>}
        {added&&<p role="status">{lang==='ar'?'تمت الإضافة للسلة':'Added to cart'} — <Link to={url('/cart')}>{t('cart')}</Link></p>}
        <p className="qc-coming-soon">{lang==='ar'?'الشراء سيبدأ بعد تأكيد إعدادات الشحن والدفع.':'Ordering opens after shipping and payment setup is complete.'}</p>
      </div>
    </div>}
  </main>;
}
