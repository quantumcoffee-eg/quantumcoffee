import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLocale } from '../lib/i18n.jsx';
import { money, translated } from '../components/CatalogCards.jsx';

const nextStates={received:['confirmed','cancelled'],confirmed:['packing','cancelled'],packing:['shipped','cancelled'],shipped:['delivered'],delivered:[],cancelled:[]};
const choices=['','received','confirmed','packing','shipped','delivered','cancelled'];
export default function AdminOrders(){
  const {lang}=useLocale(),ar=lang==='ar';
  const [status,setStatus]=useState(''),[page,setPage]=useState(1),[orders,setOrders]=useState([]),[pages,setPages]=useState(0);
  const [open,setOpen]=useState(null),[next,setNext]=useState(''),[proofUrl,setProofUrl]=useState(''),[reviewReason,setReviewReason]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const load=useCallback(async()=>{setLoading(true);setError('');try{const p=new URLSearchParams({page:String(page)});if(status)p.set('status',status);const data=await api(`/admin/orders?${p}`);setOrders(data.items);setPages(data.pagination.pages)}catch(e){setError(e.message)}finally{setLoading(false)}},[page,status]);
  useEffect(()=>{void load()},[load]);
  const openOrder=async id=>{setError('');setOpen(null);setProofUrl('');setReviewReason('');try{const data=await api(`/admin/orders/${id}`);setOpen(data.order);setNext('')}catch(e){setError(e.message)}};
  const update=async()=>{if(!open||!next)return;setBusy(true);setError('');setNotice('');try{
    const result=await api(`/admin/orders/${open.id}/status`,{method:'PATCH',body:{revision:open.revision,status:next}});
    setOpen(result.order);setNext('');setNotice(ar?'تم تحديث حالة الطلب.':'Order status updated.');await load();
  }catch(e){setError(e.message)}finally{setBusy(false)}};
  const openProof=async()=>{setBusy(true);setError('');setProofUrl('');try{const result=await api(`/admin/payments/${open.id}/proof`);setProofUrl(result.url)}catch(e){setError(e.message)}finally{setBusy(false)}};
  const review=async decision=>{setBusy(true);setError('');setNotice('');try{
    await api(`/admin/payments/${open.id}/review`,{method:'PATCH',body:{revision:open.revision,decision,...(decision==='reject'?{reason:reviewReason}:{})}});
    setProofUrl('');setReviewReason('');setNotice(ar?'تم تحديث الدفع.':'Payment status updated.');await openOrder(open.id);await load();
  }catch(e){setError(e.message)}finally{setBusy(false)}};
  return <section className="qc-admin-panel">
    <div className="qc-admin-row"><h2>{ar?'إدارة الطلبات':'Orders'}</h2><button type="button" className="qc-admin-secondary" onClick={load}>{ar?'تحديث':'Refresh'}</button></div>
    <p className="qc-admin-tip">{ar?'لا توجد طلبات حقيقية قبل تفعيل الشراء في إعدادات الإنتاج.':'No live orders can be placed until checkout is explicitly enabled.'}</p>
    <label>{ar?'تصفية الحالة':'Filter by status'}<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);setOpen(null)}}>{choices.map(s=><option value={s} key={s}>{s||'All statuses'}</option>)}</select></label>
    {error&&<p className="qc-admin-error" role="alert">{error}</p>}{notice&&<p role="status" className="qc-admin-notice">{notice}</p>}
    {loading&&<p role="status">{ar?'جار التحميل…':'Loading…'}</p>}
    <div className="qc-admin-list">{orders.map(o=><div className="qc-admin-list-item" key={o.id}><div><strong>{o.orderNumber}</strong><p>{o.customer.name} · {o.customer.phone} · {money(o.totalPiastres)}</p><p>{o.fulfillmentState} · {o.paymentMethod} · {o.paymentState}</p></div><button type="button" onClick={()=>openOrder(o.id)}>{ar?'عرض':'Details'}</button></div>)}{!orders.length&&!loading&&<p>{ar?'لا توجد طلبات.':'No orders found.'}</p>}</div>
    {pages>1&&<div className="qc-admin-row"><button type="button" disabled={page<=1} onClick={()=>setPage(n=>n-1)}>Previous</button><span>{page}/{pages}</span><button type="button" disabled={page>=pages} onClick={()=>setPage(n=>n+1)}>Next</button></div>}
    {open&&<section className="qc-admin-form" aria-label="Order details"><div className="qc-admin-row"><h3>{open.orderNumber}</h3><button type="button" className="qc-admin-secondary" onClick={()=>setOpen(null)}>Close</button></div>
      <p>{open.customer.name} · {open.customer.phone} · {open.customer.email||'No email'}</p>
      <p>{open.customer.governorate} · {open.customer.city} · {open.customer.street} {open.customer.details}</p>
      {open.lines.map((line,i)=><p key={i}>{translated(line.name,lang)} ({line.packGrams} g · {line.grindCode}) × {line.quantity} — {money(line.lineTotalPiastres)}</p>)}
      <p>{ar?'المجموع':'Subtotal'}: {money(open.subtotalPiastres)} · {ar?'الشحن':'Delivery'}: {money(open.shippingPiastres)} · <strong>{money(open.totalPiastres)}</strong></p>
      <p>{ar?'الدفع':'Payment'}: {open.paymentMethod} · {open.paymentState}</p>
      {open.paymentProofId&&<div className="qc-admin-proof"><button className="qc-admin-secondary" type="button" disabled={busy} onClick={openProof}>{ar?'تحميل إثبات الدفع':'Load private payment proof'}</button>
        {proofUrl&&<div><img src={proofUrl} alt={ar?'صورة إثبات الدفع':'Submitted payment screenshot'} referrerPolicy="no-referrer" style={{maxWidth:'min(100%,420px)',maxHeight:440,objectFit:'contain'}}/><p className="qc-admin-tip">{ar?'ينتهي رابط العرض خلال دقيقة.':'Viewing access expires after 60 seconds.'}</p></div>}
      </div>}
      {open.paymentState==='awaiting_verification'&&<div className="qc-admin-proof"><label>{ar?'سبب الرفض (يظهر للعميل في حالة الرفض)':'Reason if rejecting'}<textarea maxLength={300} value={reviewReason} onChange={e=>setReviewReason(e.target.value)} placeholder="Reference does not match the received transfer"/></label>
        <div className="qc-admin-row"><button type="button" disabled={busy} className="qc-admin-primary" onClick={()=>review('approve')}>{ar?'تأكيد وصول المبلغ':'Confirm funds received'}</button><button type="button" disabled={busy||reviewReason.trim().length<5} className="qc-admin-secondary" onClick={()=>review('reject')}>{ar?'رفض الإثبات':'Reject proof'}</button></div>
        <p className="qc-admin-tip">{ar?'لا تعتمد الدفع إلا بعد التحقق من وصوله فعلاً.':'Only confirm after independently verifying that the funds arrived.'}</p>
      </div>}
      {open.paymentMethod==='cod'&&open.fulfillmentState==='delivered'&&open.paymentState==='unpaid'&&<button type="button" className="qc-admin-primary" disabled={busy} onClick={()=>review('approve')}>{ar?'تأكيد تحصيل الدفع عند الاستلام':'Mark COD collected'}</button>}

      <label>{ar?'تحديث الحالة':'Update fulfillment status'}<select value={next} onChange={e=>setNext(e.target.value)}><option value="">Choose a valid next status</option>{(nextStates[open.fulfillmentState]||[]).map(s=><option key={s} value={s}>{s}</option>)}</select></label>
      <p className="qc-admin-tip">{ar?'إلغاء الطلب المدفوع يحتاج إجراءات استرداد منفصلة.':'Paid orders require a separate refund workflow before cancellation. Cancellation restores inventory.'}</p>
      <button className="qc-admin-primary" disabled={!next||busy} onClick={update} type="button">{busy?'Saving…':'Save status'}</button>
      <div>{open.history.map((h,i)=><p key={i}>{h.status} · {new Date(h.at).toLocaleString(lang==='ar'?'ar-EG':'en-EG')}</p>)}</div>
    </section>}
  </section>
}
