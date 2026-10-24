import { Router } from 'express';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import { CatalogInputError, validateCategory, validateProduct } from '../catalog/validation.js';
import { currentSizes } from '../catalog/grinds.js';
import { databaseReady } from '../db/connect.js';
import MediaAsset from '../models/MediaAsset.js';
import { imageUrl, checkVerifiedKeys } from '../media/config.js';
import { loadUser, requireRole } from '../security/session.js';

export const catalogRoutes = Router();
export const adminCatalogRoutes = Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const dbGuard = (_req, res, next) => databaseReady() ? next() : res.status(503).json({ code: 'SERVICE_UNAVAILABLE', error: 'Catalog service is unavailable.' });
const validId = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const dbError = (error, next, res) => {
  if (error instanceof CatalogInputError) return res.status(400).json({ error: error.message, code: error.code });
  if (error?.code === 11000) return res.status(409).json({ error: 'This slug is already in use.', code: 'DUPLICATE_SLUG' });
  next(error);
};
const pageParams = (query) => {
  const page = Number(query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new CatalogInputError('Invalid page.');
  return { page, limit: 20, skip: (page-1)*20 };
};
const response = (items, total, page) => ({ items, pagination: { page, limit: 20, total, pages: Math.ceil(total/20) } });
const revision = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const publicCategory = c => ({ ...c, imageUrl: imageUrl(c.imageKey) });
const adminProduct = p => ({...p,sizes:currentSizes(p),imageUrls:(p.imageKeys||[]).map(imageUrl).filter(Boolean)});
const publicProduct = p => { const {imageKeys, ...safe}=p; const imageUrls=(imageKeys||[]).map(imageUrl).filter(Boolean); return {...safe,sizes:currentSizes(p),imageUrl:imageUrls[0]||null,imageUrls}; };
const needsBody = (req) => req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null;

catalogRoutes.use(dbGuard);
catalogRoutes.get('/categories', asyncRoute(async (_req, res) => {
  const categories = await Category.find({active:true}).sort({sortOrder:1,_id:1}).select('name slug description imageKey').lean();
  res.json({ categories: categories.map(publicCategory) });
}));
catalogRoutes.get('/products', asyncRoute(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const active = await Category.find({active:true}).select('_id slug').lean();
  const allowedIds = req.query.category ? active.filter(c=>c.slug===req.query.category).map(c=>c._id) : active.map(c=>c._id);
  if (req.query.category && (typeof req.query.category !== 'string' || !/^[a-z0-9-]{1,96}$/.test(req.query.category))) throw new CatalogInputError('Invalid category.');
  if (!allowedIds.length) return res.json(response([],0,page));
  const filter = { status:'published', categoryId:{$in:allowedIds} };
  if (req.query.featured !== undefined) {
    if (req.query.featured !== 'true') throw new CatalogInputError('Invalid featured filter.');
    filter.featured=true;
  }
  if (req.query.availability !== undefined) {
    if (req.query.availability !== 'in_stock') throw new CatalogInputError('Invalid availability filter.');
    filter.stockQuantity={$gt:0};
  }
  for (const bound of ['minPrice','maxPrice']) {
    if (req.query[bound] !== undefined) {
      if (typeof req.query[bound] !== 'string' || !/^\d{1,10}$/.test(req.query[bound]) || !Number.isSafeInteger(Number(req.query[bound])) || Number(req.query[bound])>1_000_000_000) throw new CatalogInputError('Invalid price range.');
      filter.pricePiastres ||= {};
      filter.pricePiastres[bound==='minPrice'?'$gte':'$lte']=Number(req.query[bound]);
    }
  }
  if (filter.pricePiastres?.$gte !== undefined && filter.pricePiastres?.$lte !== undefined && filter.pricePiastres.$gte > filter.pricePiastres.$lte) throw new CatalogInputError('Minimum price exceeds maximum price.');
  if (req.query.q) {
    if (typeof req.query.q !== 'string' || req.query.q.trim().length > 100) throw new CatalogInputError('Invalid search query.');
    const escaped = req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    filter.$or = [{ 'name.en': { $regex: escaped, $options:'i' } }, { 'name.ar': { $regex: escaped, $options:'i' } }];
  }
  const sorts = { newest: {createdAt:-1,_id:-1}, price_asc:{pricePiastres:1,_id:1}, price_desc:{pricePiastres:-1,_id:-1}, discover:{featured:-1,createdAt:-1,_id:-1} };
  const sort = req.query.sort || 'discover';
  if (typeof sort !== 'string' || !Object.hasOwn(sorts, sort)) throw new CatalogInputError('Invalid sort order.');
  const [items,total] = await Promise.all([Product.find(filter).sort(sorts[sort]).skip(skip).limit(limit).lean(),Product.countDocuments(filter)]);
  res.setHeader('Cache-Control','public, max-age=30, stale-while-revalidate=60');
  res.json(response(items.map(publicProduct),total,page));
}));
catalogRoutes.get('/products/:slug', asyncRoute(async (req, res) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(req.params.slug)) return res.status(404).json({error:'Not found.'});
  const product=await Product.findOne({slug:req.params.slug,status:'published'}).lean();
  if (!product || !(await Category.exists({_id:product.categoryId,active:true}))) return res.status(404).json({error:'Product not found.',code:'NOT_FOUND'});
  res.setHeader('Cache-Control','public, max-age=30, stale-while-revalidate=60');
  res.json({product:publicProduct(product)});
}));

