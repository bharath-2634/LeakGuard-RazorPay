import { Repository } from '../../infrastructure/db/repository.js';
import { updateHotPaymentState } from '../../infrastructure/redis/redis-client.js';
import { CauseQualificationEngine, RiskEventPayload } from '../risk-event/cause-qualification-engine.js';

export class CorrelationEngine {
  private static instance: CorrelationEngine | null = null;

  public static getInstance(): CorrelationEngine {
    if (!CorrelationEngine.instance) {
      CorrelationEngine.instance = new CorrelationEngine();
    }
    return CorrelationEngine.instance;
  }

  public async processRazorpayWebhook(webhookData: {
    merchantId: string;
    eventType: string;
    payload: any;
  }): Promise<{ processed: boolean; riskEventEmitted: boolean; payload?: RiskEventPayload }> {
    const { merchantId, eventType, payload } = webhookData;
    const paymentObj = payload.payload?.payment?.entity || {};
    const orderId = paymentObj.order_id || payload.payload?.order?.entity?.id;
    const paymentId = paymentObj.id;

    if (!orderId && !paymentId) {
      return { processed: false, riskEventEmitted: false };
    }

    const attempt = await Repository.findPaymentAttemptByOrderOrPayment(merchantId, orderId, paymentId);

    if (!attempt) {
      return { processed: false, riskEventEmitted: false };
    }

    let newProviderState = attempt.providerState;
    let newBusinessState = attempt.businessState;
    let isResolved = attempt.revenueObligationResolved;

    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      newProviderState = 'CAPTURED';
      newBusinessState = 'RESOLVED';
      isResolved = true;

      // Transactionally resolve PaymentAttempt and RevenueObligation
      await Repository.resolvePaymentAndObligation(
        attempt.merchantId,
        attempt.merchantOrderId,
        attempt.id,
        paymentId || attempt.razorpayPaymentId || ''
      );
    } else if (eventType === 'payment.authorized') {
      newProviderState = 'AUTHORIZED';
      await Repository.updatePaymentAttempt(attempt.id, {
        razorpayPaymentId: paymentId || attempt.razorpayPaymentId,
        providerState: newProviderState,
      });
    } else if (eventType === 'payment.failed') {
      if (attempt.providerState !== 'CAPTURED') {
        newProviderState = 'FAILED';
        await Repository.updatePaymentAttempt(attempt.id, {
          razorpayPaymentId: paymentId || attempt.razorpayPaymentId,
          providerState: newProviderState,
        });
      }
    }

    await updateHotPaymentState(attempt.id, {
      razorpayPaymentId: paymentId || attempt.razorpayPaymentId,
      providerState: newProviderState,
      businessState: newBusinessState,
      revenueObligationResolved: isResolved,
      lastEvent: eventType,
      lastEventAt: new Date().toISOString(),
    });

    if (isResolved) {
      return { processed: true, riskEventEmitted: false };
    }

    if (!isResolved && newProviderState === 'FAILED') {
      const errorObj = paymentObj.error_code || paymentObj.error_reason ? {
        code: paymentObj.error_code,
        description: paymentObj.error_description,
        source: paymentObj.error_source,
        step: paymentObj.error_step,
        reason: paymentObj.error_reason,
      } : undefined;

      const eventsList = attempt.paymentEvents || [];
      const sdkEvents = eventsList
        .filter((e: any) => e.source === 'sdk')
        .map((e: any) => e.eventType);

      const merchantErrEvents = eventsList
        .filter((e: any) => e.source === 'merchant')
        .map((e: any) => e.payload);

      const riskPayload = CauseQualificationEngine.qualifyAndBuildRiskEvent({
        paymentAttemptId: attempt.id,
        merchantId: attempt.merchantId,
        merchantOrderId: attempt.merchantOrderId,
        razorpayOrderId: attempt.razorpayOrderId || undefined,
        razorpayPaymentId: paymentId || attempt.razorpayPaymentId || undefined,
        customerId: attempt.customerId || undefined,
        amount: attempt.amount,
        currency: attempt.currency,
        providerState: newProviderState,
        razorpayError: errorObj,
        merchantTelemetryErrors: merchantErrEvents,
        sdkJourneyEvents: sdkEvents,
        sources: ['razorpay', ...(sdkEvents.length > 0 ? ['sdk'] : []), ...(merchantErrEvents.length > 0 ? ['merchant'] : [])],
      });

      if (riskPayload) {
        await CauseQualificationEngine.emitRiskEvent(riskPayload);
        return { processed: true, riskEventEmitted: true, payload: riskPayload };
      }
    }

    return { processed: true, riskEventEmitted: false };
  }

  public async processSDKEvent(paymentAttemptId: string, merchantId: string, events: any[]): Promise<void> {
    // SDK events update journey history
  }

  public async processMerchantTelemetry(paymentAttemptId: string, telemetry: any): Promise<void> {
    const attempt = await Repository.findPaymentAttemptById(paymentAttemptId);

    if (attempt && !attempt.revenueObligationResolved && telemetry.status >= 500) {
      const riskPayload = CauseQualificationEngine.qualifyAndBuildRiskEvent({
        paymentAttemptId: attempt.id,
        merchantId: attempt.merchantId,
        merchantOrderId: attempt.merchantOrderId,
        amount: attempt.amount,
        currency: attempt.currency,
        providerState: attempt.providerState,
        merchantTelemetryErrors: [telemetry],
        sources: ['merchant'],
      });

      if (riskPayload) {
        await CauseQualificationEngine.emitRiskEvent(riskPayload);
      }
    }
  }
}

export const correlationEngine = CorrelationEngine.getInstance();
