import { Router } from 'express';
import { createPaymentSession, getPaymentAttempt } from './payment.controller.js';

const router = Router();

router.post('/payments/session', createPaymentSession);
router.get('/payment-attempts/:paymentAttemptId', getPaymentAttempt);

export default router;
