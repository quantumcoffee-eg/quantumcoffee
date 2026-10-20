// Catalog inputs are fully replaced on edit; unknown fields are rejected.
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
  only(data, ['name','slug','description','categoryId','pricePiastres','compareAtPiastres','stockQuantity','featured','status'], 'product');
  if (typeof data.categoryId !== 'string' || !/^[a-f\d]{24}$/i.test(data.categoryId)) fail('Select a valid category.');
  const pricePiastres = integer(data.pricePiastres, 'selling price', { min: 1 });
  const compareAtPiastres = integer(data.compareAtPiastres, 'compare-at price', { min: 1, nullable: true });
  if (compareAtPiastres !== null && compareAtPiastres <= pricePiastres) fail('Compare-at price must exceed the selling price.');
  if (typeof data.featured !== 'boolean') fail('Featured must be boolean.');
  if (!['draft', 'published', 'archived'].includes(data.status)) fail('Invalid product status.');
  if (data.status === 'published' && !allowPublish) fail('Publication is disabled until verified R2 product images are supported. Save as draft.');
  return {
    name: bilingual(data.name, 'Product name', 150),
    slug: slug(data.slug),
    description: bilingual(data.description || {en:'', ar:''}, 'Product description', 5000, false),
    categoryId: data.categoryId,
    pricePiastres,
    compareAtPiastres,
    stockQuantity: integer(data.stockQuantity, 'stock quantity', {max:1000000}),
    featured: data.featured,
    status: data.status,
  };
}
