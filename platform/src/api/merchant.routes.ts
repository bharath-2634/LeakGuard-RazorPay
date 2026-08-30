import { Router } from 'express';
import { createMerchant, connectRazorpay, updateEconomics, getMerchant } from './merchant.controller.js';

const router = Router();

router.post('/merchants', createMerchant);
router.post('/merchants/:merchantId/razorpay/connect', connectRazorpay);
router.put('/merchants/:merchantId/economics', updateEconomics);
router.get('/merchants/:merchantId', getMerchant);

export default router;
