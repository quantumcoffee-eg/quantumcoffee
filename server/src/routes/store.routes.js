import { Router } from 'express';
import StoreSettings from '../models/StoreSettings.js';
import { defaultStoreSettings, editableStoreSettings, publicStoreSettings, StoreSettingsError, validateStoreSettings } from '../store/settings-values.js';
import { databaseReady } from '../db/connect.js';
import { loadUser, requireRole } from '../security/session.js';
import { rateLimit } from '../security/rate-limit.js';

export const publicStoreRoutes = Router();
export const adminStoreRoutes = Router();
const key = 'quantum-storefront';
const run = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const db = (_req,res,next) => databaseReady() ? next() : res.status(503).json({error:'Store settings unavailable.',code:'SERVICE_UNAVAILABLE'});
export const loadStoreSettings = async () => await StoreSettings.findById(key).lean() || defaultStoreSettings();

publicStoreRoutes.use(db);
publicStoreRoutes.get('/settings',run(async(_req,res)=>{
  // This endpoint includes payment/shipping configuration, beyond the narrow
  // contact/policy projection cached by the storefront for 30 seconds.
  res.set('Cache-Control','no-store');
  res.json({ settings:publicStoreSettings(await loadStoreSettings()) });
}));
adminStoreRoutes.use(db,loadUser,requireRole('admin'));
adminStoreRoutes.get('/settings',run(async(_req,res)=>{
  res.set('Cache-Control','no-store');
  const found=await StoreSettings.findById(key).lean();
  res.json({ settings:editableStoreSettings(found), revision:found?.revision || 0 });
}));
adminStoreRoutes.put('/settings',rateLimit({limit:30,windowMs:60*60*1000}),run(async(req,res)=>{
  const {revision,settings}=req.body || {};
  if (!Number.isSafeInteger(revision) || revision < 0 || Object.keys(req.body||{}).some(k=>!['revision','settings'].includes(k))) throw new StoreSettingsError('Valid revision and settings required.');
  const normalized=validateStoreSettings(settings);
  // CAS upsert for the initial save: do not silently overwrite another admin.
  let saved;
  if (revision === 0) {
    const existing = await StoreSettings.findOneAndUpdate({_id:key,revision:0},{$set:normalized,$inc:{revision:1}},{new:true,runValidators:true}).lean();
    if (existing) saved=existing;
    else {
      try { saved=(await StoreSettings.create({_id:key,...normalized,revision:1})).toObject(); }
      catch(error) { if(error?.code===11000) return res.status(409).json({code:'EDIT_CONFLICT',error:'Settings changed. Reload first.'}); throw error; }
    }
  } else {
    saved=await StoreSettings.findOneAndUpdate({_id:key,revision},{$set:normalized,$inc:{revision:1}},{new:true,runValidators:true}).lean();
  }
  if(!saved)return res.status(409).json({code:'EDIT_CONFLICT',error:'Settings changed. Reload first.'});
  res.set('Cache-Control','no-store');
  res.json({settings:editableStoreSettings(saved),revision:saved.revision});
}));
const errors=(error,_req,res,next)=>error instanceof StoreSettingsError ? res.status(error.status).json({error:error.message,code:error.code}):next(error);
adminStoreRoutes.use(errors);
