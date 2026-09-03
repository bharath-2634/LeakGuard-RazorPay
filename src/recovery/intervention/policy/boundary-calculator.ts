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
  const allowed = Boolean(merchantPolicy.recoveryEnabled && merchantAllowed && definition?.enabled !== false);
  const reason = !merchantPolicy.recoveryEnabled
    ? 'Merchant recovery kill switch is disabled'
    : !merchantAllowed
      ? 'Intervention is disabled by merchant policy'
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
