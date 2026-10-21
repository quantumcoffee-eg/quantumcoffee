// Private payment evidence must never use the public R2 bucket or a public media URL.
import { validProofKey } from './proof.js';

export function privateR2Ready(env=process.env) {
  return ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_PRIVATE_BUCKET'].every(k=>Boolean(env[k]?.trim())) &&
    (!env.R2_PUBLIC_BUCKET || env.R2_PRIVATE_BUCKET!==env.R2_PUBLIC_BUCKET);
}
async function connection() {
  if (!privateR2Ready()) throw Object.assign(new Error('Quantum Coffee private R2 bucket is not configured.'),{status:503,code:'PROOF_UNAVAILABLE'});
  const sdk=await import('@aws-sdk/client-s3');
  const client=new sdk.S3Client({region:'auto',endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle:true,requestChecksumCalculation:'WHEN_REQUIRED',
    credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
  return {sdk,client,bucket:process.env.R2_PRIVATE_BUCKET};
}
export async function proofUploadUrl(key,contentType) {
  if (!validProofKey(key)) throw new Error('Invalid private object key.');
  const [{sdk,client,bucket},{getSignedUrl}]=await Promise.all([connection(),import('@aws-sdk/s3-request-presigner')]);
  const command=new sdk.PutObjectCommand({Bucket:bucket,Key:key,ContentType:contentType});
  return getSignedUrl(client,command,{expiresIn:90,signableHeaders:new Set(['content-type'])});
}
export async function inspectProof(key) {
  if (!validProofKey(key)) throw new Error('Invalid private object key.');
  const {sdk,client,bucket}=await connection();
  const head=await client.send(new sdk.HeadObjectCommand({Bucket:bucket,Key:key}));
  const object=await client.send(new sdk.GetObjectCommand({Bucket:bucket,Key:key,Range:'bytes=0-31'}));
  return {size:head.ContentLength,contentType:head.ContentType,bytes:await object.Body.transformToByteArray()};
}
export async function freezeProof(uploadKey,verifiedKey) {
  if (!validProofKey(uploadKey) || !uploadKey.startsWith('payment-proofs/uploads/') ||
      !validProofKey(verifiedKey) || !verifiedKey.startsWith('payment-proofs/verified/')) throw new Error('Invalid proof copy operation.');
  const {sdk,client,bucket}=await connection();
  await client.send(new sdk.CopyObjectCommand({Bucket:bucket,Key:verifiedKey,CopySource:`${bucket}/${uploadKey}`}));
}
export async function privateProofViewUrl(key) {
  if (!validProofKey(key)) throw new Error('Invalid private object key.');
  const [{sdk,client,bucket},{getSignedUrl}]=await Promise.all([connection(),import('@aws-sdk/s3-request-presigner')]);
  const command=new sdk.GetObjectCommand({Bucket:bucket,Key:key,ResponseCacheControl:'no-store'});
  return getSignedUrl(client,command,{expiresIn:60});
}
