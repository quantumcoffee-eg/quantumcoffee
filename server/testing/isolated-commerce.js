import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import Order from '../src/models/Order.js';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import PaymentProof from '../src/models/PaymentProof.js';
import OrderMail from '../src/models/OrderMail.js';
import PaymentEvent from '../src/models/PaymentEvent.js';
import RefundCase from '../src/models/RefundCase.js';
import MediaAsset from '../src/models/MediaAsset.js';

export function assertIsolatedReplicaUri(uri) {
  const match = typeof uri === 'string' && /^mongodb:\/\/127\.0\.0\.1:(\d{1,5})\/\?replicaSet=qc-c1-rs$/.exec(uri);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) throw new Error('Commerce tests require a dedicated loopback qc-c1-rs replica set, no credentials, database path, or other options.');
}
export async function isolatedCommerceDatabase(uri) {
  assertIsolatedReplicaUri(uri);
  const name = `qc_c1_test_${randomUUID().replaceAll('-', '')}`;
  const connection = await mongoose.createConnection(uri, { dbName: name, appName: 'qc-c1-transactions', directConnection: true,
    autoCreate: false, autoIndex: false, monitorCommands: true, serverSelectionTimeoutMS: 2000, socketTimeoutMS: 5000, maxPoolSize: 8 }).asPromise();
  const hello = await connection.db.admin().command({ hello: 1 });
  if (hello.setName !== 'qc-c1-rs' || !hello.isWritablePrimary) { await connection.close(); throw new Error('Dedicated test replica set is not writable.'); }
  const assertOwned = () => {
    if (connection.name !== name || !/^qc_c1_test_[a-f0-9]{32}$/.test(name) || connection.host !== '127.0.0.1') throw new Error('Refusing non-test database operation.');
  };
  const models = Object.fromEntries([Order, Product, Category, PaymentProof, OrderMail, PaymentEvent, RefundCase, MediaAsset].map(model => [model.modelName, connection.model(model.modelName, model.schema)]));
  assertOwned();
  for (const model of Object.values(models)) { await model.createCollection(); await model.createIndexes(); }
  return { connection, models,
    // Raw deletion is intentionally confined to this owned disposable database;
    // the production event model forbids updates and deletion.
    async reset() { assertOwned(); for (const model of Object.values(models)) await model.collection.deleteMany({}); },
    async close() { assertOwned(); try { await connection.dropDatabase(); } finally { await connection.close(); } },
    async failCommand(data, mode = { times: 1 }) { assertOwned(); return connection.db.admin().command({ configureFailPoint: 'failCommand', mode, data: { ...data, appName: 'qc-c1-transactions' } }); },
  };
}
