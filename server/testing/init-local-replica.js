// Explicit operator/test utility only. Never imported by application startup.
// No environment files, arbitrary URI, credentials or database-name arguments.
import mongoose from 'mongoose';

if (process.argv.length !== 2) throw new Error('This utility accepts no arguments; use the dedicated loopback node on port 27029.');
const client = new mongoose.mongo.MongoClient('mongodb://127.0.0.1:27029/?directConnection=true', { serverSelectionTimeoutMS: 3000 });
try {
  await client.connect();
  const admin = client.db('admin');
  const { parsed } = await admin.command({ getCmdLineOpts: 1 });
  if (parsed.replication?.replSet !== 'qc-c1-rs' || parsed.net?.bindIp !== '127.0.0.1' || Number(parsed.net?.port) !== 27029 || String(parsed.setParameter?.enableTestCommands) !== '1') throw new Error('Refusing to initialize a node that is not the dedicated loopback commerce test replica set.');
  const hello = await admin.command({ hello: 1 });
  if (!hello.setName) await admin.command({ replSetInitiate: { _id: 'qc-c1-rs', members: [{ _id: 0, host: '127.0.0.1:27029' }] } });
  else if (hello.setName !== 'qc-c1-rs') throw new Error('Unexpected replica-set identity.');
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if ((await admin.command({ hello: 1 })).isWritablePrimary) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Local test replica set did not become writable.');
  console.log('Dedicated loopback qc-c1-rs replica set ready.');
} catch (error) {
  console.error('Local replica initialization failed:', /^[A-Za-z0-9_]{1,60}$/.test(error.name || '') ? error.name : 'ERROR');
  process.exitCode = 1;
} finally { await client.close(); }
