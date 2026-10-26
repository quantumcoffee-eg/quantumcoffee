import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../db/connect.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import { validateCategory, validateProduct } from '../catalog/validation.js';
import { CATEGORY, PRODUCTS, DATABASE_NAME, initialProduct, assertSeedEnvironment, planSeed } from './initial-catalog-data.js';

// READ-ONLY by default. The --apply action needs a second explicit confirmation.
const apply = process.argv.includes('--apply');
const confirm = `--confirm=${DATABASE_NAME}`;

async function examine(session) {
  const category = await Category.findOne({ slug: CATEGORY.slug }).session(session || null).lean();
  const products = await Product.find({ slug: { $in: PRODUCTS.map(p => p.slug) } })
    .select('slug name categoryId status').session(session || null).lean();
  if (!category && products.length) throw new Error('Initial product slugs already exist without the matching coffee-blends category. Stop and review manually.');
  const plan = planSeed(category, products);
  if (category) {
    const unrelated = products.filter(p => String(p.categoryId) !== String(category._id));
    if (unrelated.length) throw new Error(`Product/category mismatch: ${unrelated.map(p => p.slug).join(', ')}. Stop and review manually.`);
  }
  return { category, products, plan };
}

async function ensureCollectionsAndIndexes() {
  for (const Model of [Category, Product]) {
    const exists = await mongoose.connection.db.listCollections({ name: Model.collection.name }).hasNext();
    if (!exists) await Model.createCollection();
    await Model.createIndexes();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--apply', confirm].includes(arg))) throw new Error('Unknown option. Use no options for preview or --apply with the exact confirmation.');
  if (apply && !args.includes(confirm)) throw new Error(`To create records, pass --apply ${confirm}.`);
  if (!apply && args.includes(confirm)) throw new Error('Confirmation is only valid with --apply.');
  assertSeedEnvironment(process.env);
  if (!await connectDatabase()) throw new Error('Atlas connection unavailable.');
  if (mongoose.connection.db.databaseName !== DATABASE_NAME) throw new Error('Connected database name mismatch. Refusing to seed.');

  // Validate the initial values against the same rules as the admin UI.
  validateCategory(CATEGORY);
  for (const item of PRODUCTS) validateProduct(initialProduct('507f1f77bcf86cd799439011', item));

  const before = await examine();
  console.log(`Database: ${DATABASE_NAME}`);
  console.log(`Category: ${before.plan.createCategory ? 'CREATE (hidden)' : 'KEEP EXISTING'}`);
  for (const item of PRODUCTS) {
    const create = before.plan.createProducts.some(p => p.slug === item.slug);
    console.log(`  ${create ? 'CREATE DRAFT' : 'KEEP EXISTING'}: ${item.slug} (250 g, ${item.pricePiastres / 100} EGP)`);
  }
  if (!apply) {
    console.log(`READ-ONLY PREVIEW. To insert only missing records, run: node src/scripts/seed-initial-catalog.js --apply ${confirm}`);
    return;
  }

  // Ensure slug uniqueness before the write transaction; no catalog records are edited/deleted.
  await ensureCollectionsAndIndexes();
  const created = [];
  await mongoose.connection.transaction(async session => {
    const { category: existingCategory, plan } = await examine(session);
    let category = existingCategory;
    if (!category) {
      [category] = await Category.create([validateCategory(CATEGORY)], { session });
      created.push('category: coffee-blends');
    }
    for (const item of plan.createProducts) {
      // A previously created product with the same slug is never changed.
      const values = validateProduct(initialProduct(category._id, item));
      await Product.create([values], { session });
      created.push(`draft: ${item.slug}`);
    }
  });
  console.log(created.length ? `Created: ${created.join(', ')}` : 'Nothing to create; all initial records already exist.');
  console.log('Completed. No products published, no inventory invented, no checkout enabled.');
}

try { await main(); }
catch (error) { console.error(`Initial catalog seed failed: ${error.message}`); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
