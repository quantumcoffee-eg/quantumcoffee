import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes.js';
import { catalogRoutes, adminCatalogRoutes } from './routes/catalog.routes.js';
import mediaRoutes from './routes/media.routes.js';
import { commerceRoutes, adminOrdersRoutes } from './routes/commerce.routes.js';
import { paymentRoutes, adminPaymentRoutes } from './routes/payment.routes.js';
import { databaseReady } from './db/connect.js';
import { publicStoreRoutes, adminStoreRoutes } from './routes/store.routes.js';
import { loadUser, requireRole } from './security/session.js';
import overviewRoutes from './routes/overview.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
  const origins = new Set((process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5173,http://localhost:5173').split(',').map(x => x.trim()).filter(Boolean));
  app.use(helmet());
  app.use(cors({ origin(origin, callback) { callback(null, !origin || origins.has(origin)); }, credentials: true }));
  // Bilingual legal policies can exceed ordinary checkout payload sizes.
  // Keep the larger parser limited to the owner-settings endpoint.
  app.use('/api/admin/store', express.json({ limit: '512kb', inflate: false }));
  app.use(express.json({ limit: '16kb', inflate: false }));
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      // Cookie-authenticated writes from browsers must originate at an approved site.
      const origin = req.get('origin');
      if (!origin || !origins.has(origin)) return res.status(403).json({ error: 'Invalid request origin.', code: 'INVALID_ORIGIN' });
    }
    next();
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'quantum-coffee-api', database: databaseReady() ? 'connected' : 'not_connected', phase: 'auth-foundation' }));
  // Render checks this endpoint, not /api/health. A disconnected MongoDB must
  // never qualify a deployment as ready to serve authenticated traffic.
  app.get('/api/ready', (_req, res) => {
    const ready = databaseReady();
    res.setHeader('Cache-Control', 'no-store');
    res.status(ready ? 200 : 503).json({ ok: ready, service: 'quantum-coffee-api' });
  });
  app.use('/api/auth', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api/auth', authRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api/store', publicStoreRoutes);
  app.use('/api/admin/store', adminStoreRoutes);
  app.use('/api/admin/catalog', adminCatalogRoutes);
  app.use('/api/admin/media', mediaRoutes);
  app.use('/api/commerce', commerceRoutes);
  app.use('/api/commerce/payment-proofs', paymentRoutes);
  app.use('/api/admin/orders', adminOrdersRoutes);
  app.use('/api/admin/payments', adminPaymentRoutes);
  app.use('/api/admin/overview', overviewRoutes);
  // This endpoint exercises the server-side admin guard without exposing data.
  app.get('/api/admin/check', (req, res, next) => databaseReady() ? next() : res.status(503).json({ error: 'Database unavailable.' }), loadUser, requireRole('admin'), (req, res) => res.json({ ok: true, role: 'admin' }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' }));
  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.', code: 'INVALID_JSON' });
    console.error('API error:', error?.message || error);
    res.status(500).json({ error: 'Internal server error.', code: 'INTERNAL_ERROR' });
  });
  return app;
}
