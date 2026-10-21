import { randomBytes } from 'node:crypto';
import { CommerceError } from '../commerce/checkout.js';

export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_TYPES = Object.freeze({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' });
export const PROOF_WINDOW_MS = 15 * 60 * 1000;
const PROOF_KEY = /^payment-proofs\/(?:uploads|verified)\/[a-f0-9]{40}\.(?:jpg|png|webp)$/;
export const validProofKey = key => typeof key === 'string' && PROOF_KEY.test(key);
export function proofIntent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
    Object.keys(body).some(k=>!['orderNumber','phone','contentType','size'].includes(k)))
    throw new CommerceError('Invalid payment proof request.', 'INVALID_PROOF');
  if (typeof body.orderNumber !== 'string' || !/^QC-[A-F0-9]{12}$/.test(body.orderNumber))
    throw new CommerceError('Invalid order reference.', 'INVALID_PROOF');
  const ext = PROOF_TYPES[body.contentType];
  if (!ext || !Number.isSafeInteger(body.size) || body.size < 1 || body.size > PROOF_MAX_BYTES)
    throw new CommerceError('Upload a JPG, PNG or WebP screenshot up to 5 MB.', 'INVALID_PROOF');
  return {orderNumber:body.orderNumber,phone:body.phone,contentType:body.contentType,size:body.size,extension:ext};
}
export function proofConfirmation(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k=>!['orderNumber','phone'].includes(k)) ||
    typeof body.orderNumber !== 'string' || !/^QC-[A-F0-9]{12}$/.test(body.orderNumber))
    throw new CommerceError('Invalid proof confirmation.', 'INVALID_PROOF');
  return {orderNumber:body.orderNumber,phone:body.phone};
}
export function proofKey(extension) {
  if (!Object.values(PROOF_TYPES).includes(extension)) throw new CommerceError('Invalid file format.', 'INVALID_PROOF');
  return `payment-proofs/uploads/${randomBytes(20).toString('hex')}.${extension}`;
}
export function verifiedProofKey(uploadKey) {
  if (!validProofKey(uploadKey) || !uploadKey.startsWith('payment-proofs/uploads/')) throw new CommerceError('Invalid upload key.', 'INVALID_PROOF');
  return uploadKey.replace('payment-proofs/uploads/', 'payment-proofs/verified/');
}
export function correctProofSignature(type, bytes) {
  const b=Buffer.from(bytes||[]);
  if (type==='image/jpeg') return b.length>=3 && b[0]===0xff && b[1]===0xd8 && b[2]===0xff;
  if (type==='image/png') return b.length>=8 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (type==='image/webp') return b.length>=12 && b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WEBP';
  return false;
}
export function proofEligible(order) {
  return Boolean(order && ['instapay','vodafone_cash'].includes(order.paymentMethod) &&
    ['awaiting_transfer','rejected'].includes(order.paymentState) &&
    !['cancelled','delivered'].includes(order.fulfillmentState));
}
export function proofDecision(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
    Object.keys(body).some(k=>!['revision','decision','reason'].includes(k)) ||
    !Number.isSafeInteger(body.revision) || body.revision<0 || !['approve','reject'].includes(body.decision) ||
    (body.reason!==undefined && (typeof body.reason!=='string' || body.reason.length>300)))
    throw new CommerceError('Invalid payment review.', 'INVALID_REVIEW');
  const reason=(body.reason||'').trim();
  if (body.decision==='reject' && reason.length<5) throw new CommerceError('Explain why the proof was rejected.', 'INVALID_REVIEW');
  return {revision:body.revision,decision:body.decision,reason};
}
