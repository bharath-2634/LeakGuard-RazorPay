import { InterventionType } from '../catalog/intervention.types.js';
import { RecoveryContext } from '../selection/selection.types.js';
import { GLOBAL_SAFE_DEFAULTS, GLOBAL_POLICY_VERSION } from './global-policy.js';
import { getEffectiveBoundary } from './boundary-calculator.js';
import { evaluateIntervention } from './policy-evaluator.js';
import { MerchantPolicy, RecoveryAttemptRecord } from './policy.types.js';

function getMerchantPolicy(context: RecoveryContext): MerchantPolicy {
  return context.merchant?.recoveryPolicy || {
    recoveryEnabled: true,
    version: GLOBAL_POLICY_VERSION,
  };
}

function getAttempts(context: RecoveryContext): RecoveryAttemptRecord[] {
  return (context.previousAttempts || []).map((attempt) => ({
    interventionType: String(attempt.interventionType) as InterventionType,
    status: String(attempt.status || 'UNKNOWN'),
    attemptedAt: attempt.attemptedAt as string | undefined,
    completedAt: attempt.completedAt as string | undefined,
  }));
}

export function evaluateCandidatePolicy(
  context: RecoveryContext,
  interventionType: InterventionType
) {
  const merchantPolicy = getMerchantPolicy(context);
  const attempts = getAttempts(context);
  const attemptsForCandidate = attempts.filter((attempt) => attempt.interventionType === interventionType);
  const failedAttempts = attemptsForCandidate.filter((attempt) => attempt.status === 'FAILED').length;
  const eventContext = {
    ...context.event,
    businessState: context.payment?.businessState,
    providerState: context.payment?.providerState,
    complianceStatus: context.compliance?.[interventionType],
    complianceReason: context.complianceReasons?.[interventionType],
  };
  const boundary = getEffectiveBoundary(
    GLOBAL_SAFE_DEFAULTS,
    merchantPolicy,
    {
      customerId: context.customer?.id,
      email: context.customer?.email,
      phone: context.customer?.phone,
      previousFailedRecoveryAttempts: failedAttempts,
    },
    eventContext,
    interventionType,
    attempts
  );
  const complianceRequired = boundary.complianceRequired;
  const complianceStatus = context.compliance?.[interventionType] || (complianceRequired ? 'UNKNOWN' : 'ALLOWED');

  return evaluateIntervention(
    boundary,
    {
      attemptsUsed: boundary.attemptsUsed,
      secondsSinceLastAttempt: boundary.secondsSinceLastAttempt,
    },
    {
      status: complianceStatus,
      reason: context.complianceReasons?.[interventionType],
    },
    { recoveryEnabled: merchantPolicy.recoveryEnabled }
  );
}
