import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCategory, validateProduct } from '../src/catalog/validation.js';
import { CATEGORY, PRODUCTS, initialProduct, assertSeedEnvironment, planSeed } from '../src/scripts/initial-catalog-data.js';

const id = '507f1f77bcf86cd799439011';
const env = { NODE_ENV: 'development', MONGODB_URI: 'mongodb+srv://test.example.invalid', MONGODB_DB_NAME: 'quantumcoffee_production', CHECKOUT_ENABLED: 'false', ALLOW_ADMIN_BOOTSTRAP: 'false' };

test('initial catalog creates only three unpublished 250g drafts with confirmed prices', () => {
  assert.equal(PRODUCTS.length, 3);
  assert.deepEqual(PRODUCTS.map(p => p.pricePiastres), [45000, 42500, 40000]);
  assert.equal(validateCategory(CATEGORY).active, false);
  for (const p of PRODUCTS) {
    const value = validateProduct(initialProduct(id, p));
    assert.equal(value.status, 'draft');
    assert.equal(value.sizes.length, 1);
    assert.equal(value.sizes[0].grams, 250);
    assert.deepEqual(value.sizes[0].grindOptions, []);
    assert.equal(value.stockQuantity, 0);
    assert.equal(value.name.ar, '');
    assert.equal(value.description.en, '');
  }
});

test('re-running seed never requests overwrite of existing products', () => {
  const category = { _id: id, slug: 'coffee-blends', name: {en:'Coffee Blends'} };
  let plan = planSeed(null, []);
  assert.equal(plan.createCategory, true);
  assert.equal(plan.createProducts.length, 3);
  plan = planSeed(category, [{slug:'black-hole', pricePiastres:999}]);
  assert.equal(plan.createCategory, false);
  assert.deepEqual(plan.createProducts.map(p => p.slug), ['worm-hole','cosmic-dust']);
  assert.deepEqual(plan.skipProducts.map(p => p.slug), ['black-hole']);
  assert.deepEqual(planSeed(category, PRODUCTS).createProducts, []);
});

test('seed refuses wrong database, Render environment, Tap & Wrap or enabled checkout', () => {
  assert.doesNotThrow(() => assertSeedEnvironment(env));
  assert.throws(() => assertSeedEnvironment({...env,NODE_ENV:'production'}),/local terminal/);
  assert.throws(() => assertSeedEnvironment({...env,MONGODB_DB_NAME:'tapandwrap_production'}),/must equal/);
  assert.throws(() => assertSeedEnvironment({...env,MONGODB_URI:'mongodb+srv://tapandwrap.example'}),/Tap & Wrap/);
  assert.throws(() => assertSeedEnvironment({...env,CHECKOUT_ENABLED:'true'}),/checkout/);
  assert.throws(() => assertSeedEnvironment({...env,ALLOW_ADMIN_BOOTSTRAP:'true'}),/bootstrap/);
});
