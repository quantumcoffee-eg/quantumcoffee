import {useState} from 'react';
import {api} from '../lib/api.js';
import {useLocale} from '../lib/i18n.jsx';

const acceptable=new Set(['image/jpeg','image/png','image/webp']);
const MAX_BYTES=5*1024*1024;
// Never write transfer instructions into the interface until the owner provides them.
export default function PaymentProofUploader({orderNumber,phone,onSubmitted}) {
  const {lang}=useLocale();const ar=lang==='ar';
  const [file,setFile]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(false);
  async function submit(e){
    e.preventDefault();setError('');
    if(!file||!acceptable.has(file.type)||file.size<1||file.size>MAX_BYTES){setError(ar?'اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 5 ميجابايت.':'Choose a JPG, PNG or WebP screenshot up to 5 MB.');return}
    setLoading(true);
    try {
      const identity={orderNumber,...(phone?{phone}:{})};
      const intent=await api('/commerce/payment-proofs/intent',{method:'POST',body:{...identity,contentType:file.type,size:file.size}});
      const upload=await fetch(intent.uploadUrl,{method:'PUT',headers:intent.headers,body:file,credentials:'omit'});
      if(!upload.ok)throw new Error(ar?'تعذر رفع الصورة. تأكد من اتصال الإنترنت وأعد المحاولة.':'Could not upload the screenshot. Check your connection and try again.');
      const confirmed=await api(`/commerce/payment-proofs/${intent.proofId}/confirm`,{method:'POST',body:identity});
      setSuccess(true);setFile(null);onSubmitted?.(confirmed.order);
    } catch(e){setError(e.message)}finally{setLoading(false)}
  }
  if(success)return <p className="qc-commerce-muted" role="status">{ar?'تم رفع الإثبات، وهو الآن قيد المراجعة.':'Screenshot submitted. Your transfer is awaiting manual verification.'}</p>;
  return <form className="qc-proof-upload" onSubmit={submit}>
    <h3>{ar?'إثبات التحويل':'Payment screenshot'}</h3>
    <p className="qc-commerce-muted">{ar?'ارفع الإثبات فقط بعد التحويل لحساب الدفع الرسمي الذي أكده المتجر. رفع صورة لا يعني تأكيد الدفع.':'Upload only after transferring to the shop’s confirmed payment account. A screenshot is not payment confirmation.'}</p>
    <label>{ar?'صورة التحويل':'Transaction screenshot'}
      <input aria-label={ar?'صورة التحويل':'Transaction screenshot'} required type="file" accept="image/jpeg,image/png,image/webp" disabled={loading} onChange={e=>setFile(e.target.files?.[0]||null)}/>
    </label>
    {error&&<p role="alert" className="qc-commerce-error">{error}</p>}
    <button className="button button-dark" disabled={!file||loading}>{loading?(ar?'جار الرفع…':'Uploading…'):(ar?'رفع الإثبات للمراجعة':'Submit for review')}</button>
  </form>;
}
