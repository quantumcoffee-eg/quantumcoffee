import {Router} from 'express';
import {queueOrderMailSafely} from '../notifications/order-mail.js';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import PaymentProof from '../models/PaymentProof.js';
import {databaseReady} from '../db/connect.js';
import {loadUser,requireRole} from '../security/session.js';
import {rateLimit} from '../security/rate-limit.js';
import {CommerceError, phoneNumber} from '../commerce/checkout.js';
import {proofIntent,proofConfirmation,proofDecision,proofKey,correctProofSignature,proofEligible,verifiedProofKey,PROOF_WINDOW_MS} from '../payments/proof.js';
import {privateR2Ready,proofUploadUrl,inspectProof,freezeProof,privateProofViewUrl} from '../payments/private-r2.js';

export const paymentRoutes=Router();
export const adminPaymentRoutes=Router();
const run=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const noCache=(_req,res,next)=>{res.set('Cache-Control','no-store');next()};
const db=(_req,res,next)=>databaseReady()?next():res.status(503).json({code:'SERVICE_UNAVAILABLE',error:'Order service is not configured.'});
const validId=id=>typeof id==='string' && /^[0-9a-f]{24}$/i.test(id);
const storage=(_req,res,next)=>privateR2Ready()?next():res.status(503).json({code:'PROOF_UNAVAILABLE',error:'Private payment storage is not configured.'});
const errorHandler=(err,_req,res,next)=>err instanceof CommerceError?res.status(err.status).json({code:err.code,error:err.message}):next(err);
const invalidOrder=()=>new CommerceError('Order is not available for payment proof submission.','ORDER_NOT_FOUND',404);
async function findAuthorizedOrder(req,orderNumber,phone){
  const order=await Order.findOne({orderNumber}).lean();
  if(!order)throw invalidOrder();
  const customer=req.authUser?.role==='customer' && order.userId && String(order.userId)===String(req.authUser._id);
  let guest=false;
  if(!customer){
    // Never disclose whether a reference exists to someone without the checkout phone.
    try{guest=typeof phone==='string' && phoneNumber(phone)===order.customer.phone}catch{guest=false}
  }
  if(!customer&&!guest)throw invalidOrder();
  return order;
}
function receiptState(order){return {orderNumber:order.orderNumber,paymentState:order.paymentState,revision:order.revision}}

paymentRoutes.use(noCache,db,loadUser);
paymentRoutes.post('/intent',rateLimit({limit:8,windowMs:15*60*1000}),storage,run(async(req,res)=>{
  const intent=proofIntent(req.body);
  const order=await findAuthorizedOrder(req,intent.orderNumber,intent.phone);
  if(!proofEligible(order))throw new CommerceError('This order cannot receive a payment proof right now.','PROOF_NOT_ALLOWED',409);
  const current=await PaymentProof.countDocuments({orderId:order._id,createdAt:{$gte:new Date(Date.now()-24*60*60*1000)}});
  if(current>=5)throw new CommerceError('Too many uploads for this order. Contact the shop.','PROOF_LIMIT',429);
  if(await PaymentProof.exists({orderId:order._id,state:'pending',expiresAt:{$gt:new Date()}}))
    throw new CommerceError('A recent upload is still pending. Finish it or try again in a few minutes.','PROOF_PENDING',409);
  const proof=await PaymentProof.create({orderId:order._id,key:proofKey(intent.extension),contentType:intent.contentType,size:intent.size,expiresAt:new Date(Date.now()+PROOF_WINDOW_MS)});
  try{
    const uploadUrl=await proofUploadUrl(proof.key,proof.contentType);
    res.status(201).json({proofId:String(proof._id),uploadUrl,headers:{'Content-Type':proof.contentType},expiresIn:90});
  }catch(error){await PaymentProof.deleteOne({_id:proof._id,state:'pending'});throw error}
}));
paymentRoutes.post('/:id/confirm',rateLimit({limit:12,windowMs:15*60*1000}),storage,run(async(req,res)=>{
  if(!validId(req.params.id))throw new CommerceError('Upload not found.','PROOF_NOT_FOUND',404);
  const lookup=proofConfirmation(req.body);
  const order=await findAuthorizedOrder(req,lookup.orderNumber,lookup.phone);
  const proof=await PaymentProof.findOne({_id:req.params.id,orderId:order._id}).lean();
  if(!proof)throw new CommerceError('Upload not found.','PROOF_NOT_FOUND',404);
  if(proof.state==='submitted' && String(order.paymentProofId)===String(proof._id))return res.json({order:receiptState(order),recovered:true});
  if(!proofEligible(order))throw new CommerceError('This order cannot receive payment proof right now.','PROOF_NOT_ALLOWED',409);
  if(proof.state!=='pending'||proof.expiresAt<=new Date())throw new CommerceError('Upload expired. Start another upload.','PROOF_EXPIRED',410);
  let object;
  try{object=await inspectProof(proof.key)}catch(error){
    if(error?.$metadata?.httpStatusCode===404||error?.name==='NoSuchKey')throw new CommerceError('File upload is not complete.','PROOF_MISSING',409);
    throw error;
  }
  if(object.size!==proof.size || object.contentType!==proof.contentType || !correctProofSignature(proof.contentType,object.bytes))
    throw new CommerceError('The screenshot does not match the expected format or size.','PROOF_INVALID');
  // Freeze an immutable copy. The customer's original signed PUT may be replayed
  // before its 90-second expiry; admin must never view that mutable upload key.
  const frozenKey=verifiedProofKey(proof.key);
  await freezeProof(proof.key,frozenKey);
  const frozen=await inspectProof(frozenKey);
  if(frozen.size!==proof.size || frozen.contentType!==proof.contentType || !correctProofSignature(proof.contentType,frozen.bytes))
    throw new CommerceError('The final screenshot failed verification.','PROOF_INVALID');
  let result;
  await mongoose.connection.transaction(async session=>{
    const now=new Date();
    const updated=await Order.findOneAndUpdate({_id:order._id,revision:order.revision,paymentState:{$in:['awaiting_transfer','rejected']},fulfillmentState:{$nin:['cancelled','delivered']}},
      {$set:{paymentState:'awaiting_verification',paymentProofId:proof._id},$inc:{revision:1},$push:{paymentHistory:{state:'awaiting_verification',at:now}}},
      {new:true,session,runValidators:true});
    if(!updated)throw new CommerceError('Order payment status changed. Please refresh.','PAYMENT_CONFLICT',409);
    const claimed=await PaymentProof.findOneAndUpdate({_id:proof._id,orderId:order._id,state:'pending',expiresAt:{$gt:now}},
      {$set:{state:'submitted',submittedAt:now,verifiedKey:frozenKey}},{session,new:true});
    if(!claimed)throw new CommerceError('The proof was already processed.','PROOF_CONFLICT',409);
    result=updated;
  });
  await queueOrderMailSafely('proof_submitted',result.toObject());
  res.json({order:receiptState(result)});
}));
paymentRoutes.use(errorHandler);

