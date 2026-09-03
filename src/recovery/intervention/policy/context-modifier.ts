import { InterventionType } from '../catalog/intervention.types.js';
import { CustomerContext, EventContext } from './policy.types.js';

export interface ContextModifier {
  contextualLimit: number;
  contextualCoolOffSeconds: number;
  reason?: string;
}

export function getContextModifier(
  customerContext: CustomerContext = {},
  eventContext: EventContext = {},
  interventionType: InterventionType
): ContextModifier {
  if (
    eventContext.businessState === 'RESOLVED' ||
    eventContext.providerState === 'CAPTURED' ||
    eventContext.revenueObligationStatus === 'RESOLVED'
  ) {
    return {
      contextualLimit: 0,
      contextualCoolOffSeconds: 0,
      reason: 'Revenue obligation is already resolved',
    };
  }

  const failedAttempts = customerContext.previousFailedRecoveryAttempts ?? 0;
  if (failedAttempts >= 2) {
    return {
      contextualLimit: 0,
      contextualCoolOffSeconds: 0,
      reason: `Two or more failed recovery attempts exist for ${interventionType}`,
    };
  }

  if (failedAttempts === 1) {
    return {
      contextualLimit: 1,
      contextualCoolOffSeconds: 0,
      reason: `One previous failed recovery attempt exists for ${interventionType}`,
    };
  }

  return { contextualLimit: Number.MAX_SAFE_INTEGER, contextualCoolOffSeconds: 0 };
}
