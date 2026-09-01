import { prisma } from './prisma-client.js';
import { EventContext, MerchantContext, UserContext, ValidationContext } from '../../domain/interfaces.js';

export async function loadValidationData(params: {
  riskEventId: string;
  paymentAttemptId: string;
  merchantId: string;
  merchantOrderId: string;
}): Promise<ValidationContext> {
  const { riskEventId, paymentAttemptId, merchantId, merchantOrderId } = params;

  // Use batched queries or parallel promises to load context quickly
  const [
    riskEvent,
    paymentAttempt,
    merchant,
    economics,
    paymentEvents,
    webhookEvents
  ] = await Promise.all([
    prisma.riskEvent.findUnique({ where: { id: riskEventId } }),
    prisma.paymentAttempt.findUnique({ where: { id: paymentAttemptId } }),
    prisma.merchant.findUnique({ where: { id: merchantId } }),
    prisma.merchantEconomics.findUnique({ where: { merchantId: merchantId } }),
    prisma.paymentEvent.findMany({ where: { paymentAttemptId }, orderBy: { occurredAt: 'asc' } }),
    prisma.razorpayWebhookEvent.findMany({ where: { merchantId, orderId: merchantOrderId }, orderBy: { receivedAt: 'asc' } })
  ]);

  if (!riskEvent || !paymentAttempt || !merchant) {
    throw new Error(`Critical validation data missing for RiskEvent ${riskEventId}`);
  }

  // Construct Event Context
  let errorCode, errorSource, errorStep, errorReason, errorDescription;
  
  // Basic parsing for Razorpay Webhook Errors (deterministic)
  for (const wh of webhookEvents) {
    if (wh.eventType === 'payment.failed' && typeof wh.payload === 'object' && wh.payload !== null) {
      const p = wh.payload as any;
      const errorEntity = p.payload?.payment?.entity?.error;
      if (errorEntity) {
        errorCode = errorEntity.code;
        errorSource = errorEntity.source;
        errorStep = errorEntity.step;
        errorReason = errorEntity.reason;
        errorDescription = errorEntity.description;
      }
    }
  }

  const eventContext: EventContext = {
    riskEventId: riskEvent.id,
    paymentAttemptId: paymentAttempt.id,
    merchantOrderId: paymentAttempt.merchantOrderId,
    amount: paymentAttempt.amount,
    currency: paymentAttempt.currency,
    providerState: paymentAttempt.providerState,
    errorCode,
    errorSource,
    errorStep,
    errorReason,
    errorDescription,
    journeyEvents: paymentEvents.map(e => e.payload),
    timestamps: {
      startedAt: paymentAttempt.startedAt,
      emittedAt: riskEvent.emittedAt,
    }
  };

  const userContext: UserContext = {
    customerId: paymentAttempt.customerId,
    customerSegment: paymentAttempt.customerSegment,
    customerValueSegment: paymentAttempt.customerValueSegment,
    historicalLtv: paymentAttempt.historicalLtv,
    previousAttemptCount: riskEvent.attemptCount, 
  };

  const merchantContext: MerchantContext = {
    merchantId: merchant.id,
    currency: merchant.defaultCurrency,
    timezone: merchant.timezone,
    defaultMarginRate: economics?.defaultMarginRate ?? 0.20,
    categoryEconomics: (economics?.categoryEconomics as Record<string, any>) || {},
    baseRecoveryCost: economics?.baseRecoveryCost ?? 5.0,
    minimumRecoveryThreshold: economics?.minimumRecoveryThreshold ?? 0.0,
    maxRecoveryCost: economics?.maxRecoveryCost ?? 0.0,
    economicsVersion: economics?.version ?? 1,
    orderCategory: paymentAttempt.orderCategory
  };

  return {
    event: eventContext,
    user: userContext,
    merchant: merchantContext
  };
}
