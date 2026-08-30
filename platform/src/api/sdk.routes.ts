import { Router } from 'express';
import { ingestSDKEvents } from './sdk.controller.js';

const router = Router();

router.post('/sdk/events', ingestSDKEvents);

export default router;
