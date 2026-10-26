import { Link } from 'react-router-dom';
import { Coffee, ArrowUpRight } from 'lucide-react';
import { useLocale } from '../lib/i18n.jsx';
import './catalog-public.css';
import SafeImage from './SafeImage.jsx';
export const money = value => new Intl.NumberFormat('en-EG',{style:'currency',currency:'EGP',maximumFractionDigits:2}).format((value || 0)/100);
export const translated = (value,lang) => value?.[lang] || value?.en || '';
export function ProductCard({product}) {
  const {lang,url}=useLocale();
  return <Link className="qc-product-card" to={url(`/products/${product.slug}`)}>
    <div className="qc-product-media">
      <SafeImage src={product.imageUrl} alt={translated(product.name,lang)} width="600" height="750" loading="lazy"/>
      {product.stockQuantity===0&&<span className="qc-product-badge">{lang==='ar'?'غير متوفر':'Out of stock'}</span>}
    </div>
    <div className="qc-product-copy">
      <div><h3>{translated(product.name,lang)}</h3><span className="qc-product-arrow"><ArrowUpRight size={18}/></span></div>
      <span className="qc-product-view">{product.sizes?.length===1?`${product.sizes[0].grams} g`:(lang==='ar'?'أحجام متعددة':'Multiple sizes')} · {lang==='ar'?'تحميص متوسط':'Medium roast'}</span>
      <div className="qc-product-prices"><strong>{product.sizes?.length>1?(lang==='ar'?'يبدأ من ':'From '):''}{money(product.pricePiastres)}</strong>{product.compareAtPiastres>product.pricePiastres&&<s>{money(product.compareAtPiastres)}</s>}</div>
      <span className="qc-product-view">{lang==='ar'?'عرض التفاصيل':'Discover coffee'} →</span>
    </div>
  </Link>;
}
export function CategoryCard({category}) {
  const {lang,url}=useLocale();
  return <Link className="qc-category-card" to={url(`/shop?category=${encodeURIComponent(category.slug)}`)}>
    <div className="qc-category-media"><SafeImage src={category.imageUrl} alt={translated(category.name,lang)} width="600" height="600" iconSize={64} loading="lazy"/></div>
    <div className="qc-category-copy"><h3>{translated(category.name,lang)}</h3><ArrowUpRight size={20}/></div>
  </Link>;
}
export function CatalogUnavailable({message}) {return <div className="qc-catalog-note" role="status"><Coffee size={28} strokeWidth={1}/><p>{message}</p></div>}
