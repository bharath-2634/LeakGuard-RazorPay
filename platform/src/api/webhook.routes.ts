import { Router } from 'express';
import { handleRazorpayWebhook } from './webhook.controller.js';

const router = Router();

router.post('/webhooks/razorpay', handleRazorpayWebhook);

export default router;
