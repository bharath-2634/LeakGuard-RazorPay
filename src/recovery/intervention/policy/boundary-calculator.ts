import { getIntervention } from '../catalog/intervention-catalog.js';
import { InterventionType } from '../catalog/intervention.types.js';
import { getContextModifier } from './context-modifier.js';
import {
  EffectiveBoundary,
  EventContext,
  GlobalPolicy,
  MerchantPolicy,
  RecoveryAttemptRecord,
  CustomerContext,
} from './policy.types.js';

const EXECUTION_ATTEMPT_STATUSES = new Set(['EXECUTION_STARTED', 'EXECUTED', 'FAILED', 'SKIPPED', 'RESOLVED']);

function toTimestamp(value: Date | string | null | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

export function getEffectiveBoundary(
  globalPolicy: GlobalPolicy,
  merchantPolicy: MerchantPolicy,
  customerContext: CustomerContext,
  eventContext: EventContext,
  interventionType: InterventionType,
  attempts: RecoveryAttemptRecord[] = []
): EffectiveBoundary {
  const global = globalPolicy[interventionType];
  const merchant = merchantPolicy[interventionType] || {};
  const definition = getIntervention(interventionType);
  const modifier = getContextModifier(customerContext, eventContext, interventionType);
  const actualAttempts = attempts.filter(
    (attempt) => attempt.interventionType === interventionType && EXECUTION_ATTEMPT_STATUSES.has(attempt.status)
  );
  const latestAttempt = actualAttempts
    .map((attempt) => toTimestamp(attempt.attemptedAt))
    .filter((timestamp): timestamp is number => timestamp !== undefined)
    .sort((a, b) => b - a)[0];
  const secondsSinceLastAttempt = latestAttempt === undefined
    ? undefined
    : Math.max(0, Math.floor((Date.now() - latestAttempt) / 1000));
  const maxAttempts = Math.max(0, Math.min(
    global.maxAttempts,
    merchant.maxAttempts ?? global.maxAttempts,
    modifier.contextualLimit
  ));
  const coolOffSeconds = Math.max(
    global.coolOffSeconds,
    merchant.coolOffSeconds ?? global.coolOffSeconds,
    modifier.contextualCoolOffSeconds
  );
  const merchantAllowed = merchant.allowed ?? true;
  const missingRequirements = (definition?.requiredCustomerData || []).filter((requirement) => {
    if (requirement === 'paymentAttemptId') return !eventContext.paymentAttemptId;
    if (requirement === 'customerIdentity') return !eventContext.customerIdentity && !eventContext.customerEmail && !eventContext.customerPhone;
    if (requirement === 'email') return !eventContext.customerEmail;
    if (requirement === 'phone') return !eventContext.customerPhone;
    return false;
  });
  const missingMerchantRequirements = (definition?.requiredMerchantConfig || []).filter((requirement) => {
    if (requirement === 'emailEnabled') return eventContext.merchantConfig?.emailEnabled !== true;
    if (requirement === 'smsEnabled') return eventContext.merchantConfig?.smsEnabled !== true;
    if (requirement === 'whatsappEnabled') return eventContext.merchantConfig?.whatsappEnabled !== true;
    if (requirement === 'humanReviewEnabled') return eventContext.merchantConfig?.humanReviewEnabled !== true;
    if (requirement === 'humanReviewContact') return !eventContext.merchantConfig?.humanReviewContact;
    return false;
  });
  const allowed = Boolean(
    merchantPolicy.recoveryEnabled &&
    merchantAllowed &&
    definition?.enabled !== false &&
    missingRequirements.length === 0 &&
    missingMerchantRequirements.length === 0
  );
  const reason = !merchantPolicy.recoveryEnabled
    ? 'Merchant recovery kill switch is disabled'
    : !merchantAllowed
      ? 'Intervention is disabled by merchant policy'
      : missingRequirements.length > 0
        ? `Missing required customer data: ${missingRequirements.join(', ')}`
        : missingMerchantRequirements.length > 0
          ? `Missing required merchant configuration: ${missingMerchantRequirements.join(', ')}`
      : modifier.reason;

  return {
    interventionType,
    allowed,
    maxAttempts,
    attemptsUsed: actualAttempts.length,
    attemptsRemaining: Math.max(0, maxAttempts - actualAttempts.length),
    coolOffSeconds,
    secondsSinceLastAttempt,
    complianceRequired: ['SEND_SMS', 'SEND_WHATSAPP', 'SEND_EMAIL'].includes(interventionType),
    requiresHumanApproval: definition?.requiresHumanApproval ?? false,
    reason,
    policyVersion: merchantPolicy.version,
  };
}
