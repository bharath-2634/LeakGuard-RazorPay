import { EligibilityContext, InterventionDefinition, InterventionType } from './intervention.types.js';
import { INTERVENTION_DEFINITIONS } from './intervention-definitions.js';
import { CAUSE_INTERVENTION_MAP } from './cause-catalog.js';

export const INTERVENTION_CATALOG_VERSION = 'v1';

export function getInterventionsForCause(cause: string): InterventionDefinition[] {
  const normalizedCause = (cause || '').toUpperCase().trim();
  const types = CAUSE_INTERVENTION_MAP[normalizedCause] || [];
  return types
    .map((type) => INTERVENTION_DEFINITIONS[type])
    .filter((def): def is InterventionDefinition => Boolean(def));
}

export function getIntervention(type: InterventionType): InterventionDefinition | null {
  return INTERVENTION_DEFINITIONS[type] || null;
}

export function getEligibleInterventionsForContext(context: EligibilityContext): InterventionDefinition[] {
  const causeCandidates = getInterventionsForCause(context.cause);

  return causeCandidates.filter((def) => {
    // 1. Enabled check
    if (!def.enabled) return false;

    // 2. Customer Data Capabilities Check
    if (def.requiredCustomerData.length > 0 && context.customerData) {
      for (const field of def.requiredCustomerData) {
        if (field === 'email' && !context.customerData.email) return false;
        if (field === 'phone' && !context.customerData.phone) return false;
        if (field === 'paymentAttemptId' && !context.customerData.paymentAttemptId) return false;
        if (field === 'customerIdentity' && !context.customerData.customerIdentity && !context.customerData.email && !context.customerData.phone) return false;
      }
    }

    // 3. Merchant Configuration Capabilities Check
    if (def.requiredMerchantConfig.length > 0 && context.merchantConfig) {
      for (const configKey of def.requiredMerchantConfig) {
        if (configKey === 'emailEnabled' && context.merchantConfig.emailEnabled === false) return false;
        if (configKey === 'smsEnabled' && context.merchantConfig.smsEnabled === false) return false;
        if (configKey === 'whatsappEnabled' && context.merchantConfig.whatsappEnabled === false) return false;
        if (configKey === 'humanReviewEnabled' && context.merchantConfig.humanReviewEnabled === false) return false;
        if (configKey === 'humanReviewContact' && !context.merchantConfig.humanReviewContact) return false;
      }
    }

    // 4. Payment State / Safety Rule Check
    if (def.requiresResolutionCheck && context.paymentState) {
      if (context.paymentState.isResolved) return false; // Payment already resolved
      if (context.paymentState.isDefinitivelyFailed === false) return false; // Not confirmed failed yet
    }

    return true;
  });
}
