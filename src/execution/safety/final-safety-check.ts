import { getIntervention } from '../../recovery/intervention/catalog/intervention-catalog.js';
import { ExecutionContext, SafetyCheckResult } from '../types/execution.types.js';

export function runFinalSafetyCheck(context: ExecutionContext): SafetyCheckResult {
  const definition = getIntervention(context.intervention.type as any);
  const revenueUnresolved = context.payment.businessState !== 'RESOLVED' &&
    context.payment.providerState !== 'CAPTURED' &&
    context.payment.revenueObligationStatus !== 'RESOLVED';
  const recoveryEnabled = context.merchant.recoveryEnabled;
  const policyAllowed = context.policy.decision === 'ALLOWED';
  const attemptsAvailable = context.policy.attemptsUsed < context.policy.maxAttempts && context.policy.attemptsRemaining > 0;
  const requiredDataAvailable = (definition?.requiredCustomerData || []).every((field) => {
    if (field === 'paymentAttemptId') return Boolean(context.payment.paymentAttemptId);
    if (field === 'customerIdentity') return Boolean(context.customer.id || context.customer.externalCustomerId || context.customer.email || context.customer.phone);
    if (field === 'email') return Boolean(context.customer.email);
    if (field === 'phone') return Boolean(context.customer.phone);
    return true;
  });
  const interventionEnabled = definition?.enabled !== false && (() => {
    const config = context.merchant.recoveryConfig;
    if (context.intervention.type === 'SEND_EMAIL') return config.emailEnabled;
    if (context.intervention.type === 'SEND_SMS') return config.smsEnabled;
    if (context.intervention.type === 'SEND_WHATSAPP') return config.whatsappEnabled;
    if (context.intervention.type === 'HUMAN_REVIEW') return config.humanReviewEnabled;
    return true;
  })();
  const checks = { revenueUnresolved, recoveryEnabled, policyAllowed, attemptsAvailable, requiredDataAvailable, interventionEnabled };
  const failed = Object.entries(checks).find(([, passed]) => !passed)?.[0];
  return { safe: !failed, reason: failed ? `Final safety check failed: ${failed}` : undefined, checks };
}
