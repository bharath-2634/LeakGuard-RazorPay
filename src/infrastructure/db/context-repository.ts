import { prisma } from './prisma-client.js';
import { EventContext, MerchantContext, UserContext, ValidationContext } from '../../domain/interfaces.js';

export async function loadValidationData(params: {
  riskEventId: string;
  paymentAttemptId: string;
  merchantId: string;
  merchantOrderId: string;
}): Promise<ValidationContext> {
  const { riskEventId, paymentAttemptId, merchantId, merchantOrderId } = params;

  const riskEvent = await prisma.riskEvent.findUnique({ where: { id: riskEventId } });
  const paymentAttempt = await prisma.paymentAttempt.findUnique({ where: { id: paymentAttemptId } });
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  const economics = await prisma.merchantEconomics.findUnique({ where: { merchantId } });
  const recoveryConfig = await prisma.merchantRecoveryConfig.findUnique({ where: { merchantId } });
  const recoveryPolicy = await prisma.merchantRecoveryPolicy.findUnique({ where: { merchantId } });
  const previousRecoveryAttempts = await prisma.recoveryAttempt.findMany({
    where: { merchantId, paymentAttemptId },
    orderBy: { attemptedAt: 'asc' },
    select: { interventionType: true, status: true, attemptedAt: true, completedAt: true },
  });
  const paymentEvents = await prisma.paymentEvent.findMany({ where: { paymentAttemptId }, orderBy: { occurredAt: 'asc' } });

  if (!riskEvent || !paymentAttempt || !merchant) {
    throw new Error(`Critical validation data missing for RiskEvent ${riskEventId}`);
  }

  const webhookEvents = await prisma.razorpayWebhookEvent.findMany({
    where: {
      merchantId,
      OR: [
        { orderId: merchantOrderId },
        { orderId: paymentAttempt.razorpayOrderId || '' }
      ]
    },
    orderBy: { receivedAt: 'asc' }
  });

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
    causeEvidence: (riskEvent.payload as any)?.cause_evidence,
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
    recoveryPolicy: recoveryPolicy ? {
      recoveryEnabled: recoveryPolicy.recoveryEnabled,
      version: `merchant-v${recoveryPolicy.version}`,
      RETRY_PAYMENT: { allowed: recoveryPolicy.retryAllowed ?? undefined, maxAttempts: recoveryPolicy.retryMaxAttempts ?? undefined, coolOffSeconds: recoveryPolicy.retryCoolOffSeconds ?? undefined },
      SEND_SMS: { allowed: recoveryPolicy.smsAllowed ?? undefined, maxAttempts: recoveryPolicy.smsMaxAttempts ?? undefined, coolOffSeconds: recoveryPolicy.smsCoolOffSeconds ?? undefined },
      SEND_WHATSAPP: { allowed: recoveryPolicy.whatsappAllowed ?? undefined, maxAttempts: recoveryPolicy.whatsappMaxAttempts ?? undefined, coolOffSeconds: recoveryPolicy.whatsappCoolOffSeconds ?? undefined },
      SEND_EMAIL: { allowed: recoveryPolicy.emailAllowed ?? undefined, maxAttempts: recoveryPolicy.emailMaxAttempts ?? undefined, coolOffSeconds: recoveryPolicy.emailCoolOffSeconds ?? undefined },
      SEND_PAYMENT_LINK: { allowed: recoveryPolicy.paymentLinkAllowed ?? undefined, maxAttempts: recoveryPolicy.paymentLinkMaxAttempts ?? undefined, coolOffSeconds: recoveryPolicy.paymentLinkCoolOffSeconds ?? undefined },
      CHANGE_PAYMENT_METHOD_PROMPT: { allowed: recoveryPolicy.paymentMethodPromptAllowed ?? undefined, maxAttempts: recoveryPolicy.paymentMethodPromptMaxAttempts ?? undefined, coolOffSeconds: recoveryPolicy.paymentMethodPromptCoolOffSeconds ?? undefined },
      HUMAN_REVIEW: { allowed: recoveryPolicy.humanReviewAllowed ?? undefined, maxAttempts: recoveryPolicy.humanReviewMaxAttempts ?? undefined, coolOffSeconds: undefined },
    } as any : undefined,
  };

  return {
    event: eventContext,
    user: userContext,
    merchant: merchantContext,
    previousRecoveryAttempts,
  };
}
