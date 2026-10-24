// Catalog inputs are fully replaced on edit; unknown fields are rejected.
import { PREPARATION_CODES, MAX_SIZES, MAX_STOCK, summaryFromSizes } from './grinds.js';
export class CatalogInputError extends Error {
  constructor(message) { super(message); this.status = 400; this.code = 'INVALID_CATALOG_INPUT'; }
}
const fail = (message) => { throw new CatalogInputError(message); };
const object = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
};
const only = (source, keys, label) => {
  if (Object.keys(source).some((key) => !keys.includes(key))) fail(`Unknown ${label} field.`);
};
const string = (value, label, max, required = false) => {
  if (value == null || value === '') return required ? fail(`${label} is required.`) : '';
  if (typeof value !== 'string' || value.trim().length > max || !value.trim()) fail(`Invalid ${label}.`);
  return value.trim();
};
const bilingual = (value, label, max, requireEnglish = true) => {
  const data = object(value, label);
  only(data, ['en', 'ar'], label);
  return { en: string(data.en, `${label}.en`, max, requireEnglish), ar: string(data.ar, `${label}.ar`, max) };
};
const slug = (value) => {
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 96)
    fail('Slug must contain lowercase letters, numbers and hyphens (up to 96 characters).');
  return value;
};
const integer = (value, label, { min = 0, max = 1_000_000_000, nullable = false } = {}) => {
  if (nullable && (value == null || value === '')) return null;
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`Invalid ${label}.`);
  return value;
};
export function validateCategory(value) {
  const data = object(value, 'Category');
  only(data, ['name','slug','description','sortOrder','active'], 'category');
  if (typeof data.active !== 'boolean') fail('Category active must be boolean.');
  return {
    name: bilingual(data.name, 'Category name', 120),
    slug: slug(data.slug),
    description: bilingual(data.description || { en: '', ar: '' }, 'Category description', 1000, false),
    sortOrder: integer(data.sortOrder ?? 0, 'sort order', { min: 0, max: 100000 }),
    active: data.active,
  };
}
export function validateProduct(value, { allowPublish = false } = {}) {
  const data = object(value, 'Product');
  only(data, ['name','slug','description','categoryId','sizes','featured','status'], 'product');
  if (!Array.isArray(data.sizes) || data.sizes.length < 1 || data.sizes.length > MAX_SIZES)
    fail('Add between 1 and 12 product sizes.');
  const gramsSeen = new Set();
  const sizes = data.sizes.map(size => {
    object(size,'Size');
    only(size,['grams','pricePiastres','compareAtPiastres','grindOptions'],'size');
    const grams = integer(size.grams,'size in grams',{min:1,max:50000});
    if (gramsSeen.has(grams)) fail('Duplicate size is not allowed.');
    gramsSeen.add(grams);
    const pricePiastres = integer(size.pricePiastres,'size selling price',{min:1});
    const compareAtPiastres = integer(size.compareAtPiastres,'size compare-at price',{min:1,nullable:true});
    if(compareAtPiastres !== null && compareAtPiastres <= pricePiastres) fail('Compare-at price must exceed the selling price.');
    if (!Array.isArray(size.grindOptions) || size.grindOptions.length > PREPARATION_CODES.length)
      fail('Select valid coffee preparations for each size.');
    const codes=new Set();
    const grindOptions=size.grindOptions.map(option=>{
      object(option,'Preparation');only(option,['code','stockQuantity'],'preparation');
      if (!PREPARATION_CODES.includes(option.code) || codes.has(option.code)) fail('Invalid or duplicate preparation.');
      codes.add(option.code);
      return {code:option.code,stockQuantity:integer(option.stockQuantity,'preparation stock',{max:MAX_STOCK})};
    });
    if (data.status==='published' && !grindOptions.length) fail('Published sizes need a preparation option.');
    return {grams,pricePiastres,compareAtPiastres,grindOptions};
  });
  if (typeof data.categoryId !== 'string' || !/^[a-f\d]{24}$/i.test(data.categoryId)) fail('Select a valid category.');
  if (typeof data.featured !== 'boolean') fail('Featured must be boolean.');
  if (!['draft', 'published', 'archived'].includes(data.status)) fail('Invalid product status.');
  if (data.status === 'published' && !allowPublish) fail('Publication is disabled until verified R2 product images are supported. Save as draft.');
  return {
    name: bilingual(data.name, 'Product name', 150),
    slug: slug(data.slug),
    description: bilingual(data.description || {en:'', ar:''}, 'Product description', 5000, false),
    categoryId: data.categoryId,
    sizes,
    ...summaryFromSizes(sizes),
    featured: data.featured,
    status: data.status,
  };
}
