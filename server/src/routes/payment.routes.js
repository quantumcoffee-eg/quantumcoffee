import {Router} from 'express';
import Order from '../models/Order.js';
import PaymentProof from '../models/PaymentProof.js';
import {databaseReady} from '../db/connect.js';
import {loadUser,requireRole} from '../security/session.js';
import {rateLimit} from '../security/rate-limit.js';
import {CommerceError, phoneNumber} from '../commerce/checkout.js';
import {proofIntent,proofConfirmation,proofDecision,correctProofSignature,proofEligible,verifiedProofKey} from '../payments/proof.js';
import {paymentService} from '../commerce/payment-service.js';
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
  const proof=await paymentService.reserveProofUpload({orderId:order._id,...intent});
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
  if(proof.state==='submitted' && String(order.paymentProofId)===String(proof._id)){
    const result=await paymentService.confirmProof({orderId:order._id,proofId:proof._id,frozenKey:proof.verifiedKey});
    return res.json({order:receiptState(result.order),recovered:true});
  }
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
  const result=await paymentService.confirmProof({orderId:order._id,proofId:proof._id,frozenKey});
  res.json({order:receiptState(result.order),...(result.recovered?{recovered:true}:{})});
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
  const result=await paymentService.reviewPayment({orderId:req.params.id,...decision,by:req.authUser._id});
  res.json({paymentState:result.order.paymentState,revision:result.order.revision});
}));
adminPaymentRoutes.use(errorHandler);
