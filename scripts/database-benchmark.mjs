// Never load dotenv. The existing test helper rejects remote/authenticated URIs,
// chooses a unique disposable database, and permits cleanup only of that DB.
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { isolatedCommerceDatabase } from '../server/testing/isolated-commerce.js';
import { loadOverview } from '../server/src/admin/overview-service.js';
import { loadOperations } from '../server/src/admin/operations-service.js';
import { loadReconciliation } from '../server/src/accounting/reconciliation.js';

const fixture = await isolatedCommerceDatabase(process.env.QC_COMMERCE_TEST_MONGO_URI);
const { models, connection } = fixture;
const ObjectId = connection.base.Types.ObjectId;
const now = new Date('2026-10-27T12:00:00Z'), categories = Array.from({ length: 12 }, (_, i) => ({ _id: new ObjectId(), slug: `fixture-${i}`, name: { en: `Fixture ${i}`, ar: '' }, active: i < 10, sortOrder: i }));
const products = Array.from({ length: 1500 }, (_, i) => ({ _id: new ObjectId(), slug: `fixture-${i}`, name: { en: `Fixture coffee ${i}`, ar: '' }, description: { en: 'Offline benchmark '.repeat(40), ar: '' }, categoryId: categories[i % 12]._id, createdAt: new Date(+now - i * 60000), status: i % 4 ? 'published' : 'draft', featured: i % 5 === 0, pricePiastres: 10000 + i % 100 * 100, stockQuantity: 8, imageKeys: [`catalog/${i.toString(16).padStart(40, '0')}.webp`], sizes: [{ grams: 250, pricePiastres: 10000, grindOptions: [{ code: 'espresso', stockQuantity: 8 }] }] }));
const by = new ObjectId(), userId = new ObjectId();
const orders = Array.from({ length: 3000 }, (_, i) => ({ _id: new ObjectId(), orderNumber: `QC-${i.toString(16).padStart(12,'0').toUpperCase()}`, checkoutKey: `offline-${i}`, createdAt: new Date(+now - i * 3600000), totalPiastres: 10000, userId, paymentMethod: 'cod', paymentState: i % 3 ? 'paid' : 'unpaid', fulfillmentState: i % 3 ? 'delivered' : 'received', paymentHistory: [], history: [], customer: { phone: 'offline-fixture' }, lines: [{ productId: products[i % 1500]._id, name: products[i % 1500].name, quantity: 1, packGrams: 250, grindCode: 'espresso', lineTotalPiastres: 10000 }] }));
const events = orders.filter(o => o.paymentState === 'paid').map(o => { const event = { _id: new ObjectId(), orderId: o._id, eventKey: `collection:${o._id}`, kind: 'collection', direction: 1, amountPiastres: 10000, currency: 'EGP', paymentMethod: 'cod', occurredAt: o.createdAt, recordedAt: o.createdAt, by }; o.paymentHistory = [{ state: 'paid', at: o.createdAt, by, eventId: event._id }]; return event; });
const results = { fixtures: { products: products.length, categories: categories.length, orders: orders.length, events: events.length }, queries: [], services: [], candidateIndexesAppliedToProduction: false };
function stages(value, found = new Set()) { if (value && typeof value === 'object') { if (value.stage) found.add(value.stage); for (const item of Object.values(value)) stages(item, found); } return [...found]; }
async function query(label, collection, filter, sort, projection, hint) {
  const cursor = collection.find(filter, { projection, maxTimeMS: 5000 }); if (sort) cursor.sort(sort);
  if (!label.includes('variant history')) cursor.limit(20); if (hint) cursor.hint(hint);
  const data = await cursor.explain('executionStats');
  const stat = data.executionStats;
  results.queries.push({ label, nReturned: stat.nReturned, docsExamined: stat.totalDocsExamined, keysExamined: stat.totalKeysExamined, executionMs: stat.executionTimeMillis, stages: stages(data.queryPlanner.winningPlan) });
}
async function service(label, work) { const durations = []; let payload; for (let i = 0; i < 3; i++) { const start = performance.now(); payload = await work(); durations.push(performance.now() - start); } durations.sort((a,b)=>a-b); results.services.push({ label, medianMs: +durations[1].toFixed(2), replyBytes: Buffer.byteLength(JSON.stringify(payload)) }); }
try {
  await models.Category.collection.insertMany(categories);
  await models.Product.collection.insertMany(products);
  await models.Order.collection.insertMany(orders);
  await models.PaymentEvent.collection.insertMany(events);
  await models.PaymentProof.collection.insertMany(orders.slice(0,300).map((order,i)=>({orderId:order._id,key:`payment-proofs/uploads/${i.toString(16).padStart(40,'0')}.png`,state:'pending',expiresAt:new Date(+now-60000),freezeAttempts:[]})));
  await models.MediaAsset.collection.insertMany(Array.from({length:100},(_,i)=>({key:i<50?products[i].imageKeys[0]:`catalog/${(10000+i).toString(16).padStart(40,'0')}.webp`,state:'verified',ownerId:by,createdAt:now})));
  await models.OrderMail.collection.insertMany(Array.from({length:100},(_,i)=>({dedupeKey:`offline-${i}`,state:'pending',attempts:0,nextAttemptAt:now,createdAt:now})));
  Object.assign(results.fixtures,{proofs:300,media:100,mail:100});
  const p = models.Product.collection, o = models.Order.collection;
  const publicFilter={status:'published',categoryId:{$in:categories.slice(0,10).map(c=>c._id)}};
  await query('admin all products existing indexes', p, {}, {createdAt:-1,_id:-1});
  await query('admin products existing indexes', p, { status:'published' }, { createdAt:-1,_id:-1 });
  await query('public newest existing indexes', p, { status:'published', categoryId: { $in: categories.slice(0,10).map(c=>c._id) } }, {createdAt:-1,_id:-1});
  await query('public price existing indexes', p, publicFilter, {pricePiastres:1,_id:1});
  await query('unanchored search existing indexes', p, { status:'published', $or:[{'name.en':/coffee 12/i},{'name.ar':/coffee 12/i}] }, {createdAt:-1,_id:-1});
  await query('order variant history existing indexes', o, {'lines.productId':products[0]._id}, undefined, {lines:1});
  await query('public image lookup existing indexes', p, {imageKeys:products[0].imageKeys[0]}, undefined, {_id:1});
  await query('recent orders existing indexes', o, {}, {createdAt:-1,_id:-1}, {orderNumber:1,createdAt:1,totalPiastres:1,paymentState:1,fulfillmentState:1});
  await p.createIndex({status:1,createdAt:-1,_id:-1},{name:'d2_candidate_recent'});
  await p.createIndex({createdAt:-1,_id:-1},{name:'d2_candidate_admin_all'});
  await p.createIndex({status:1,pricePiastres:1,_id:1},{name:'d2_candidate_price'});
  await o.createIndex({'lines.productId':1},{name:'d2_candidate_variant'});
  await query('admin products candidate recent', p, {status:'published'}, {createdAt:-1,_id:-1}, undefined, 'd2_candidate_recent');
  await query('admin all products candidate index', p, {}, {createdAt:-1,_id:-1}, undefined, 'd2_candidate_admin_all');
  await query('public newest candidate recent', p, {status:'published',categoryId:{$in:categories.slice(0,10).map(c=>c._id)}}, {createdAt:-1,_id:-1}, undefined, 'd2_candidate_recent');
  await query('public price candidate price', p, publicFilter, {pricePiastres:1,_id:1}, undefined, 'd2_candidate_price');
  await query('order variant history candidate index', o, {'lines.productId':products[0]._id}, undefined, {lines:1}, 'd2_candidate_variant');
  await service('notification/storage health before media index', () => loadOperations({models,env:{},now}));
  await p.createIndex({imageKeys:1},{name:'d2_candidate_media'});
  await query('public image lookup candidate index', p, {imageKeys:products[0].imageKeys[0]}, undefined, {_id:1}, 'd2_candidate_media');
  await service('ledger overview incl reconciliation', () => loadOverview('30d', {models,now}));
  await service('read-only reconciliation', () => loadReconciliation({models}));
  await service('notification/storage health with media index', () => loadOperations({models,env:{},now}));
  results.process = { node: process.version, rssBytes: process.memoryUsage().rss, heapBytes: process.memoryUsage().heapUsed };
  fs.writeFileSync('.playwright/d2-database.json', JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
} finally { await fixture.close(); }