adminCatalogRoutes.use(dbGuard, loadUser, requireRole('admin'));
adminCatalogRoutes.get('/categories', asyncRoute(async (_req, res) => res.json({ categories: (await Category.find().sort({ sortOrder:1, _id:1 }).lean()).map(publicCategory) })));
adminCatalogRoutes.post('/categories', asyncRoute(async (req, res, next) => {
  try { const category = await Category.create(validateCategory(req.body)); res.status(201).json({category}); }
  catch(error) { dbError(error,next,res); }
}));
adminCatalogRoutes.patch('/categories/:id', asyncRoute(async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({error:'Category not found.'});
    const body = needsBody(req);
    if (!body || revision(body.revision) === null) throw new CatalogInputError('Revision is required.');
    const category = await Category.findOne({_id:req.params.id});
    if (!category) return res.status(404).json({error:'Category not found.'});
    if (category.slug !== body.slug) throw new CatalogInputError('Category slug is permanent.');
    if (category.revision !== body.revision) return res.status(409).json({error:'Category was updated elsewhere. Reload.',code:'EDIT_CONFLICT'});
    const value = validateCategory(Object.fromEntries(Object.entries(body).filter(([key])=>key!=='revision')));
    const updated = await Category.findOneAndUpdate({_id:category._id,revision:body.revision},{$set:{name:value.name,description:value.description,sortOrder:value.sortOrder,active:value.active},$inc:{revision:1}},{new:true,runValidators:true});
    if (!updated) return res.status(409).json({error:'Category was updated elsewhere. Reload.',code:'EDIT_CONFLICT'});
    res.json({category:updated});
  } catch(error) { dbError(error,next,res); }
}));
adminCatalogRoutes.delete('/categories/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({error:'Category not found.'});
  if (await Product.exists({categoryId:req.params.id})) return res.status(409).json({error:'Move or archive all related products before deletion. Products with history must remain linked.',code:'CATEGORY_IN_USE'});
  const removed = await Category.findByIdAndDelete(req.params.id);
  res.status(removed?200:404).json(removed?{ok:true}:{error:'Category not found.'});
}));
adminCatalogRoutes.get('/products', asyncRoute(async (req,res)=> {
  const {page,limit,skip}=pageParams(req.query);
  const [items,total]=await Promise.all([Product.find().sort({createdAt:-1,_id:-1}).skip(skip).limit(limit).lean(), Product.countDocuments()]);
  res.json(response(items.map(adminProduct),total,page));
}));
adminCatalogRoutes.get('/products/:id', asyncRoute(async (req,res)=> {
  if (!validId(req.params.id)) return res.status(404).json({error:'Product not found.'});
  const product=await Product.findById(req.params.id).lean();
  if (!product) return res.status(404).json({error:'Product not found.'});
  res.json({product:adminProduct(product)});
}));
adminCatalogRoutes.post('/products', asyncRoute(async (req,res,next)=> {
  try {
    const values=validateProduct(req.body);
    if (!(await Category.exists({_id:values.categoryId}))) return res.status(400).json({error:'Category not found.',code:'INVALID_CATEGORY'});
    const product=await Product.create(values);
    res.status(201).json({product});
  } catch(error) { dbError(error,next,res); }
}));
adminCatalogRoutes.patch('/products/:id', asyncRoute(async (req,res,next)=> {
  try {
    if (!validId(req.params.id)) return res.status(404).json({error:'Product not found.'});
    const body=needsBody(req);
    if (!body || revision(body.revision)===null) throw new CatalogInputError('Revision is required.');
    const original=await Product.findById(req.params.id).lean();
    if (!original) return res.status(404).json({error:'Product not found.'});
    if (body.slug!==original.slug) throw new CatalogInputError('Product slug is permanent.');
    if (body.revision!==original.revision) return res.status(409).json({error:'Product was updated elsewhere. Reload.',code:'EDIT_CONFLICT'});
    const values=validateProduct(Object.fromEntries(Object.entries(body).filter(([key])=>key!=='revision')), {allowPublish:true});
    if(values.status==='published') {
      if (!original.imageKeys?.length || !imageUrl(original.imageKeys[0])) return res.status(400).json({error:'Verify and attach at least one image before publishing.',code:'IMAGE_REQUIRED'});
      await checkVerifiedKeys(original.imageKeys,MediaAsset);
      if (!(await Category.exists({_id:values.categoryId,active:true}))) return res.status(400).json({error:'Activate this category before publishing.',code:'CATEGORY_HIDDEN'});
    }
    // Keep older size/grind identities if they have already been ordered, so cancellation can restore stock.
    const Order = (await import('../models/Order.js')).default;
    const used = await Order.find({'lines.productId': original._id}).select('lines').lean();
    const expected = new Set(used.flatMap(order=>order.lines.filter(line=>String(line.productId)===String(original._id)).map(line=>`${line.packGrams}:${line.grindCode}`)));
    for(const identity of expected){const [grams,grind]=identity.split(':');if(!values.sizes.some(s=>s.grams===Number(grams)&&s.grindOptions.some(g=>g.code===grind)))return res.status(409).json({error:'Cannot remove a size/preparation referenced by an existing order.',code:'VARIANT_IN_USE'});}
    if (!(await Category.exists({_id:values.categoryId}))) return res.status(400).json({error:'Category not found.',code:'INVALID_CATEGORY'});
    const updated=await Product.findOneAndUpdate({_id:original._id,revision:body.revision},{$set:{name:values.name,description:values.description,categoryId:values.categoryId,pricePiastres:values.pricePiastres,compareAtPiastres:values.compareAtPiastres,stockQuantity:values.stockQuantity,sizes:values.sizes,featured:values.featured,status:values.status},$unset:{packGrams:"",grindOptions:""},$inc:{revision:1}},{new:true,runValidators:true});
    if (!updated) return res.status(409).json({error:'Product was updated elsewhere. Reload.',code:'EDIT_CONFLICT'});
    res.json({product:updated});
  } catch(error) { dbError(error,next,res); }
}));
adminCatalogRoutes.delete('/products/:id', asyncRoute(async (req,res)=> {
  if (!validId(req.params.id)) return res.status(404).json({error:'Product not found.'});
  // No order history exists in this milestone; preserve all potential product URLs
  // by archiving rather than physically deleting products.
  const updated=await Product.findByIdAndUpdate(req.params.id,{$set:{status:'archived'},$inc:{revision:1}},{new:true});
  res.status(updated?200:404).json(updated?{product:updated}:{error:'Product not found.'});
}));

