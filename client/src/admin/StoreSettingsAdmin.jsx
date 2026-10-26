import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLocale } from '../lib/i18n.jsx';

const policyNames={shipping:['Shipping policy','سياسة الشحن'],refunds:['Refund policy','سياسة الاسترجاع'],privacy:['Privacy policy','سياسة الخصوصية'],terms:['Terms & conditions','الشروط والأحكام']};
const toEGP = v => v == null ? '' : (v / 100).toFixed(2);
const toPiastres = v => {
  if (v.trim()==='') return null;
  if (!/^(0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(v.trim())) throw new Error('Enter an amount in EGP, with up to two decimal places.');
  const [p,k='']=v.trim().split('.');return Number(p)*100+Number(k.padEnd(2,'0'));
};
export default function StoreSettingsAdmin(){
  const {lang}=useLocale(),ar=lang==='ar';
  const [draft,setDraft]=useState(null),[revision,setRevision]=useState(0),[pending,setPending]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [rates,setRates]=useState({cairoGiza:'',other:''});
  async function load(){setPending(true);setError('');try{
    const result=await api('/admin/store/settings');setDraft(result.settings);setRevision(result.revision);
    setRates({cairoGiza:toEGP(result.settings.shipping.cairoGizaPiastres),other:toEGP(result.settings.shipping.otherPiastres)});
  }catch(e){setError(e.message)}finally{setPending(false)}}
  useEffect(()=>{void load()},[]);
  const contact=(field,v)=>setDraft(p=>({...p,contact:{...p.contact,[field]:v}}));
  const payment=(method,field,v)=>setDraft(p=>({...p,payments:{...p.payments,[method]:{...p.payments[method],[field]:v}}}));
  const policy=(kind,language,v)=>setDraft(p=>({...p,policies:{...p.policies,[kind]:{...p.policies[kind],[language]:v}}}));
  async function save(e){e.preventDefault();setSaving(true);setError('');setNotice('');try{
    const settings={...draft,shipping:{cairoGizaPiastres:toPiastres(rates.cairoGiza),otherPiastres:toPiastres(rates.other)}};
    const result=await api('/admin/store/settings',{method:'PUT',body:{revision,settings}});
    setDraft(result.settings);setRevision(result.revision);setNotice(ar?'تم حفظ إعدادات المتجر.':'Store settings saved.');
  }catch(e){setError(e.message)}finally{setSaving(false)}}
  return <section className="qc-admin-panel">
    <div className="qc-admin-row"><h2>{ar?'إعدادات المتجر':'Store Settings'}</h2><button type="button" className="qc-admin-secondary" onClick={()=>void load()}>{ar?'تحديث':'Reload'}</button></div>
    <p className="qc-admin-tip">{ar?'أضف بيانات المالك المعتمدة فقط. حفظ البيانات لا يفتح الطلبات أو التسجيل.':'Enter only owner-approved details. Saving settings cannot enable checkout or registration.'}</p>
    {pending&&<p role="status">{ar?'تحميل…':'Loading settings…'}</p>}
    {error&&<p role="alert" className="qc-admin-error">{error}</p>}{notice&&<p role="status" className="qc-admin-notice">{notice}</p>}
    {draft&&!pending&&<form className="qc-admin-form" onSubmit={save}>
      <h3>{ar?'بيانات التواصل':'Contact details'}</h3>
      <div className="qc-admin-two">
        <label>{ar?'واتساب (رقم مصري مع +20)':'WhatsApp (+20 Egyptian number)'}<input value={draft.contact.whatsapp} onChange={e=>contact('whatsapp',e.target.value)} placeholder="+201xxxxxxxxx" maxLength={20}/></label>
        <label>{ar?'البريد الإلكتروني للتواصل':'Public contact email'}<input type="email" value={draft.contact.email} onChange={e=>contact('email',e.target.value)} placeholder="hello@example.com" maxLength={254}/></label>
        <label>{ar?'صفحة انستجرام':'Instagram profile URL'}<input type="url" value={draft.contact.instagramUrl} onChange={e=>contact('instagramUrl',e.target.value)} placeholder="https://www.instagram.com/account" maxLength={200}/></label>
      </div>
      <h3>{ar?'أسعار الشحن':'Shipping fees'}</h3>
      <p className="qc-admin-tip">{ar?'اترك القيمة فارغة حتى يؤكد المالك السعر. لا نضع أسعار افتراضية.':'Leave amounts blank until confirmed. There are no assumed shipping rates.'}</p>
      <div className="qc-admin-two">
        <label>{ar?'القاهرة والجيزة (جنيه)':'Cairo & Giza (EGP)'}<input type="text" inputMode="decimal" value={rates.cairoGiza} placeholder="Not configured" onChange={e=>setRates(p=>({...p,cairoGiza:e.target.value}))}/></label>
        <label>{ar?'باقي المحافظات (جنيه)':'Other governorates (EGP)'}<input type="text" inputMode="decimal" value={rates.other} placeholder="Not configured" onChange={e=>setRates(p=>({...p,other:e.target.value}))}/></label>
      </div>
      <h3>{ar?'طرق الدفع':'Payment methods'}</h3>
      <label className="qc-admin-checkbox"><input type="checkbox" checked={draft.payments.cod.enabled} onChange={e=>payment('cod','enabled',e.target.checked)}/>{ar?'الدفع عند الاستلام (تفعيل عند الموافقة)':'Cash on Delivery — enabled'}</label>
      <label className="qc-admin-checkbox"><input type="checkbox" checked={draft.payments.instapay.enabled} onChange={e=>payment('instapay','enabled',e.target.checked)}/>{ar?'تفعيل انستاباي بعد التأكد من بيانات الاستلام':'Enable InstaPay (only after verifying recipient)'}</label>
      <div className="qc-admin-two"><label>{ar?'اسم مستلم انستاباي':'InstaPay recipient name'}<input value={draft.payments.instapay.recipient} maxLength={120} onChange={e=>payment('instapay','recipient',e.target.value)}/></label><label>{ar?'عنوان أو رقم انستاباي':'InstaPay handle or number'}<input value={draft.payments.instapay.reference} maxLength={120} onChange={e=>payment('instapay','reference',e.target.value)}/></label></div>
      <label className="qc-admin-checkbox"><input type="checkbox" checked={draft.payments.vodafone_cash.enabled} onChange={e=>payment('vodafone_cash','enabled',e.target.checked)}/>{ar?'تفعيل فودافون كاش بعد التأكد':'Enable Vodafone Cash (only after verifying recipient)'}</label>
      <div className="qc-admin-two"><label>{ar?'اسم مستلم فودافون كاش':'Vodafone Cash recipient name'}<input maxLength={120} value={draft.payments.vodafone_cash.recipient} onChange={e=>payment('vodafone_cash','recipient',e.target.value)}/></label><label>{ar?'رقم فودافون كاش':'Vodafone Cash number (01xxxxxxxxx)'}<input maxLength={20} inputMode="tel" value={draft.payments.vodafone_cash.phone} onChange={e=>payment('vodafone_cash','phone',e.target.value)}/></label></div>
      <p className="qc-admin-tip">{ar?'أرقام التحويل ستظهر للعملاء عند تفعيل وسائل الدفع لاحقاً. لا تضع بيانات سرية هنا.':'Transfer details are customer-facing once enabled. Never enter secrets or passwords here.'}</p>
      <h3>{ar?'سياسات المتجر':'Store policies'}</h3>
      {Object.entries(policyNames).map(([key,labels])=><div key={key} className="qc-admin-settings-policy"><h4>{labels[ar?1:0]}</h4><div className="qc-admin-two">{['en','ar'].map(language=><label key={language}>{language.toUpperCase()}<textarea rows={5} maxLength={12000} dir={language==='ar'?'rtl':'ltr'} value={draft.policies[key][language]} onChange={e=>policy(key,language,e.target.value)} placeholder={ar?'في انتظار موافقة المالك':'Pending owner approval'}/></label>)}</div></div>)}
      <div className="qc-admin-row"><button disabled={saving} className="qc-admin-primary" type="submit">{saving?(ar?'جار الحفظ…':'Saving…'):(ar?'حفظ الإعدادات':'Save settings')}</button><span className="qc-admin-tip">{ar?'حفظ آمن باستخدام رقم النسخة':'Versioned save prevents accidental overwrites'}</span></div>
    </form>}
  </section>;
}
