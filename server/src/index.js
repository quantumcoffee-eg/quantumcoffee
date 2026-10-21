import 'dotenv/config';
import { createApp } from './app.js';
import { connectDatabase } from './db/connect.js';
import { assertProductionConfig } from './config/production.js';
import { startOrderMailWorker } from './notifications/order-mail.js';

async function start() {
  try {
    assertProductionConfig();
    const port = Number(process.env.PORT || 4000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
    // Unlike local UI development, production must not start in a misleading
    // "healthy" state without a working, explicitly named Quantum database.
    const connected = await connectDatabase();
    if (process.env.NODE_ENV === 'production' && !connected) {
      throw new Error('Production database connection is required.');
    }
    createApp().listen(port, '0.0.0.0', () => console.log(`Quantum Coffee API listening on ${port}`));
    if (connected) startOrderMailWorker();
  } catch (error) {
    console.error(`Quantum Coffee startup failed: ${error.message}`);
    process.exitCode = 1;
  }
}

void start();
