import { Request, Response } from 'express';
import { z } from 'zod';
import { Repository } from '../infrastructure/db/repository.js';
import { updateHotPaymentState } from '../infrastructure/redis/redis-client.js';
import { correlationEngine } from '../domain/payment/correlation-engine.js';

const sdkEventSchema = z.object({
  merchant_id: z.string().min(1),
  payment_attempt_id: z.string().min(1),
  events: z.array(
    z.object({
      event: z.string().min(1),
      timestamp: z.string(),
      source: z.literal('sdk'),
      metadata: z.record(z.any()).optional(),
    })
  ),
});

export async function ingestSDKEvents(req: Request, res: Response): Promise<void> {
  try {
    const data = sdkEventSchema.parse(req.body);

    const createEvents = data.events.map((e) => ({
      paymentAttemptId: data.payment_attempt_id,
      merchantId: data.merchant_id,
      eventType: e.event,
      source: 'sdk',
      payload: e.metadata || {},
      occurredAt: new Date(e.timestamp),
    }));

    await Repository.createPaymentEvents(createEvents);

    const lastEvent = data.events[data.events.length - 1];
    if (lastEvent) {
      await updateHotPaymentState(data.payment_attempt_id, {
        lastEvent: lastEvent.event,
        lastEventAt: lastEvent.timestamp,
      });

      await correlationEngine.processSDKEvent(data.payment_attempt_id, data.merchant_id, data.events);
    }

    res.status(200).json({ success: true, count: data.events.length });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
}
