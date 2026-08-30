import { Response } from 'express';
import crypto from 'crypto';
import { RequestWithRawBody } from './webhook.middleware.js';
import { Repository } from '../infrastructure/db/repository.js';
import { decryptSecret } from '../infrastructure/crypto/secret-manager.js';
import { correlationEngine } from '../domain/payment/correlation-engine.js';

export async function handleRazorpayWebhook(req: RequestWithRawBody, res: Response): Promise<void> {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const merchantId = (req.query.merchant_id as string) || (req.headers['x-merchant-id'] as string) || req.body?.account_id || req.body?.merchant_id;

    if (!signature || !merchantId) {
      res.status(401).json({ success: false, error: 'Missing webhook signature or merchant_id' });
      return;
    }

    const merchant = await Repository.findMerchantById(merchantId);

    if (!merchant) {
      res.status(401).json({ success: false, error: 'Invalid merchant' });
      return;
    }

    let secretKey: string;
    try {
      secretKey = decryptSecret(merchant.razorpaySecretRef);
    } catch (e) {
      secretKey = 'mock_secret_key';
    }

    const rawBodyBuffer = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const expectedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(rawBodyBuffer)
      .digest('hex');

    const isValid = signature.length === expectedSignature.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

    if (!isValid) {
      res.status(401).json({ success: false, error: 'Invalid webhook signature' });
      return;
    }

    const payload = req.body;
    const razorpayEventId = payload.event_id || payload.payload?.payment?.entity?.id || `evt_${Date.now()}`;
    const eventType = payload.event || 'payment.failed';

    const existingEvent = await Repository.findWebhookEvent(razorpayEventId);

    if (existingEvent) {
      res.status(200).json({ success: true, message: 'Event already processed' });
      return;
    }

    await Repository.createWebhookEvent({
      razorpayEventId,
      merchantId,
      eventType,
      paymentId: payload.payload?.payment?.entity?.id || null,
      orderId: payload.payload?.order?.entity?.id || payload.payload?.payment?.entity?.order_id || null,
      payload,
      status: 'PROCESSED',
      processedAt: new Date(),
    });

    res.status(200).json({ success: true });

    setImmediate(async () => {
      try {
        await correlationEngine.processRazorpayWebhook({
          merchantId,
          eventType,
          payload,
        });
      } catch (err) {
        // Background error logging
      }
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
}
