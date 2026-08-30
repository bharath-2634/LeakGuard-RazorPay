import { Router } from 'express';
import { ingestMerchantTelemetry } from './telemetry.controller.js';

const router = Router();

router.post('/merchant-telemetry', ingestMerchantTelemetry);

export default router;
