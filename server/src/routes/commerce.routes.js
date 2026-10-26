import { Router } from 'express';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { imageUrl } from '../media/config.js';
import { databaseReady } from '../db/connect.js';
import { loadStoreSettings } from './store.routes.js';
import { shippingFeeFromSettings, publicStoreSettings } from '../store/settings-values.js';
import { loadUser, requireRole } from '../security/session.js';
import { rateLimit } from '../security/rate-limit.js';
import { CommerceError, validateItems, validateCheckout, lineTotals, phoneNumber, ORDERING_IMPLEMENTED } from '../commerce/checkout.js';
import { orderQueueFilter, OverviewInputError } from '../admin/overview-values.js';
import { orderService } from '../commerce/order-service.js';
import { loadCartLines } from '../commerce/inventory-service.js';

export const commerceRoutes = Router();
export const adminOrdersRoutes = Router();
const run = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const db = (_req,res,next) => databaseReady()?next():res.status(503).json({code:'SERVICE_UNAVAILABLE',error:'Order service requires Quantum Coffee MongoDB.'});
const noCache = (_req,res,next) => {res.set('Cache-Control','no-store');next()};
async function configuredShipping(governorate) {
  const result = shippingFeeFromSettings(governorate, await loadStoreSettings());
  if (result.error === 'INVALID_GOVERNORATE') throw new CommerceError('Select a governorate.', 'INVALID_GOVERNORATE');
  if (result.error) throw new CommerceError('Shipping rates are not configured yet.', 'SHIPPING_UNAVAILABLE', 503);
  return result.amount;
}
const fail = (error,_req,res,next) => error instanceof CommerceError?res.status(error.status).json({code:error.code,error:error.message}):next(error);
const validId = v => typeof v==='string' && /^[0-9a-f]{24}$/i.test(v);

const loadLines = items => loadCartLines(items, { Product, Category });
const publicLine = line=>({productId:String(line.productId),slug:line.slug,name:line.name,imageUrl:imageUrl(line.imageKey),grindCode:line.grindCode,packGrams:line.packGrams,quantity:line.quantity,unitPricePiastres:line.unitPricePiastres,lineTotalPiastres:line.lineTotalPiastres});
const rejectionReason = order => order.paymentState==='rejected' ? [...(order.paymentHistory||[])].reverse().find(entry=>entry.state==='rejected')?.reason || '' : '';
const orderSummary = order => ({id:String(order._id),orderNumber:order.orderNumber,createdAt:order.createdAt,fulfillmentState:order.fulfillmentState,paymentMethod:order.paymentMethod,paymentState:order.paymentState,subtotalPiastres:order.subtotalPiastres,shippingPiastres:order.shippingPiastres,totalPiastres:order.totalPiastres,lines:order.lines.map(publicLine),history:(order.history||[]).map(h=>({status:h.status,at:h.at})),paymentProofSubmitted:order.paymentState==='awaiting_verification'||order.paymentState==='paid',paymentRejectionReason:rejectionReason(order),revision:order.revision});
const adminSummary = order => ({...orderSummary(order),customer:order.customer,userId:order.userId?String(order.userId):null,paymentProofId:order.paymentProofId?String(order.paymentProofId):null,paymentHistory:(order.paymentHistory||[]).map(h=>({state:h.state,at:h.at,reason:h.reason}))});
// Fail closed before database/session work, even when the environment flag is true.
commerceRoutes.post('/checkout',noCache,(_req,res,next)=>{
  if(!ORDERING_IMPLEMENTED || process.env.CHECKOUT_ENABLED!=='true')return res.status(503).json({code:'CHECKOUT_DISABLED',error:'Checkout is not open yet.'});
  next();
});
commerceRoutes.use(noCache,db,loadUser);
commerceRoutes.get('/config',run(async(_req,res)=>{
  const settings=await loadStoreSettings();
  res.json({checkoutEnabled:ORDERING_IMPLEMENTED && process.env.CHECKOUT_ENABLED==='true',paymentMethods:Object.entries(settings.payments).filter(([,v])=>v.enabled).map(([method])=>method),paymentInstructions:publicStoreSettings(settings).payments});
}));
commerceRoutes.post('/cart',rateLimit({limit:120}),run(async(req,res)=>{
  if (!Array.isArray(req.body?.items)) throw new CommerceError('Invalid cart.');
  if (!req.body.items.length) return res.json({items:[],subtotalPiastres:0});
  const items=validateItems(req.body.items);
  const lines=await loadLines(items);
  const products=lines.map(({product,quantity,grindCode,sizeGrams},index)=>{
    const size=product?.sizes?.find(s=>s.grams===sizeGrams);
    const variant=size?.grindOptions?.find(g=>g.code===grindCode);
    return {productId:items[index].productId,grindCode,sizeGrams,quantity,slug:product?.slug||'',
      name:product?.name||{en:'Unavailable'},imageUrl:imageUrl(product?.imageKeys?.[0]),
      pricePiastres:size?.pricePiastres||0,stockQuantity:variant?.stockQuantity||0,
      available:Boolean(product?.status==='published'&&variant)};
  });
  res.json({items:products,subtotalPiastres:products.reduce((sum,p)=>sum+(p.available?p.pricePiastres*p.quantity:0),0)});
}));
commerceRoutes.post('/quote',rateLimit({limit:100}),run(async(req,res)=>{
  const items=validateItems(req.body?.items);
  const governorate=req.body?.governorate;
  const shippingPiastres=await configuredShipping(governorate);
  const entries=await loadLines(items);
  const {lines,subtotalPiastres}=lineTotals(entries);
  const totalPiastres=subtotalPiastres+shippingPiastres;
  if (!Number.isSafeInteger(totalPiastres)||totalPiastres>1_000_000_000) throw new CommerceError('Order total exceeds the allowed limit.');
  res.json({items:lines.map(publicLine),subtotalPiastres,shippingPiastres,totalPiastres,checkoutEnabled:ORDERING_IMPLEMENTED && process.env.CHECKOUT_ENABLED==='true'});
}));
commerceRoutes.post('/checkout',rateLimit({limit:10,windowMs:60*60*1000}),run(async(req,res)=>{
  if(req.authUser?.role==='admin')return res.status(403).json({code:'FORBIDDEN',error:'Admins cannot place storefront orders.'});
  const data=validateCheckout(req.body);
  const configured=await loadStoreSettings();
  const shipping=shippingFeeFromSettings(data.customer.governorate,configured);
  const result=await orderService.checkout(data,{userId:req.authUser?.role==='customer'?req.authUser._id:null,
    shippingPiastres:shipping.error?undefined:shipping.amount,paymentEnabled:Boolean(configured.payments?.[data.paymentMethod]?.enabled)});
  res.status(result.created?201:200).json({order:orderSummary(result.order),...(result.recovered?{recovered:true}:{})});
}));
commerceRoutes.post('/track',rateLimit({limit:8,windowMs:15*60*1000}),run(async(req,res)=>{
  const number=req.body?.orderNumber;
  if(typeof number!=='string'||!/^QC-[A-F0-9]{12}$/.test(number))throw new CommerceError('Enter the order number and checkout phone.','INVALID_LOOKUP');
  const phone=phoneNumber(req.body?.phone);
  const order=await Order.findOne({orderNumber:number,'customer.phone':phone}).lean();
  if(!order)return res.status(404).json({code:'NOT_FOUND',error:'No matching order was found.'});
  const {orderNumber,createdAt,fulfillmentState,paymentState,paymentMethod,history}=order;
  res.json({order:{orderNumber,createdAt,fulfillmentState,paymentState,paymentMethod,paymentRejectionReason:rejectionReason(order),history:history.map(({status,at})=>({status,at}))}});
}));
commerceRoutes.get('/my-orders',requireRole('customer'),run(async(req,res)=>{
  const page=Number(req.query.page||1);
  if(!Number.isSafeInteger(page)||page<1||page>1000)throw new CommerceError('Invalid page.');
  const filter={userId:req.authUser._id};
  const [items,total]=await Promise.all([Order.find(filter).sort({createdAt:-1,_id:-1}).skip((page-1)*20).limit(20).lean(),Order.countDocuments(filter)]);
  res.json({items:items.map(orderSummary),pagination:{page,limit:20,total,pages:Math.ceil(total/20)}});
}));
commerceRoutes.use(fail);

