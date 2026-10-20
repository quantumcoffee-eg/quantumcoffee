import { Router } from 'express';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import { CatalogInputError, validateCategory, validateProduct } from '../catalog/validation.js';
import { databaseReady } from '../db/connect.js';
import { loadUser, requireRole } from '../security/session.js';

export const catalogRoutes = Router();
export const adminCatalogRoutes = Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
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
const needsBody = (req) => req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null;

catalogRoutes.use(dbGuard);
catalogRoutes.get('/categories', asyncRoute(async (_req, res) => {
  const categories = await Category.find({active:true}).sort({sortOrder:1,_id:1}).select('name slug description').lean();
  res.json({ categories });
}));
catalogRoutes.get('/products', asyncRoute(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const filter = { status: 'published' };
  if (req.query.category) {
    if (typeof req.query.category !== 'string' || req.query.category.length > 96) throw new CatalogInputError('Invalid category.');
    const category = await Category.findOne({slug:req.query.category,active:true}).select('_id').lean();
    if (!category) return res.json(response([], 0, page));
    filter.categoryId = category._id;
  }
  if (req.query.q) {
    if (typeof req.query.q !== 'string' || req.query.q.trim().length > 100) throw new CatalogInputError('Invalid search query.');
    const escaped = req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ 'name.en': { $regex: escaped, $options:'i' } }, { 'name.ar': { $regex: escaped, $options:'i' } }];
  }
  const sorts = { newest: {createdAt:-1,_id:-1}, price_asc:{pricePiastres:1,_id:1}, price_desc:{pricePiastres:-1,_id:-1}, discover:{featured:-1,createdAt:-1,_id:-1} };
  const sort = req.query.sort || 'discover';
  if (!Object.hasOwn(sorts, sort)) throw new CatalogInputError('Invalid sort order.');
  const [items,total] = await Promise.all([Product.find(filter).sort(sorts[sort]).skip(skip).limit(limit).select('-imageKeys').lean(),Product.countDocuments(filter)]);
  res.json(response(items,total,page));
}));
catalogRoutes.get('/products/:slug', asyncRoute(async (req, res) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(req.params.slug)) return res.status(404).json({error:'Not found.'});
  const product = await Product.findOne({slug:req.params.slug,status:'published'}).select('-imageKeys').lean();
  if (!product) return res.status(404).json({error:'Product not found.',code:'NOT_FOUND'});
  res.json({ product });
}));

adminCatalogRoutes.use(dbGuard, loadUser, requireRole('admin'));
adminCatalogRoutes.get('/categories', asyncRoute(async (_req, res) => res.json({ categories: await Category.find().sort({ sortOrder:1, _id:1 }).lean() })));
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
  res.json(response(items,total,page));
}));
adminCatalogRoutes.get('/products/:id', asyncRoute(async (req,res)=> {
  if (!validId(req.params.id)) return res.status(404).json({error:'Product not found.'});
  const product=await Product.findById(req.params.id).lean();
  if (!product) return res.status(404).json({error:'Product not found.'});
  res.json({product});
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
    const values=validateProduct(Object.fromEntries(Object.entries(body).filter(([key])=>key!=='revision')));
    if (!(await Category.exists({_id:values.categoryId}))) return res.status(400).json({error:'Category not found.',code:'INVALID_CATEGORY'});
    const updated=await Product.findOneAndUpdate({_id:original._id,revision:body.revision},{$set:{name:values.name,description:values.description,categoryId:values.categoryId,pricePiastres:values.pricePiastres,compareAtPiastres:values.compareAtPiastres,stockQuantity:values.stockQuantity,featured:values.featured,status:values.status},$inc:{revision:1}},{new:true,runValidators:true});
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

// Input errors must not be reported as server failures.
function catalogErrorHandler(error, _req, res, next) {
  if (error instanceof CatalogInputError) return res.status(400).json({ error: error.message, code: error.code });
  if (error?.code === 11000) return res.status(409).json({ error: 'This slug is already in use.', code: 'DUPLICATE_SLUG' });
  next(error);
}
catalogRoutes.use(catalogErrorHandler);
adminCatalogRoutes.use(catalogErrorHandler);