adminPaymentRoutes.use(noCache,db,loadUser,requireRole('admin'));
adminPaymentRoutes.get('/:id/proof',storage,run(async(req,res)=>{
  if(!validId(req.params.id))throw new CommerceError('Order not found.','NOT_FOUND',404);
  const order=await Order.findById(req.params.id).lean();
  if(!order||!order.paymentProofId)throw new CommerceError('No submitted payment proof.','PROOF_NOT_FOUND',404);
  const proof=await PaymentProof.findOne({_id:order.paymentProofId,orderId:order._id,state:{$in:['submitted','approved','rejected']}}).lean();
  if(!proof?.verifiedKey)throw new CommerceError('Payment proof not available.','PROOF_NOT_FOUND',404);
  res.json({url:await privateProofViewUrl(proof.verifiedKey),expiresIn:60,contentType:proof.contentType});
}));
adminPaymentRoutes.patch('/:id/review',run(async(req,res)=>{
  if(!validId(req.params.id))throw new CommerceError('Order not found.','NOT_FOUND',404);
  const decision=proofDecision(req.body);
  const order=await Order.findById(req.params.id).lean();
  if(!order)throw new CommerceError('Order not found.','NOT_FOUND',404);
  if(order.revision!==decision.revision)throw new CommerceError('Order changed. Reload before reviewing.','EDIT_CONFLICT',409);
  // COD can be marked paid after delivery without any screenshot.
  if(order.paymentMethod==='cod'){
    if(decision.decision!=='approve'||order.paymentState!=='unpaid'||order.fulfillmentState!=='delivered')
      throw new CommerceError('COD can be marked paid only after delivery.','PAYMENT_NOT_ALLOWED',409);
    const updated=await Order.findOneAndUpdate({_id:order._id,revision:order.revision,paymentState:'unpaid',fulfillmentState:'delivered'},
      {$set:{paymentState:'paid'},$inc:{revision:1},$push:{paymentHistory:{state:'paid',at:new Date(),by:req.authUser._id}}},
      {new:true,runValidators:true});
    if(!updated)throw new CommerceError('Order changed. Reload.','EDIT_CONFLICT',409);
    await queueOrderMailSafely('payment',updated.toObject());
    return res.json({paymentState:updated.paymentState,revision:updated.revision});
  }
  if(order.paymentState!=='awaiting_verification'||!order.paymentProofId)
    throw new CommerceError('No payment proof is awaiting verification.','PAYMENT_NOT_ALLOWED',409);
  if(order.fulfillmentState==='cancelled')throw new CommerceError('Cancelled order cannot be paid.','PAYMENT_NOT_ALLOWED',409);
  const next=decision.decision==='approve'?'paid':'rejected';
  let result;
  await mongoose.connection.transaction(async session=>{
    const now=new Date();
    const updated=await Order.findOneAndUpdate({_id:order._id,revision:order.revision,paymentState:'awaiting_verification',paymentProofId:order.paymentProofId},
      {$set:{paymentState:next},$inc:{revision:1},$push:{paymentHistory:{state:next,at:now,by:req.authUser._id,reason:decision.reason}}},
      {new:true,session,runValidators:true});
    if(!updated)throw new CommerceError('Order changed. Reload.','EDIT_CONFLICT',409);
    const verified=await PaymentProof.findOneAndUpdate({_id:order.paymentProofId,orderId:order._id,state:'submitted'},
      {$set:{state:decision.decision==='approve'?'approved':'rejected',reviewedBy:req.authUser._id,reviewedAt:now,reason:decision.reason}},
      {new:true,session});
    if(!verified)throw new CommerceError('Proof changed. Reload.','PAYMENT_CONFLICT',409);
    result=updated;
  });
  await queueOrderMailSafely('payment',result.toObject());
  res.json({paymentState:result.paymentState,revision:result.revision});
}));
adminPaymentRoutes.use(errorHandler);