// Image attachments are updated independently and only accept verified images.
adminCatalogRoutes.patch('/products/:id/images', asyncRoute(async (req,res)=> {
  if (!validId(req.params.id)) return res.status(404).json({code:'NOT_FOUND',error:'Product not found.'});
  const {revision:rev,imageKeys}=req.body||{};
  if (!req.body || Object.keys(req.body).some(k=>!['revision','imageKeys'].includes(k)) || revision(rev)===null) throw new CatalogInputError('Invalid gallery request.');
  try{await checkVerifiedKeys(imageKeys,MediaAsset)}catch(error){throw new CatalogInputError(error.message)}
  const product=await Product.findById(req.params.id).lean();
  if(!product)return res.status(404).json({code:'NOT_FOUND',error:'Product not found.'});
  if (product.status==='published' && (!imageKeys.length || !imageUrl(imageKeys[0]))) throw new CatalogInputError('Published products must keep at least one visible image.');
  const updated=await Product.findOneAndUpdate({_id:req.params.id,revision:rev},{$set:{imageKeys},$inc:{revision:1}},{new:true,runValidators:true});
  if(!updated)return res.status(409).json({code:'EDIT_CONFLICT',error:'Product changed; reload first.'});
  res.json({product:adminProduct(updated.toObject())});
}));
adminCatalogRoutes.patch('/categories/:id/image', asyncRoute(async (req,res)=> {
  if (!validId(req.params.id)) return res.status(404).json({code:'NOT_FOUND',error:'Category not found.'});
  const {revision:rev,imageKey}=req.body||{};
  if (!req.body || Object.keys(req.body).some(k=>!['revision','imageKey'].includes(k)) || revision(rev)===null || !(typeof imageKey==='string'||imageKey===null)) throw new CatalogInputError('Invalid category image request.');
  try{await checkVerifiedKeys(imageKey?[imageKey]:[],MediaAsset)}catch(error){throw new CatalogInputError(error.message)}
  const category=await Category.findOneAndUpdate({_id:req.params.id,revision:rev},{$set:{imageKey},$inc:{revision:1}},{new:true,runValidators:true});
  if(!category)return res.status(409).json({code:'EDIT_CONFLICT',error:'Category changed; reload first.'});
  res.json({category:publicCategory(category.toObject())});
}));

// Input errors must not be reported as server failures.
function catalogErrorHandler(error, _req, res, next) {
  if (error instanceof CatalogInputError) return res.status(400).json({ error: error.message, code: error.code });
  if (error?.code === 11000) return res.status(409).json({ error: 'This slug is already in use.', code: 'DUPLICATE_SLUG' });
  next(error);
}
catalogRoutes.use(catalogErrorHandler);
adminCatalogRoutes.use(catalogErrorHandler);
