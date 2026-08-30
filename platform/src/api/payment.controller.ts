import { Request, Response } from 'express';
import Razorpay from 'razorpay';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { Repository } from '../infrastructure/db/repository.js';
import { decryptSecret } from '../infrastructure/crypto/secret-manager.js';
import { setHotPaymentState } from '../infrastructure/redis/redis-client.js';
import { config } from '../config/env.js';

const createPaymentSessionSchema = z.object({
  merchantId: z.string().min(1),
  merchantOrderId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().optional().default('INR'),
  customerId: z.string().optional(),
  sessionId: z.string().optional(),
});

export async function createPaymentSession(req: Request, res: Response): Promise<void> {
  try {
    const data = createPaymentSessionSchema.parse(req.body);

    const merchant = await Repository.findMerchantById(data.merchantId);

    if (!merchant) {
      res.status(404).json({ success: false, error: 'Merchant not found' });
      return;
    }

    let razorpayOrderId: string;
    let decryptedSecret: string;

    try {
      decryptedSecret = decryptSecret(merchant.razorpaySecretRef);
    } catch (e) {
      decryptedSecret = 'mock_secret_key';
    }

    if (merchant.environment === 'test' || decryptedSecret.startsWith('mock_')) {
      razorpayOrderId = `order_rzp_${uuidv4().substring(0, 12)}`;
    } else {
      const razorpay = new Razorpay({
        key_id: merchant.razorpayKeyId,
        key_secret: decryptedSecret,
      });

      const rzpOrder = await razorpay.orders.create({
        amount: Math.round(data.amount * 100),
        currency: data.currency,
        receipt: data.merchantOrderId,
      });

      razorpayOrderId = rzpOrder.id;
    }

    const paymentAttemptId = `pa_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    const expiresAt = new Date(Date.now() + config.defaultSessionTtlSeconds * 1000);

    const paymentAttempt = await Repository.createPaymentAttempt({
      id: paymentAttemptId,
      merchantId: merchant.id,
      customerId: data.customerId || null,
      sessionId: data.sessionId || null,
      merchantOrderId: data.merchantOrderId,
      razorpayOrderId,
      amount: data.amount,
      currency: data.currency,
      providerState: 'CREATED',
      businessState: 'UNRESOLVED',
      revenueObligationResolved: false,
      expiresAt,
    });

    await setHotPaymentState({
      paymentAttemptId: paymentAttempt.id,
      merchantId: merchant.id,
      merchantOrderId: data.merchantOrderId,
      razorpayOrderId,
      providerState: 'CREATED',
      businessState: 'UNRESOLVED',
      revenueObligationResolved: false,
      expiresAt: expiresAt.toISOString(),
      version: 1,
    });

    res.status(201).json({
      success: true,
      paymentAttemptId: paymentAttempt.id,
      merchantOrderId: data.merchantOrderId,
      razorpayOrderId,
      razorpayKeyId: merchant.razorpayKeyId,
      amount: data.amount,
      currency: data.currency,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to create payment session' });
  }
}

export async function getPaymentAttempt(req: Request, res: Response): Promise<void> {
  try {
    const paymentAttemptId = req.params.paymentAttemptId as string;
    const paymentAttempt = await Repository.findPaymentAttemptById(paymentAttemptId);

    if (!paymentAttempt) {
      res.status(404).json({ success: false, error: 'Payment attempt not found' });
      return;
    }

    res.json({ success: true, paymentAttempt });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
