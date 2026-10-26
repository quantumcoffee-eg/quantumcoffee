// One-time, create-only starting data for Quantum Coffee.
// The admin dashboard becomes the single source of truth after seeding.
// Intentional omissions: photos, owner-approved Arabic copy, tasting notes,
// grind selections and per-grind inventory. Do not invent these values.

export const DATABASE_NAME = 'quantumcoffee_production';

export const CATEGORY = Object.freeze({
  name: { en: 'Coffee Blends', ar: '' },
  slug: 'coffee-blends',
  description: { en: '', ar: '' },
  sortOrder: 0,
  active: false,
});

export const PRODUCTS = Object.freeze([
  { name: 'Black Hole Coffee Blend', slug: 'black-hole', pricePiastres: 45000 },
  { name: 'Worm Hole Coffee Blend', slug: 'worm-hole', pricePiastres: 42500 },
  { name: 'Cosmic Dust Coffee Blend', slug: 'cosmic-dust', pricePiastres: 40000 },
]);

export function initialProduct(categoryId, item) {
  return {
    name: { en: item.name, ar: '' },
    slug: item.slug,
    description: { en: '', ar: '' },
    categoryId: String(categoryId),
    sizes: [{
      grams: 250,
      pricePiastres: item.pricePiastres,
      compareAtPiastres: null,
      grindOptions: [],
    }],
    featured: false,
    status: 'draft',
  };
}

export function assertSeedEnvironment(env) {
  if (env.NODE_ENV === 'production') throw new Error('Run the seed from your local terminal, never on Render.');
  if (env.MONGODB_DB_NAME !== DATABASE_NAME) throw new Error(`MONGODB_DB_NAME must equal ${DATABASE_NAME}.`);
  if (typeof env.MONGODB_URI !== 'string' || !/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI))
    throw new Error('A valid Quantum Coffee MONGODB_URI must be configured locally.');
  if (/tap.?and.?wrap|tapandwrap/i.test(env.MONGODB_URI))
    throw new Error('This URI appears to point to Tap & Wrap. Refusing to proceed.');
  if (env.CHECKOUT_ENABLED === 'true') throw new Error('Keep checkout disabled during catalog setup.');
  if (env.ALLOW_ADMIN_BOOTSTRAP === 'true') throw new Error('Disable admin bootstrap before seeding.');
}

// Pure planning logic; never changes existing catalog data.
export function planSeed(existingCategory, existingProducts) {
  if (existingCategory && existingCategory.name?.en !== CATEGORY.name.en)
    throw new Error('Existing coffee-blends category has a different name. Review manually; nothing overwritten.');
  const bySlug = new Map(existingProducts.map(p => [p.slug, p]));
  return {
    createCategory: !existingCategory,
    createProducts: PRODUCTS.filter(p => !bySlug.has(p.slug)),
    skipProducts: PRODUCTS.filter(p => bySlug.has(p.slug)),
  };
}
