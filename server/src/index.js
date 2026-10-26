import 'dotenv/config';
import { createApp } from './app.js';
import { connectDatabase } from './db/connect.js';
import { assertProductionConfig } from './config/production.js';
import { startOrderMailWorker } from './notifications/order-mail.js';
import mongoose from 'mongoose';
import { installShutdown } from './shutdown.js';

async function start() {
  let stage = 'CONFIGURATION';
  try {
    assertProductionConfig();
    const port = Number(process.env.PORT || 4000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
    // Unlike local UI development, production must not start in a misleading
    // "healthy" state without a working, explicitly named Quantum database.
    stage = 'DATABASE_CONNECTION';
    const connected = await connectDatabase();
    if (process.env.NODE_ENV === 'production' && !connected) {
      throw new Error('Production database connection is required.');
    }
    stage = 'HTTP_START';
    const server = createApp().listen(port, '0.0.0.0', () => console.log(`Quantum Coffee API listening on ${port}`));
    const worker = connected ? startOrderMailWorker() : null;
    installShutdown({ server, worker, disconnect: () => mongoose.disconnect() });
    server.on('error', () => { console.error('Quantum Coffee HTTP startup failed.'); process.exitCode = 1; worker?.abort(); void worker?.stop().then(() => mongoose.disconnect()); });
  } catch {
    console.error('Quantum Coffee startup failed:', stage);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  }
}

void start();