adminOrdersRoutes.use(noCache,db,loadUser,requireRole('admin'));
adminOrdersRoutes.get('/',run(async(req,res)=>{
  const page=Number(req.query.page||1);
  if(!Number.isSafeInteger(page)||page<1||page>1000)throw new CommerceError('Invalid page.');
  let filter;
  try { filter=orderQueueFilter(req.query.queue); }
  catch(error) { if(error instanceof OverviewInputError) throw new CommerceError(error.message,'INVALID_ORDER_QUEUE'); throw error; }
  if(req.query.status){if(!['received','confirmed','packing','shipped','delivered','cancelled'].includes(req.query.status))throw new CommerceError('Invalid status.');const selected={fulfillmentState:req.query.status};filter=Object.keys(filter).length?{$and:[filter,selected]}:selected;}
  const [items,total]=await Promise.all([Order.find(filter).sort({createdAt:-1,_id:-1}).skip((page-1)*20).limit(20).lean(),Order.countDocuments(filter)]);
  res.json({items:items.map(adminSummary),pagination:{page,limit:20,total,pages:Math.ceil(total/20)}});
}));
adminOrdersRoutes.get('/:id',run(async(req,res)=>{
  if(!validId(req.params.id))return res.status(404).json({code:'NOT_FOUND',error:'Order not found.'});
  const order=await Order.findById(req.params.id).lean();
  if(!order)return res.status(404).json({code:'NOT_FOUND',error:'Order not found.'});
  res.json({order:adminSummary(order)});
}));
adminOrdersRoutes.patch('/:id/status',run(async(req,res)=>{
  if(!validId(req.params.id))return res.status(404).json({code:'NOT_FOUND',error:'Order not found.'});
  if(!req.body||Object.keys(req.body).some(k=>!['revision','status'].includes(k))||!Number.isSafeInteger(req.body.revision)||req.body.revision<0)throw new CommerceError('Revision and status are required.');
  const result=await orderService.transitionOrder({id:req.params.id,revision:req.body.revision,status:req.body.status,by:req.authUser._id});
  res.json({order:adminSummary(result.order)});
}));
adminOrdersRoutes.use(fail);
