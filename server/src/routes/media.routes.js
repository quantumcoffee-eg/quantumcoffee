import { Router } from 'express';
import MediaAsset from '../models/MediaAsset.js';
import { loadUser, requireRole } from '../security/session.js';
import { databaseReady } from '../db/connect.js';
import { validateImageIntent, makeImageKey, hasCorrectImageSignature, imageUrl } from '../media/config.js';
import { r2Ready, makeUploadUrl, inspectImage } from '../media/r2.js';
import { rateLimit } from '../security/rate-limit.js';

const router = Router();
const asyncRoute = fn => (req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
router.use((_req,res,next)=>databaseReady()?next():res.status(503).json({code:'SERVICE_UNAVAILABLE',error:'Database unavailable.'}),loadUser,requireRole('admin'));
router.post('/intent',rateLimit({limit:50}),asyncRoute(async (req,res)=> {
  if (!r2Ready()) return res.status(503).json({code:'MEDIA_UNAVAILABLE',error:'Quantum Coffee R2 storage is not connected yet.'});
  let intent;
  try { intent = validateImageIntent(req.body); }
  catch(error){return res.status(400).json({code:'INVALID_IMAGE',error:error.message});}
  const key=makeImageKey(intent.extension);
  const asset=await MediaAsset.create({key, ownerId:req.authUser._id, contentType:intent.contentType, size:intent.size});
  try {
    const url=await makeUploadUrl(key,intent.contentType);
    return res.status(201).json({id:String(asset._id),url, method:'PUT', headers:{'Content-Type':intent.contentType}, expiresIn:90});
  } catch(error) { await MediaAsset.deleteOne({_id:asset._id}); throw error; }
}));
router.post('/:id/confirm',rateLimit({limit:100}),asyncRoute(async (req,res)=> {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({code:'NOT_FOUND',error:'Upload not found.'});
  const asset=await MediaAsset.findOne({_id:req.params.id,ownerId:req.authUser._id});
  if (!asset) return res.status(404).json({code:'NOT_FOUND',error:'Upload not found.'});
  if (asset.state==='verified') return res.json({image:{key:asset.key,url:imageUrl(asset.key)}});
  if (Date.now()-asset.createdAt.getTime()>15*60*1000) return res.status(410).json({code:'UPLOAD_EXPIRED',error:'Upload expired. Start again.'});
  let object;
  try {object=await inspectImage(asset.key)}
  catch(error){if(error?.$metadata?.httpStatusCode===404 || error?.name==='NoSuchKey')return res.status(409).json({code:'UPLOAD_MISSING',error:'Upload has not completed yet.'});throw error;}
  if (object.size !== asset.size || object.contentType !== asset.contentType || !hasCorrectImageSignature(asset.contentType,object.bytes))
    return res.status(400).json({code:'UPLOAD_INVALID',error:'Uploaded image type or size does not match. Start another upload.'});
  asset.state='verified';asset.verifiedAt=new Date();await asset.save();
  res.json({image:{key:asset.key,url:imageUrl(asset.key)}});
}));
export default router;
