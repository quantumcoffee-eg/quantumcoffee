import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLocale } from '../lib/i18n.jsx';
import { useSession } from '../lib/session.jsx';
import './catalog-admin.css';
import MediaEditor from './MediaEditor.jsx';
import AdminOrders from './AdminOrders.jsx';
import StoreSettingsAdmin from './StoreSettingsAdmin.jsx';
import { PREPARATIONS } from '../lib/grinds.js';

const blankCategory = () => ({ name:{en:'',ar:''}, slug:'', description:{en:'',ar:''},sortOrder:0,active:false });
const blankSize = (grams='250') => ({grams,price:'',compareAt:'',grindOptions:[]});
const blankProduct = () => ({ name:{en:'',ar:''}, slug:'', description:{en:'',ar:''},categoryId:'',sizes:[blankSize()],featured:false,status:'draft' });
const slugify = value => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,96);
const displayMoney = value => typeof value === 'number' ? new Intl.NumberFormat('en-EG',{style:'currency',currency:'EGP'}).format(value/100) : '—';
const fromPiastres = value => value == null ? '' : (value/100).toFixed(2);
const toPiastres = (value, required) => {
  if (!value && !required) return null;
  if (!/^(0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter a valid price in EGP with up to two decimal places.');
  const [p,k=''] = value.split('.');
  const n=Number(p)*100+Number(k.padEnd(2,'0'));
  if (!Number.isSafeInteger(n)||n<=0) throw new Error('Selling and compare-at prices must be positive.');
  return n;
};
const bilingualField = (value, onChange, prop, label, long = false) => <div className="qc-admin-two" key={prop}>
  {['en','ar'].map(lang=><label key={lang}>{label} ({lang.toUpperCase()}){long ? <textarea rows={3} dir={lang==='ar'?'rtl':'ltr'} value={value[prop]?.[lang]||''} onChange={e=>onChange({...value,[prop]:{...value[prop],[lang]:e.target.value}})}/> : <input dir={lang==='ar'?'rtl':'ltr'} value={value[prop]?.[lang]||''} onChange={e=>onChange({...value,[prop]:{...value[prop],[lang]:e.target.value}})}/>}</label>)}
</div>;

export default function CatalogAdmin() {
  const { lang, url } = useLocale();
  const session = useSession();
  const [query,setQuery]=useSearchParams();
  const tab = ['orders','products','categories','settings'].includes(query.get('tab')) ? query.get('tab') : 'orders';
  const ar = lang === 'ar';
  const [categories,setCategories]=useState([]),[products,setProducts]=useState([]),[pagination,setPagination]=useState({page:1,pages:0,total:0});
  const [catDraft,setCatDraft]=useState(null),[prodDraft,setProdDraft]=useState(null);
  const [notice,setNotice]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
  const [page,setPage]=useState(1);
  const load = useCallback(async () => {
    setLoading(true);setError('');
    try {
      const [cats, prods]=await Promise.all([api('/admin/catalog/categories'),api(`/admin/catalog/products?page=${page}`)]);
      setCategories(cats.categories);setProducts(prods.items);setPagination(prods.pagination);
    } catch(e){setError(e.message)} finally {setLoading(false)}
  },[page]);
  useEffect(()=>{if(tab==='products'||tab==='categories')void load()},[load,tab]);
  const showTab = next => {setQuery({tab:next});setError('');setNotice('');setCatDraft(null);setProdDraft(null)};
  async function submitCategory(e){
    e.preventDefault();setError('');setNotice('');setBusy(true);
    try {
      const body={name:catDraft.name,slug:catDraft.slug,description:catDraft.description,sortOrder:Number(catDraft.sortOrder),active:catDraft.active};
      const editing=Boolean(catDraft._id);
      await api(editing?`/admin/catalog/categories/${catDraft._id}`:'/admin/catalog/categories',{method:editing?'PATCH':'POST',body:editing?{...body,revision:catDraft.revision}:body});
      setCatDraft(null);setNotice(ar?'تم حفظ الفئة.':'Category saved.');await load();
    } catch(err){setError(err.message)}finally{setBusy(false)}
  }
  async function submitProduct(e){
    e.preventDefault();setError('');setNotice('');setBusy(true);
    try {
      const sizes=(prodDraft.sizes||[]).map(s=>({
        grams:Number(s.grams),pricePiastres:toPiastres(s.price,true),
        compareAtPiastres:toPiastres(s.compareAt,false),
        grindOptions:(s.grindOptions||[]).map(g=>({code:g.code,stockQuantity:Number(g.stockQuantity)}))
      }));
      const body={name:prodDraft.name,slug:prodDraft.slug,description:prodDraft.description,categoryId:prodDraft.categoryId,sizes,featured:prodDraft.featured,status:prodDraft.status};
      const editing=Boolean(prodDraft._id);
      await api(editing?`/admin/catalog/products/${prodDraft._id}`:'/admin/catalog/products',{method:editing?'PATCH':'POST',body:editing?{...body,revision:prodDraft.revision}:body});
      setProdDraft(null);setNotice(ar?'تم حفظ المنتج كمسودة.':'Product draft saved.');await load();
    }catch(err){setError(err.message)}finally{setBusy(false)}
  }
  async function archiveProduct(product){
    if (!window.confirm(ar?'أرشفة هذا المنتج؟':'Archive this product?')) return;
    setBusy(true);setError('');
    try{await api(`/admin/catalog/products/${product._id}`,{method:'DELETE'});setNotice(ar?'تمت الأرشفة.':'Product archived.');await load()}
    catch(err){setError(err.message)}finally{setBusy(false)}
  }
  async function deleteCategory(category){
    if (!window.confirm(ar?'حذف هذه الفئة؟':'Delete this category?')) return;
    setBusy(true);setError('');
    try{await api(`/admin/catalog/categories/${category._id}`,{method:'DELETE'});setNotice(ar?'تم الحذف.':'Category deleted.');await load()}
    catch(err){setError(err.message)}finally{setBusy(false)}
  }
  const editProduct = p => setProdDraft({...p,categoryId:String(p.categoryId),sizes:(p.sizes||[]).map(s=>({
    grams:String(s.grams),price:fromPiastres(s.pricePiastres),compareAt:fromPiastres(s.compareAtPiastres),grindOptions:s.grindOptions||[]
  }))});
  const editSize = (index,change) => setProdDraft(p=>({...p,sizes:p.sizes.map((s,i)=>i===index?{...s,...change}:s)}));
  const switchTab = t => <button key={t} type="button" className={tab===t?'selected':''} onClick={()=>showTab(t)}>{ar?({orders:'الطلبات',products:'المنتجات',categories:'الفئات',settings:'الإعدادات'}[t]):t[0].toUpperCase()+t.slice(1)}</button>;
  return <main className="qc-admin">
    <div className="qc-admin-head"><div><p className="kicker">QUANTUM COFFEE / ADMIN</p><h1>{ar?'لوحة الإدارة':'Store Administration'}</h1><p>{session.user?.email}</p></div><button className="qc-admin-secondary" type="button" onClick={async()=>{try{await session.logout();window.location.assign(url('/login'))}catch(e){setError(e.message)}}}>{ar?'خروج':'Sign out'}</button></div>
    <nav className="qc-admin-tabs" aria-label="Admin sections">{['orders','products','categories','settings'].map(switchTab)}</nav>
    {error&&<p role="alert" className="qc-admin-error">{error} <button type="button" onClick={load}>{ar?'تحديث':'Reload'}</button></p>}
    {notice&&<p role="status" className="qc-admin-notice">{notice}</p>}
    {loading&&<p role="status">{ar?'جار التحميل…':'Loading catalog…'}</p>}
    {tab==='orders'&&<AdminOrders/>}
    {tab==='settings'&&<StoreSettingsAdmin/>}
    {tab==='categories'&&<section className="qc-admin-panel">
      <div className="qc-admin-row"><h2>{ar?'الفئات':'Categories'}</h2><button className="qc-admin-primary" type="button" onClick={()=>setCatDraft(blankCategory())}>{ar?'إضافة فئة':'Add category'}</button></div>
      {catDraft&&<form onSubmit={submitCategory} className="qc-admin-form">
        <h3>{catDraft._id?'Edit category':'New category'}</h3>
        {bilingualField(catDraft,setCatDraft,'name','Name')}
        <label>URL slug<input required readOnly={Boolean(catDraft._id)} value={catDraft.slug} onChange={e=>setCatDraft({...catDraft,slug:slugify(e.target.value)})}/></label>
        {bilingualField(catDraft,setCatDraft,'description','Description',true)}
        <label>Sort position<input type="number" min="0" max="100000" required value={catDraft.sortOrder} onChange={e=>setCatDraft({...catDraft,sortOrder:e.target.value})}/></label>
        <label className="qc-admin-checkbox"><input type="checkbox" checked={catDraft.active} onChange={e=>setCatDraft({...catDraft,active:e.target.checked})}/>Visible category</label>
        {catDraft._id&&<MediaEditor key={catDraft._id} kind="category" record={catDraft} onChange={setCatDraft} onRefresh={load}/>}
        <div className="qc-admin-row"><button disabled={busy} className="qc-admin-primary">Save category</button><button type="button" onClick={()=>setCatDraft(null)} className="qc-admin-secondary">Cancel</button></div>
      </form>}
      <div className="qc-admin-list">{categories.map(c=><div className="qc-admin-list-item" key={c._id}><div><b>{c.name[lang]||c.name.en}</b><p>/{c.slug} · {c.active?'Visible':'Hidden'}</p></div><div><button type="button" onClick={()=>setCatDraft({...c})}>Edit</button><button disabled={busy} type="button" onClick={()=>deleteCategory(c)}>Delete</button></div></div>)}{!categories.length&&!loading&&<p>{ar?'لا توجد فئات.':'No categories yet.'}</p>}</div>
    </section>}
    {tab==='products'&&<section className="qc-admin-panel">
      <div className="qc-admin-row"><h2>{ar?'المنتجات':'Products'}</h2><button type="button" className="qc-admin-primary" disabled={!categories.length} onClick={()=>setProdDraft({...blankProduct(),categoryId:categories[0]?._id||''})}>Add product</button></div>
      <p className="qc-admin-tip">New products begin as drafts. Publish after verified R2 images are attached; checkout remains disabled.</p>
      {prodDraft&&<form onSubmit={submitProduct} className="qc-admin-form"><h3>{prodDraft._id?'Edit product':'New product draft'}</h3>
        {bilingualField(prodDraft,setProdDraft,'name','Name')}
        <label>URL slug<input required readOnly={Boolean(prodDraft._id)} value={prodDraft.slug} onChange={e=>setProdDraft({...prodDraft,slug:slugify(e.target.value)})}/></label>
        {bilingualField(prodDraft,setProdDraft,'description','Description',true)}
        <label>Category<select value={prodDraft.categoryId} onChange={e=>setProdDraft({...prodDraft,categoryId:e.target.value})}>{categories.map(c=><option key={c._id} value={c._id}>{c.name[lang]||c.name.en}</option>)}</select></label>
        <div className="qc-grind-admin">
          <div className="qc-admin-row"><h3>{ar?'الأحجام المتاحة':'Product sizes'}</h3>
            <button type="button" className="qc-admin-secondary" disabled={prodDraft.sizes.length>=12} onClick={()=>setProdDraft(p=>({...p,sizes:[...p.sizes,blankSize('')] }))}>{ar?'إضافة حجم':'Add size'}</button>
          </div>
          <p className="qc-admin-tip">{ar?'لكل حجم سعره واختيارات طحن ومخزون مستقل. لا توجد رسوم إضافية للمحوج.':'Each size has its own price, grinds, and inventory. Spiced preparation has no surcharge.'}</p>
          {prodDraft.sizes.map((s,index)=><div className="qc-size-admin" key={index}>
            <div className="qc-admin-row"><b>{ar?'حجم':'Size'} {index+1}</b>
              {prodDraft.sizes.length>1&&<button className="qc-admin-secondary" type="button" onClick={()=>setProdDraft(p=>({...p,sizes:p.sizes.filter((_,i)=>i!==index)}))}>{ar?'حذف الحجم':'Remove size'}</button>}
            </div>
            <div className="qc-admin-two">
              <label>{ar?'الوزن بالجرام':'Weight (grams)'}<input type="number" required min="1" max="50000" value={s.grams} onChange={e=>editSize(index,{grams:e.target.value})}/></label>
              <label>{ar?'السعر بالجنيه':'Price (EGP)'}<input type="text" inputMode="decimal" required value={s.price} onChange={e=>editSize(index,{price:e.target.value})}/></label>
              <label>{ar?'السعر قبل الخصم (اختياري)':'Compare-at (optional)'}<input type="text" inputMode="decimal" value={s.compareAt} onChange={e=>editSize(index,{compareAt:e.target.value})}/></label>
            </div>
            {PREPARATIONS.map(g=>{const option=s.grindOptions?.find(o=>o.code===g.code);return <div className="qc-grind-admin-row" key={g.code}>
              <label className="qc-admin-checkbox"><input type="checkbox" checked={Boolean(option)} onChange={e=>editSize(index,{grindOptions:e.target.checked?[...(s.grindOptions||[]),{code:g.code,stockQuantity:10}]:s.grindOptions.filter(o=>o.code!==g.code)})}/>{g[lang]}</label>
              {option&&<label>Stock <input type="number" min="0" max="100000" required value={option.stockQuantity} onChange={e=>editSize(index,{grindOptions:s.grindOptions.map(o=>o.code===g.code?{...o,stockQuantity:e.target.value}:o)})}/></label>}
            </div>})}
            <p className="qc-admin-tip">Stock: {(s.grindOptions||[]).reduce((n,g)=>n+(Number(g.stockQuantity)||0),0)} bags</p>
          </div>)}
        </div>
        <label className="qc-admin-checkbox"><input type="checkbox" checked={prodDraft.featured} onChange={e=>setProdDraft({...prodDraft,featured:e.target.checked})}/>Best seller / featured selection</label>
        <label>Publication status<select value={prodDraft.status} onChange={e=>setProdDraft({...prodDraft,status:e.target.value})}><option value="draft">Draft</option><option value="published" disabled={!prodDraft._id||!prodDraft.imageKeys?.length}>Published</option><option value="archived">Archived</option></select></label>
        <p className="qc-admin-tip">Publish only after you have verified at least one R2 image and activated the category. Checkout stays disabled.</p>
        {prodDraft._id&&<MediaEditor key={prodDraft._id} kind="product" record={prodDraft} onChange={setProdDraft} onRefresh={load}/>}
        <div className="qc-admin-row"><button className="qc-admin-primary" disabled={busy}>Save product</button><button type="button" className="qc-admin-secondary" onClick={()=>setProdDraft(null)}>Cancel</button></div>
      </form>}
      <div className="qc-admin-list">{products.map(p=><div className="qc-admin-list-item" key={p._id}><div><b>{p.name[lang]||p.name.en}</b><p>{displayMoney(p.pricePiastres)} {p.compareAtPiastres!=null&&<s>{displayMoney(p.compareAtPiastres)}</s>} · {p.status} · {p.sizes?.length||0} sizes · total stock {p.stockQuantity}</p></div><div><button type="button" onClick={()=>editProduct(p)}>Edit</button><button type="button" disabled={busy||p.status==='archived'} onClick={()=>archiveProduct(p)}>Archive</button></div></div>)}{!products.length&&!loading&&<p>{ar?'لا توجد منتجات.':'No products yet.'}</p>}</div>
      {pagination.pages>1&&<div className="qc-admin-row"><button type="button" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>{page}/{pagination.pages}</span><button type="button" disabled={page>=pagination.pages} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
    </section>}
    <p className="qc-admin-return"><Link to={url('/')}>{ar?'العودة للموقع':'Return to storefront'}</Link></p>
  </main>;
}
