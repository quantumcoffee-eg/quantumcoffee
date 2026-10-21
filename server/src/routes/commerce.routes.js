import { Router } from 'express';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { imageUrl } from '../media/config.js';
import { databaseReady } from '../db/connect.js';
import { loadUser, requireRole } from '../security/session.js';
import { rateLimit } from '../security/rate-limit.js';
import { queueOrderMailSafely } from '../notifications/order-mail.js';
import { CommerceError, validateItems, validateCheckout, validateCustomer, shippingAmount, lineTotals, fingerprint, newOrderNumber, statusTransition, phoneNumber, ORDERING_IMPLEMENTED } from '../commerce/checkout.js';

export const commerceRoutes = Router();
export const adminOrdersRoutes = Router();
const run = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const db = (_req,res,next) => databaseReady()?next():res.status(503).json({code:'SERVICE_UNAVAILABLE',error:'Order service requires Quantum Coffee MongoDB.'});
const noCache = (_req,res,next) => {res.set('Cache-Control','no-store');next()};
const fail = (error,_req,res,next) => error instanceof CommerceError?res.status(error.status).json({code:error.code,error:error.message}):next(error);
const validId = v => typeof v==='string' && /^[0-9a-f]{24}$/i.test(v);

async function loadLines(items, session) {
  const products = await Product.find({_id:{$in:items.map(x=>x.productId)}}).session(session||null).lean();
  const categories = await Category.find({_id:{$in:products.map(x=>x.categoryId)},active:true}).select('_id').session(session||null).lean();
  const allowed = new Set(categories.map(c=>String(c._id)));
  const lookup = new Map(products.filter(p=>allowed.has(String(p.categoryId))).map(p=>[String(p._id),p]));
  return items.map(item=>({product:lookup.get(item.productId),quantity:item.quantity}));
}
const publicLine = line=>({productId:String(line.productId),slug:line.slug,name:line.name,imageUrl:imageUrl(line.imageKey),quantity:line.quantity,unitPricePiastres:line.unitPricePiastres,lineTotalPiastres:line.lineTotalPiastres});
const rejectionReason = order => order.paymentState==='rejected' ? [...(order.paymentHistory||[])].reverse().find(entry=>entry.state==='rejected')?.reason || '' : '';
const orderSummary = order => ({id:String(order._id),orderNumber:order.orderNumber,createdAt:order.createdAt,fulfillmentState:order.fulfillmentState,paymentMethod:order.paymentMethod,paymentState:order.paymentState,subtotalPiastres:order.subtotalPiastres,shippingPiastres:order.shippingPiastres,totalPiastres:order.totalPiastres,lines:order.lines.map(publicLine),history:(order.history||[]).map(h=>({status:h.status,at:h.at})),paymentProofSubmitted:order.paymentState==='awaiting_verification'||order.paymentState==='paid',paymentRejectionReason:rejectionReason(order),revision:order.revision});
const adminSummary = order => ({...orderSummary(order),customer:order.customer,userId:order.userId?String(order.userId):null,paymentProofId:order.paymentProofId?String(order.paymentProofId):null,paymentHistory:(order.paymentHistory||[]).map(h=>({state:h.state,at:h.at,reason:h.reason}))});
commerceRoutes.use(noCache,db,loadUser);
commerceRoutes.get('/config',(_req,res)=>res.json({checkoutEnabled:ORDERING_IMPLEMENTED && process.env.CHECKOUT_ENABLED==='true',paymentMethods:['cod','instapay','vodafone_cash']}));
commerceRoutes.post('/cart',rateLimit({limit:120}),run(async(req,res)=>{
  if (!Array.isArray(req.body?.items)) throw new CommerceError('Invalid cart.');
  if (!req.body.items.length) return res.json({items:[],subtotalPiastres:0});
  const items=validateItems(req.body.items);
  const lines=await loadLines(items);
  const products=lines.map(({product,quantity},index)=>({
    productId:items[index].productId,quantity,slug:product?.slug||'',name:product?.name||{en:'Unavailable'},
    imageUrl:imageUrl(product?.imageKeys?.[0]),pricePiastres:product?.pricePiastres||0,
    stockQuantity:product?.stockQuantity||0,available:Boolean(product?.status==='published')
  }));
  res.json({items:products,subtotalPiastres:products.reduce((sum,p)=>sum+(p.available?p.pricePiastres*p.quantity:0),0)});
}));
commerceRoutes.post('/quote',rateLimit({limit:100}),run(async(req,res)=>{
  const items=validateItems(req.body?.items);
  const governorate=req.body?.governorate;
  const shippingPiastres=shippingAmount(governorate);
  const entries=await loadLines(items);
  const {lines,subtotalPiastres}=lineTotals(entries);
  const totalPiastres=subtotalPiastres+shippingPiastres;
  if (!Number.isSafeInteger(totalPiastres)||totalPiastres>1_000_000_000) throw new CommerceError('Order total exceeds the allowed limit.');
  res.json({items:lines.map(publicLine),subtotalPiastres,shippingPiastres,totalPiastres,checkoutEnabled:ORDERING_IMPLEMENTED && process.env.CHECKOUT_ENABLED==='true'});
}));
commerceRoutes.post('/checkout',rateLimit({limit:10,windowMs:60*60*1000}),run(async(req,res)=>{
  if(!ORDERING_IMPLEMENTED || process.env.CHECKOUT_ENABLED!=='true') return res.status(503).json({code:'CHECKOUT_DISABLED',error:'Checkout is not open yet.'});
  if(req.authUser?.role==='admin')return res.status(403).json({code:'FORBIDDEN',error:'Admins cannot place storefront orders.'});
  const data=validateCheckout(req.body);
  const requestFingerprint=fingerprint(data);
  const existing=await Order.findOne({checkoutKey:data.checkoutKey}).lean();
  if(existing){
    if(existing.requestFingerprint!==requestFingerprint)throw new CommerceError('Checkout reference was already used.', 'CHECKOUT_CONFLICT', 409);
    await queueOrderMailSafely('placed',existing);
    return res.json({order:orderSummary(existing),recovered:true});
  }
  const shippingPiastres=shippingAmount(data.customer.governorate);
  let saved;
  try {
    await mongoose.connection.transaction(async session=>{
      const prior=await Order.findOne({checkoutKey:data.checkoutKey}).session(session).lean();
      if(prior){if(prior.requestFingerprint!==requestFingerprint)throw new CommerceError('Checkout reference was already used.','CHECKOUT_CONFLICT',409);saved=prior;return;}
      const entries=await loadLines(data.items,session);
      const {lines,subtotalPiastres}=lineTotals(entries);
      const totalPiastres=subtotalPiastres+shippingPiastres;
      if (!Number.isSafeInteger(totalPiastres)||totalPiastres>1_000_000_000)throw new CommerceError('Order total exceeds the allowed limit.');
      for(const item of lines){
        const updated=await Product.updateOne({_id:item.productId,status:'published',stockQuantity:{$gte:item.quantity}},{$inc:{stockQuantity:-item.quantity,revision:1}},{session});
        if(updated.modifiedCount!==1)throw new CommerceError('Stock changed during checkout. Refresh the cart.','OUT_OF_STOCK',409);
      }
      const paymentState=data.paymentMethod==='cod'?'unpaid':'awaiting_transfer';
      const [order]=await Order.create([{orderNumber:newOrderNumber(),checkoutKey:data.checkoutKey,requestFingerprint,
        userId:req.authUser?.role==='customer'?req.authUser._id:null,customer:data.customer,lines,subtotalPiastres,shippingPiastres,totalPiastres,
        paymentMethod:data.paymentMethod,paymentState,fulfillmentState:'received',history:[{status:'received',at:new Date()}]}],{session});
      saved=order.toObject();
    });
  }catch(error){
    if(error?.code===11000){const prior=await Order.findOne({checkoutKey:data.checkoutKey}).lean();if(prior&&prior.requestFingerprint===requestFingerprint){await queueOrderMailSafely('placed',prior);return res.json({order:orderSummary(prior),recovered:true});}}
    throw error;
  }
  await queueOrderMailSafely('placed',saved);
  res.status(201).json({order:orderSummary(saved)});
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
  const filter={};
  if(req.query.status){if(!['received','confirmed','packing','shipped','delivered','cancelled'].includes(req.query.status))throw new CommerceError('Invalid status.');filter.fulfillmentState=req.query.status;}
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
  const order=await Order.findById(req.params.id).lean();
  if(!order)return res.status(404).json({code:'NOT_FOUND',error:'Order not found.'});
  if(order.revision!==req.body.revision)throw new CommerceError('Order changed. Reload first.','EDIT_CONFLICT',409);
  const next=statusTransition(order.fulfillmentState,req.body.status);
  if(['packing','shipped'].includes(next)&&order.paymentMethod!=='cod'&&order.paymentState!=='paid')throw new CommerceError('Digital payments must be verified before fulfillment.','PAYMENT_REQUIRED',409);
  if(next==='cancelled'&&order.paymentState==='paid')throw new CommerceError('Paid orders require a separate refund procedure.','REFUND_REQUIRED',409);
  const now=new Date();
  let updated;
  if(next==='cancelled'){
    await mongoose.connection.transaction(async session=>{
      updated=await Order.findOneAndUpdate({_id:order._id,revision:order.revision},{$set:{fulfillmentState:next},$inc:{revision:1},$push:{history:{status:next,at:now,by:req.authUser._id}}},{new:true,session,runValidators:true});
      if(!updated)throw new CommerceError('Order changed. Reload first.','EDIT_CONFLICT',409);
      for(const line of order.lines)await Product.updateOne({_id:line.productId},{$inc:{stockQuantity:line.quantity,revision:1}},{session});
    });
  }else{
    updated=await Order.findOneAndUpdate({_id:order._id,revision:order.revision},{$set:{fulfillmentState:next},$inc:{revision:1},$push:{history:{status:next,at:now,by:req.authUser._id}}},{new:true,runValidators:true});
    if(!updated)throw new CommerceError('Order changed. Reload first.','EDIT_CONFLICT',409);
  }
  await queueOrderMailSafely('fulfillment',updated.toObject());
  res.json({order:adminSummary(updated.toObject())});
}));
adminOrdersRoutes.use(fail);
