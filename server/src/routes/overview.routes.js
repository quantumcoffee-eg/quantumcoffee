import { Router } from 'express';
import { databaseReady } from '../db/connect.js';
import { loadUser, requireRole } from '../security/session.js';
import { rateLimit } from '../security/rate-limit.js';
import { overviewRange, OverviewInputError } from '../admin/overview-values.js';
import { loadOverview } from '../admin/overview-service.js';
import { loadReconciliation } from '../accounting/reconciliation.js';

export function createOverviewRouter({ isDatabaseReady = databaseReady, service = loadOverview, reconciliation = loadReconciliation } = {}) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use((_req, res, next) => isDatabaseReady() ? next() : res.status(503).json({ code: 'SERVICE_UNAVAILABLE', error: 'Overview service is unavailable.' }));
  router.use(loadUser, requireRole('admin'), rateLimit({ windowMs: 60000, limit: 30 }));
  router.get('/reconciliation', async (req, res, next) => {
    if (Object.keys(req.query).length) return res.status(400).json({ code: 'INVALID_QUERY', error: 'Reconciliation does not accept query parameters.' });
    try { res.json({ reconciliation: await reconciliation() }); } catch (error) { next(error); }
  });
  router.get('/', async (req, res, next) => {
    try { res.json({ overview: await service(overviewRange(req.query)) }); }
    catch (error) {
      if (error instanceof OverviewInputError) return res.status(400).json({ code: error.code, error: error.message });
      next(error);
    }
  });
  return router;
}
export default createOverviewRouter();
