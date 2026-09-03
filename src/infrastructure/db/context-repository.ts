import { prisma } from './prisma-client.js';
import { EventContext, MerchantContext, UserContext, ValidationContext } from '../../domain/interfaces.js';

export async function loadValidationData(params: {
  riskEventId: string;
  paymentAttemptId: string;
  merchantId: string;
  merchantOrderId: string;
}): Promise<ValidationContext> {
  const { riskEventId, paymentAttemptId, merchantId, merchantOrderId } = params;

  // Query risk event, attempt, merchant, economics, recoveryConfig, customer in parallel
  const [
    riskEvent,
    paymentAttempt,
    merchant,
    economics,
    recoveryConfig,
    paymentEvents,
    webhookEvents
  ] = await Promise.all([
    prisma.riskEvent.findUnique({ where: { id: riskEventId } }),
    prisma.paymentAttempt.findUnique({ where: { id: paymentAttemptId } }),
    prisma.merchant.findUnique({ where: { id: merchantId } }),
    prisma.merchantEconomics.findUnique({ where: { merchantId } }),
    prisma.merchantRecoveryConfig.findUnique({ where: { merchantId } }),
    prisma.paymentEvent.findMany({ where: { paymentAttemptId }, orderBy: { occurredAt: 'asc' } }),
    prisma.razorpayWebhookEvent.findMany({ where: { merchantId, orderId: merchantOrderId }, orderBy: { receivedAt: 'asc' } })
  ]);

  if (!riskEvent || !paymentAttempt || !merchant) {
    throw new Error(`Critical validation data missing for RiskEvent ${riskEventId}`);
  }

  let customer = null;
  if (paymentAttempt.customerId) {
    customer = await prisma.customer.findUnique({ where: { id: paymentAttempt.customerId } });
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
    razorpayOrderId: paymentAttempt.razorpayOrderId || undefined,
    razorpayPaymentId: paymentAttempt.razorpayPaymentId || undefined,
    amount: paymentAttempt.amount,
    currency: paymentAttempt.currency,
    providerState: paymentAttempt.providerState,
    errorCode,
    errorSource,
    errorStep,
    errorReason,
    errorDescription,
    journeyEvents: paymentEvents.map((e: any) => e.payload),
    timestamps: {
      startedAt: paymentAttempt.startedAt,
      emittedAt: riskEvent.emittedAt,
    }
  };

  const userContext: UserContext = {
    customerId: paymentAttempt.customerId,
    customerRecord: customer ? {
      id: customer.id,
      externalCustomerId: customer.externalCustomerId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    } : undefined,
    customerSegment: paymentAttempt.customerSegment,
    customerValueSegment: paymentAttempt.customerValueSegment,
    historicalLtv: paymentAttempt.historicalLtv,
    previousAttemptCount: riskEvent.attemptCount, 
  };

  const merchantContext: MerchantContext = {
    merchantId: merchant.id,
    name: merchant.name,
    currency: merchant.defaultCurrency,
    timezone: merchant.timezone,
    defaultMarginRate: economics?.defaultMarginRate ?? 0.20,
    categoryEconomics: (economics?.categoryEconomics as any) || [],
    baseRecoveryCost: economics?.baseRecoveryCost ?? 5.0,
    minimumRecoveryThreshold: economics?.minimumRecoveryThreshold ?? 0.0,
    maxRecoveryCost: economics?.maxRecoveryCost ?? 0.0,
    economicsVersion: economics?.version ?? 1,
    orderCategory: paymentAttempt.orderCategory,
    recoveryConfig: recoveryConfig ? {
      emailEnabled: recoveryConfig.emailEnabled,
      smsEnabled: recoveryConfig.smsEnabled,
      whatsappEnabled: recoveryConfig.whatsappEnabled,
      inAppNotificationEnabled: recoveryConfig.inAppNotificationEnabled,
      humanReviewEnabled: recoveryConfig.humanReviewEnabled,
      humanReviewEmail: recoveryConfig.humanReviewEmail,
      version: recoveryConfig.version,
    } : undefined,
  };

  return {
    event: eventContext,
    user: userContext,
    merchant: merchantContext
  };
}
