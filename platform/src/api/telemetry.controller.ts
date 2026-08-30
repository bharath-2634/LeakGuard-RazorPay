import { Request, Response } from 'express';
import { z } from 'zod';
import { Repository } from '../infrastructure/db/repository.js';
import { correlationEngine } from '../domain/payment/correlation-engine.js';

const merchantTelemetrySchema = z.object({
  merchant_id: z.string().min(1),
  payment_attempt_id: z.string().optional(),
  merchant_order_id: z.string().optional(),
  request_id: z.string().optional(),
  trace_id: z.string().optional(),
  service: z.string().optional().default('merchant-backend'),
  event_type: z.string().min(1),
  status: z.number().optional(),
  latency_ms: z.number().optional(),
  error_code: z.string().optional(),
  severity: z.enum(['INFO', 'WARN', 'ERROR']).optional().default('ERROR'),
});

export async function ingestMerchantTelemetry(req: Request, res: Response): Promise<void> {
  try {
    const data = merchantTelemetrySchema.parse(req.body);

    let paymentAttemptId = data.payment_attempt_id;

    if (!paymentAttemptId && data.merchant_order_id) {
      const attempt = await Repository.findPaymentAttemptByOrderOrPayment(data.merchant_id, data.merchant_order_id);
      if (attempt) {
        paymentAttemptId = attempt.id;
      }
    }

    if (paymentAttemptId) {
      await Repository.createPaymentEvents([
        {
          paymentAttemptId,
          merchantId: data.merchant_id,
          eventType: data.event_type,
          source: 'merchant',
          payload: {
            request_id: data.request_id,
            trace_id: data.trace_id,
            service: data.service,
            status: data.status,
            latency_ms: data.latency_ms,
            error_code: data.error_code,
            severity: data.severity,
          },
          occurredAt: new Date(),
          correlationId: data.trace_id || data.request_id,
        },
      ]);

      await correlationEngine.processMerchantTelemetry(paymentAttemptId, data);
    }

    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
}
