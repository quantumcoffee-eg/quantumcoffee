import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Atom, Coffee, Orbit, ArrowUpRight, Sparkles } from 'lucide-react';
import { useLocale } from '../lib/i18n.jsx';
import Hero from '../components/Hero.jsx';
import { api } from '../lib/api.js';
import { publicRead } from '../lib/public-read.js';
import { uiText } from '../lib/ui-copy.js';
import {CategoryCard,ProductCard} from '../components/CatalogCards.jsx';
const categoryItems = result => { if (!Array.isArray(result.categories)) throw new Error('Invalid collection.'); return result.categories.slice(0,8); };
const featuredItems = result => { if (!Array.isArray(result.items)) throw new Error('Invalid collection.'); return result.items.slice(0,8); };
function useCollection(path, select, cached) {
 const [attempt,setAttempt]=useState(0),[state,setState]=useState({status:'loading',items:[]});
 useEffect(()=>{const controller=new AbortController();setState({status:'loading',items:[]});
  (cached?publicRead:api)(path,{signal:controller.signal,force:attempt>0}).then(result=>{const items=select(result);if(!controller.signal.aborted)setState({status:'ready',items})}).catch(()=>{if(!controller.signal.aborted)setState({status:'error',items:[]})});
  return()=>controller.abort();},[path,select,cached,attempt]);
 return {...state,retry:()=>setAttempt(n=>n+1)};
}
function CollectionNotice({state,lang}) {return <div className="qc-catalog-note" role={state.status==='error'?'alert':'status'}><p>{uiText(lang,state.status==='error'?'collectionError':'collectionLoading')}</p>{state.status==='error'&&<button type="button" className="button button-dark" onClick={state.retry}>{uiText(lang,'retry')}</button>}</div>}
export default function HomePage(){const {t,url,lang}=useLocale();
 const categoryState=useCollection('/catalog/categories',categoryItems,true),featuredState=useCollection('/catalog/products?featured=true&page=1',featuredItems,false);
 const categories=categoryState.items,featured=featuredState.items;
 return <main><Hero/>
 <section id="categories" className="section section-cream categories-section"><div className="section-container"><div className="section-title"><span className="kicker">01 — THE COLLECTION</span><h2>{t('categories')}</h2><p>{t('categoriesText')}</p></div>{categoryState.status!=='ready'?<CollectionNotice state={categoryState} lang={lang}/>:categories.length?<div className="qc-home-catalog qc-category-grid">{categories.map(c=><CategoryCard key={c.slug} category={c}/>)}</div>:<div className="category-teaser"><div className="category-icon"><Coffee size={56} strokeWidth={.8}/></div><span className="category-orbit category-orbit-a"/><span className="category-orbit category-orbit-b"/><div className="category-teaser-text"><span>QUANTUM / 001</span><h3>{t('awaitCategories')}</h3><Link className="text-link" to={url('/shop')}>{t('explore')} <ArrowUpRight size={17}/></Link></div></div>}</div></section>
 <section className="section featured-section"><div className="section-container"><div className="section-title"><span className="kicker">02 — SELECTED FOR YOU</span><h2>{t('featured')}</h2><p>{t('featuredText')}</p></div>{featuredState.status!=='ready'?<CollectionNotice state={featuredState} lang={lang}/>:featured.length?<div className="qc-home-catalog qc-product-grid">{featured.map(p=><ProductCard key={p._id} product={p}/>)}</div>:<div className="featured-empty"><div className="featured-visual"><span className="featured-ring"/><span className="featured-inner">Q</span></div><div className="featured-info"><span className="kicker">THE FIRST COLLECTION</span><h3>{t('awaitProducts')}</h3><Link className="button button-dark" to={url('/shop')}>{t('shop')} <ArrowUpRight size={17}/></Link></div></div>}</div></section>
 <section className="section why-section"><div className="section-container why-grid"><div><span className="kicker">03 — THE PHILOSOPHY</span><h2>{t('whyTitle')}</h2><p>{t('whyText')}</p><Link to={url('/about')} className="text-link light-link">{t('why')} <ArrowUpRight size={17}/></Link></div><div className="why-list">{[[<Orbit key="o"/>,t('whyOne')],[<Atom key="a"/>,t('whyTwo')],[<Coffee key="c"/>,t('whyThree')]].map(([icon,title],i)=><div className="why-item" key={i}><span className="why-num">0{i+1}</span><span className="why-icon">{icon}</span><h3>{title}</h3></div>)}</div></div></section>
 <section className="section section-cream"><div className="section-container"><div className="section-title"><span className="kicker">04 — SHARED MOMENTS</span><h2>{t('reviews')}</h2></div><div className="simple-empty"><Sparkles size={24}/><p>{t('reviewsEmpty')}</p></div></div></section>
 <section className="section faq-section"><div className="section-container faq-layout"><div className="faq-heading"><span className="kicker">05 — GOOD TO KNOW</span><h2>{t('faq')}</h2></div><div className="faq-list">{['One','Two','Three'].map((suffix,i)=><details key={i}><summary><span>0{i+1}</span>{t(`faq${suffix}`)}<span className="faq-plus">+</span></summary><p>{t(`faq${suffix}Answer`)}</p></details>)}</div></div></section>
 </main>}
