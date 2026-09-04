import { Router } from 'express';
import {
  stopRecoveryHandler,
  getRecoveriesHandler,
  getRecoveryDetailHandler,
  getSingleRecoveryAuditHandler,
  getMerchantAuditsHandler,
  getRecoveryMetricsHandler,
} from './recovery.controller.js';

const router = Router();

// Merchant Recovery Control
router.post('/recoveries/:riskEventId/stop', stopRecoveryHandler);

// Recovery Read APIs
router.get('/recoveries', getRecoveriesHandler);
router.get('/recoveries/:riskEventId', getRecoveryDetailHandler);

// Audit Read APIs
router.get('/recoveries/:riskEventId/audit', getSingleRecoveryAuditHandler);
router.get('/audits', getMerchantAuditsHandler);

// Recovery Metrics API
router.get('/recovery-metrics', getRecoveryMetricsHandler);

export default router;
