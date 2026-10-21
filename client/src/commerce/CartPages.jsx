import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from './CartProvider.jsx';
import { useLocale } from '../lib/i18n.jsx';
import { useSession } from '../lib/session.jsx';
import { api } from '../lib/api.js';
import { money, translated } from '../components/CatalogCards.jsx';
import './commerce.css';
import PaymentProofUploader from './PaymentProofUploader.jsx';

const methods=['cod','instapay','vodafone_cash'];
const governorates=['cairo','giza','alexandria','qalyubia','dakahlia','sharqia','gharbia','monufia','beheira','kafr_el_sheikh','damietta','port_said','ismailia','suez','north_sinai','south_sinai','red_sea','fayoum','beni_suef','minya','assiut','sohag','qena','luxor','aswan','new_valley','matrouh'];
const methodName={cod:'Cash on Delivery',instapay:'InstaPay',vodafone_cash:'Vodafone Cash'};
const stateName={received:'Received',confirmed:'Confirmed',packing:'Packing',shipped:'Shipped',delivered:'Delivered',cancelled:'Cancelled'};
function text(ar,en,arabic){return ar?arabic:en}
function Panel({eyebrow,title,children}){return <main className="qc-commerce"><div className="qc-commerce-container"><p className="kicker">QUANTUM COFFEE / {eyebrow}</p><h1>{title}</h1>{children}</div></main>}
function ErrorLine({error}){return error?<p className="qc-commerce-error" role="alert">{error}</p>:null}
function OrderCard({order,lang,onPaymentSubmitted}){
  return <article className="qc-order-card"><div className="qc-commerce-row"><div><h2>{order.orderNumber}</h2><p>{new Date(order.createdAt).toLocaleDateString(lang==='ar'?'ar-EG':'en-EG')}</p></div><strong>{order.totalPiastres==null?'':money(order.totalPiastres)}</strong></div>
  <p>{lang==='ar'?'الحالة':'Status'}: {stateName[order.fulfillmentState]||order.fulfillmentState} · {methodName[order.paymentMethod]||order.paymentMethod} · {order.paymentState}</p>
  {order.paymentState==='rejected'&&order.paymentRejectionReason&&<p className="qc-commerce-error">{order.paymentRejectionReason}</p>}
  {order.lines?.map((line,i)=><div key={i} className="qc-order-line"><span>{translated(line.name,lang)} × {line.quantity}</span><span>{money(line.lineTotalPiastres)}</span></div>)}
  {order.paymentMethod!=='cod'&&['awaiting_transfer','rejected'].includes(order.paymentState)&&<PaymentProofUploader orderNumber={order.orderNumber} onSubmitted={onPaymentSubmitted}/>}
  </article>;
}
export function CartPage(){
  const {items,count,update,remove}=useCart(),{lang,url}=useLocale(),ar=lang==='ar';
  const [lines,setLines]=useState([]),[pending,setPending]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const ctrl=new AbortController();setError('');setPending(true);api('/commerce/cart',{method:'POST',body:{items},signal:ctrl.signal})
    .then(data=>setLines(data.items)).catch(e=>{if(!ctrl.signal.aborted)setError(e.message)}).finally(()=>{if(!ctrl.signal.aborted)setPending(false)});
    return()=>ctrl.abort();},[items]);
  const available=lines.length===items.length&&lines.every(p=>p.available&&p.stockQuantity>=p.quantity);
  return <Panel eyebrow="CART" title={text(ar,'Your Cart','سلة التسوق')}>
    {!count?<div className="qc-commerce-empty"><p>{text(ar,'Your cart is empty.','سلتك فارغة.')}</p><Link to={url('/shop')} className="button button-dark">{text(ar,'Explore Coffee','تسوق الآن')}</Link></div>:<>
      <p className="qc-commerce-muted">{text(ar,'Your selections are saved on this device. Prices and stock are checked against the store before checkout.','منتجاتك محفوظة على هذا الجهاز وسيتم التحقق من السعر والمخزون قبل الطلب.')}</p>
      <ErrorLine error={error}/>{pending&&<p role="status">{text(ar,'Checking cart…','جار مراجعة السلة…')}</p>}
      <div className="qc-cart-items">{lines.map(line=><article className="qc-cart-line" key={line.productId}>
        <div className="qc-cart-thumb">{line.imageUrl&&<img src={line.imageUrl} alt="" loading="lazy"/>}</div><div><h2>{translated(line.name,lang)}</h2><p>{line.available?money(line.pricePiastres):text(ar,'Not available','غير متوفر')}</p>
        <div className="qc-quantity"><button aria-label="Decrease quantity" disabled={line.quantity<=1} onClick={()=>update(line.productId,line.quantity-1)} type="button">−</button><span>{line.quantity}</span><button aria-label="Increase quantity" disabled={line.quantity>=Math.min(20,line.stockQuantity)} onClick={()=>update(line.productId,line.quantity+1)} type="button">+</button></div>
        {!line.available||line.stockQuantity<line.quantity?<p className="qc-commerce-error">{text(ar,'Unavailable or insufficient stock','الكمية غير متاحة')}</p>:null}
        <button className="qc-text-control" onClick={()=>remove(line.productId)} type="button">{text(ar,'Remove','حذف')}</button></div><strong>{line.available?money(line.pricePiastres*line.quantity):'—'}</strong>
      </article>)}</div>
      <div className="qc-cart-summary"><strong>{text(ar,'Subtotal','الإجمالي قبل الشحن')}: {money(lines.filter(x=>x.available).reduce((n,x)=>n+x.pricePiastres*x.quantity,0))}</strong><p>{text(ar,'Shipping is calculated at checkout.','الشحن يُحسب عند إتمام الطلب.')}</p>
      {available&&!pending?<Link className="button button-dark" to={url('/checkout')}>{text(ar,'Continue to Checkout','المتابعة لإتمام الطلب')}</Link>:<button type="button" className="button button-dark" disabled>{text(ar,'Review cart to continue','راجع السلة للمتابعة')}</button>}</div>
    </>}
  </Panel>;
}
const initialCustomer={name:'',phone:'',email:'',governorate:'cairo',city:'',street:'',details:''};
export function CheckoutPage(){
  const {items,clear}=useCart(),{lang,url}=useLocale(),{user}=useSession(),ar=lang==='ar',navigate=useNavigate();
  const [customer,setCustomer]=useState(()=>({...initialCustomer,name:user?.name||'',email:user?.email||''}));
  const [paymentMethod,setPaymentMethod]=useState('cod'),[quote,setQuote]=useState(null),[config,setConfig]=useState(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[receipt,setReceipt]=useState(null);
  const [checkoutKey]=useState(()=>crypto.randomUUID());
  useEffect(()=>{let active=true;api('/commerce/config').then(v=>{if(active)setConfig(v)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[]);
  useEffect(()=>{if(!items.length||receipt)return;const ctrl=new AbortController();setQuote(null);setError('');api('/commerce/quote',{method:'POST',body:{items,governorate:customer.governorate},signal:ctrl.signal})
    .then(data=>setQuote(data)).catch(e=>{if(!ctrl.signal.aborted)setError(e.message)});return()=>ctrl.abort();},[items,customer.governorate,receipt]);
  const change=key=>e=>setCustomer(old=>({...old,[key]:e.target.value}));
  async function submit(e){e.preventDefault();if(!config?.checkoutEnabled||!quote||!items.length)return;setError('');setBusy(true);
    try {const response=await api('/commerce/checkout',{method:'POST',body:{items,customer,paymentMethod,checkoutKey}});setReceipt(response.order);clear();}
    catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <Panel eyebrow="CHECKOUT" title={text(ar,'Checkout','إتمام الطلب')}>
    {receipt?<div className="qc-commerce-receipt"><h2>{text(ar,'Order received','تم استلام الطلب')}</h2><p>{text(ar,'Order number','رقم الطلب')}: <strong>{receipt.orderNumber}</strong></p>
      <p>{paymentMethod==='cod'?text(ar,'Pay on delivery.','الدفع عند الاستلام.'):text(ar,'Do not transfer money until the store provides verified payment instructions.','لا تحول أي مبلغ قبل الحصول على تعليمات الدفع المؤكدة من المتجر.')}</p>
      <p>{text(ar,'Keep your order number and phone number to track your order.','احتفظ برقم الطلب ورقم الهاتف لتتبع الطلب.')}</p>
      {paymentMethod!=='cod'&&['awaiting_transfer','rejected'].includes(receipt.paymentState)&&<PaymentProofUploader orderNumber={receipt.orderNumber} phone={customer.phone} onSubmitted={next=>setReceipt(prev=>({...prev,...next}))}/>}
      <Link to={url('/track-order')} className="button button-dark">{text(ar,'Track Order','تتبع الطلب')}</Link>
    </div>:!items.length?<div className="qc-commerce-empty"><p>{text(ar,'There are no items to check out.','السلة فارغة.')}</p><Link to={url('/shop')} className="button button-dark">{text(ar,'Back to Shop','العودة للمتجر')}</Link></div>:
    <form className="qc-checkout" onSubmit={submit}>
      <section className="qc-form-grid"><h2>{text(ar,'Delivery Details','بيانات التوصيل')}</h2>
        <label>{text(ar,'Full name','الاسم بالكامل')}<input required maxLength={100} autoComplete="name" value={customer.name} onChange={change('name')}/></label>
        <label>{text(ar,'Phone number','رقم الهاتف')}<input required inputMode="tel" autoComplete="tel" value={customer.phone} onChange={change('phone')} placeholder="01xxxxxxxxx"/></label>
        <label>{text(ar,'Email (optional)','البريد الإلكتروني (اختياري)')}<input type="email" maxLength={254} autoComplete="email" value={customer.email} onChange={change('email')}/></label>
        <label>{text(ar,'Governorate','المحافظة')}<select value={customer.governorate} onChange={change('governorate')}>{governorates.map(g=><option key={g} value={g}>{g.replaceAll('_',' ')}</option>)}</select></label>
        <label>{text(ar,'City','المدينة')}<input required maxLength={120} value={customer.city} onChange={change('city')}/></label>
        <label>{text(ar,'Street and building','العنوان بالتفصيل')}<input required maxLength={240} value={customer.street} onChange={change('street')}/></label>
        <label className="qc-full">{text(ar,'Additional delivery notes (optional)','ملاحظات إضافية (اختياري)')}<textarea maxLength={500} value={customer.details} onChange={change('details')}/></label>
        <h2>{text(ar,'Payment Method','طريقة الدفع')}</h2><div className="qc-payments qc-full">{methods.map(method=><label key={method}><input type="radio" name="payment" checked={paymentMethod===method} onChange={()=>setPaymentMethod(method)}/>{methodName[method]}</label>)}</div>
        {paymentMethod!=='cod'&&<p className="qc-commerce-muted qc-full">{text(ar,'Transfer instructions and secure payment-proof uploads are not active yet. Do not transfer before receiving an official order reference and verified instructions.','تعليمات التحويل ورفع إثبات الدفع غير مفعلة حتى الآن. لا تحول قبل تأكيد التعليمات الرسمية.')}</p>}
      </section>
      <aside className="qc-checkout-summary"><h2>{text(ar,'Order Summary','ملخص الطلب')}</h2>{quote?.items.map(line=><div className="qc-order-line" key={line.productId}><span>{translated(line.name,lang)} × {line.quantity}</span><strong>{money(line.lineTotalPiastres)}</strong></div>)}
      {quote&&<><div className="qc-order-line"><span>{text(ar,'Subtotal','المجموع')}</span><strong>{money(quote.subtotalPiastres)}</strong></div><div className="qc-order-line"><span>{text(ar,'Delivery','الشحن')}</span><strong>{money(quote.shippingPiastres)}</strong></div><div className="qc-order-line"><strong>{text(ar,'Total','الإجمالي')}</strong><strong>{money(quote.totalPiastres)}</strong></div></>}
      {!config?.checkoutEnabled&&<p className="qc-commerce-muted">{text(ar,'Ordering will open after payment and shipping details are confirmed.','الطلبات ستفتح بعد تأكيد الشحن ووسائل الدفع.')}</p>}
      <ErrorLine error={error}/><button disabled={busy||!config?.checkoutEnabled||!quote} className="button button-dark">{busy?text(ar,'Placing order…','جار إرسال الطلب…'):text(ar,'Place Order','تأكيد الطلب')}</button>
      <button type="button" className="qc-text-control" onClick={()=>navigate(url('/cart'))}>{text(ar,'Edit Cart','تعديل السلة')}</button>
      </aside>
    </form>}
  </Panel>;
}
export function OrdersPage(){
  const {lang}=useLocale(),ar=lang==='ar';const [orders,setOrders]=useState([]),[error,setError]=useState(''),[pending,setPending]=useState(true);
  useEffect(()=>{const ctrl=new AbortController();api('/commerce/my-orders',{signal:ctrl.signal}).then(r=>setOrders(r.items)).catch(e=>{if(!ctrl.signal.aborted)setError(e.message)}).finally(()=>{if(!ctrl.signal.aborted)setPending(false)});return()=>ctrl.abort()},[]);
  return <Panel eyebrow="ACCOUNT" title={text(ar,'My Orders','طلباتي')}>
    <ErrorLine error={error}/>{pending?<p role="status">{text(ar,'Loading orders…','جار تحميل الطلبات…')}</p>:orders.length?orders.map(o=><OrderCard key={o.id} order={o} lang={lang} onPaymentSubmitted={next=>setOrders(current=>current.map(entry=>entry.orderNumber===next.orderNumber?{...entry,...next}:entry))}/>):<p className="qc-commerce-muted">{text(ar,'No orders yet.','لا توجد طلبات بعد.')}</p>}
  </Panel>;
}
export function TrackPage(){
  const {lang}=useLocale(),ar=lang==='ar', [orderNumber,setOrderNumber]=useState(''),[phone,setPhone]=useState(''),[order,setOrder]=useState(null),[error,setError]=useState(''),[pending,setPending]=useState(false);
  async function track(e){e.preventDefault();setPending(true);setError('');setOrder(null);try{const data=await api('/commerce/track',{method:'POST',body:{orderNumber:orderNumber.toUpperCase().trim(),phone}});setOrder(data.order)}catch(e){setError(e.message)}finally{setPending(false)}}
  return <Panel eyebrow="ORDER STATUS" title={text(ar,'Track Your Order','تتبع طلبك')}>
    <form className="qc-tracking" onSubmit={track}><label>{text(ar,'Order number','رقم الطلب')}<input required value={orderNumber} maxLength={15} placeholder="QC-XXXXXXXXXXXX" onChange={e=>setOrderNumber(e.target.value)}/></label><label>{text(ar,'Checkout phone','رقم هاتف الطلب')}<input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="01xxxxxxxxx"/></label><button className="button button-dark" disabled={pending}>{text(ar,'Check Status','تتبع الطلب')}</button></form>
    <ErrorLine error={error}/>{order&&<div className="qc-order-card"><h2>{order.orderNumber}</h2><p>{text(ar,'Status','الحالة')}: {stateName[order.fulfillmentState]||order.fulfillmentState}</p><p>{text(ar,'Payment','الدفع')}: {order.paymentState}</p>{order.paymentState==='rejected'&&order.paymentRejectionReason&&<p className="qc-commerce-error">{order.paymentRejectionReason}</p>}<ol>{order.history?.map((h,i)=><li key={i}>{stateName[h.status]||h.status} — {new Date(h.at).toLocaleDateString(lang==='ar'?'ar-EG':'en-EG')}</li>)}</ol>{order.paymentMethod!=='cod'&&['awaiting_transfer','rejected'].includes(order.paymentState)&&<PaymentProofUploader orderNumber={order.orderNumber} phone={phone} onSubmitted={next=>setOrder(prev=>({...prev,...next}))}/>}</div>}
  </Panel>;
}
