import { ExecutionContext, ExecutionRequest } from '../types/execution.types.js';

export class ExecutionContextError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export function resolveExecutionContext(request: ExecutionRequest): ExecutionContext {
  const snapshot = request.recoveryContext || {};
  const merchant = (snapshot.merchant || {}) as Record<string, any>;
  const customer = (snapshot.customer || {}) as Record<string, any>;
  const payment = (snapshot.payment || {}) as Record<string, any>;
  const event = (snapshot.event || {}) as Record<string, any>;
  const diagnosis = (snapshot.diagnosis || {}) as Record<string, any>;
  const order = (snapshot.order || {}) as Record<string, any>;

  const paymentAttemptId = request.paymentAttemptId || event.paymentAttemptId || payment.paymentAttemptId;
  const merchantId = request.merchantId || event.merchantId || merchant.id;
  if (!request.policyEvaluationId || !paymentAttemptId || !merchantId || !request.intervention?.type) {
    throw new ExecutionContextError('EXECUTION_CONTEXT_INVALID', 'Execution request is missing required identifiers');
  }
  if (typeof payment.amount !== 'number' && typeof event.amount !== 'number') {
    throw new ExecutionContextError('EXECUTION_CONTEXT_INVALID', 'Execution request is missing payment amount');
  }

  const recoveryConfig = merchant.recoveryConfig || {};
  const policy = request.policy;
  return Object.freeze({
    executionRequestId: request.policyEvaluationId,
    riskEventId: request.riskEventId,
    validationResultId: request.validationResultId,
    merchant: {
      id: merchantId,
      name: String(merchant.name || merchantId),
      timezone: String(merchant.timezone || 'UTC'),
      defaultCurrency: String(merchant.defaultCurrency || payment.currency || event.currency || 'INR'),
      recoveryEnabled: merchant.recoveryEnabled !== false,
      recoveryConfig: {
        emailEnabled: recoveryConfig.emailEnabled === true,
        smsEnabled: recoveryConfig.smsEnabled === true,
        whatsappEnabled: recoveryConfig.whatsappEnabled === true,
        humanReviewEnabled: recoveryConfig.humanReviewEnabled === true,
        humanReviewEmail: recoveryConfig.humanReviewEmail || null,
        humanReviewPhone: recoveryConfig.humanReviewPhone || null,
      },
    },
    customer: {
      id: customer.id || null,
      externalCustomerId: customer.externalCustomerId || null,
      name: customer.name || null,
      email: customer.email || null,
      phone: customer.phone || null,
    },
    payment: {
      paymentAttemptId,
      merchantOrderId: String(event.merchantOrderId || order.merchantOrderId || ''),
      razorpayOrderId: payment.razorpayOrderId || null,
      amount: Number(payment.amount ?? event.amount),
      currency: String(payment.currency || event.currency || merchant.defaultCurrency || 'INR'),
      providerState: String(payment.providerState || 'UNKNOWN'),
      businessState: String(payment.businessState || 'UNKNOWN'),
      revenueObligationStatus: payment.revenueObligationStatus,
    },
    intervention: { ...request.intervention },
    policy: { ...policy, evaluationId: request.policyEvaluationId },
    diagnosis: {
      cause: String(diagnosis.cause || diagnosis.diagnosedCause || 'UNKNOWN'),
      confidence: Number(diagnosis.confidence || 0),
      actionabilityScore: Number(diagnosis.actionabilityScore || 0),
      priority: String(diagnosis.priority || 'UNKNOWN'),
    },
    economics: { ...((snapshot.economics || {}) as Record<string, unknown>) },
    evidence: { ...((snapshot.evidence || {}) as Record<string, unknown>) },
    correlationId: request.correlationId || String((snapshot.metadata as any)?.correlationId || request.policyEvaluationId),
  });
}
