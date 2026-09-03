import { DiagnosisResult, EconomicResult, EventContext, MerchantContext } from './interfaces.js';

export function calculateEconomics(
  event: EventContext,
  merchant: MerchantContext,
  diagnosis: DiagnosisResult
): EconomicResult {
  const revenueAtRisk = event.amount; // V
  
  // Economic Factor (M)
  const category = merchant.orderCategory || 'default';
  let categoryMargin: number | undefined;
  if (Array.isArray(merchant.categoryEconomics)) {
    const matched = merchant.categoryEconomics.find((c: any) => c.category === category || c.name === category);
    if (matched) categoryMargin = typeof matched.marginRate === 'number' ? matched.marginRate : matched.margin_rate;
  } else if (merchant.categoryEconomics && typeof merchant.categoryEconomics === 'object') {
    const item = merchant.categoryEconomics[category];
    if (typeof item === 'number') categoryMargin = item;
    else if (item) categoryMargin = item.marginRate ?? item.margin_rate;
  }
  const economicFactor = typeof categoryMargin === 'number' ? categoryMargin : merchant.defaultMarginRate;

  // Recovery Probability (P_recovery) baseline
  let recoveryProbability = 0.40; // Default
  if (diagnosis.diagnosedCause === 'INSUFFICIENT_FUNDS') recoveryProbability = 0.25;
  else if (diagnosis.diagnosedCause === '3DS_OTP_ABANDONMENT') recoveryProbability = 0.60;

  // ERV = V * M * P_recovery
  const expectedRecoveryValue = revenueAtRisk * economicFactor * recoveryProbability;

  const recoveryCost = merchant.baseRecoveryCost;
  
  // NER = ERV - C_recovery
  const netExpectedRecovery = expectedRecoveryValue - recoveryCost;

  let decision: 'PROCEED' | 'STOP' = 'PROCEED';
  let stopReason: string | undefined;

  if (netExpectedRecovery < merchant.minimumRecoveryThreshold) {
    decision = 'STOP';
    stopReason = 'ECONOMICALLY_NOT_WORTHWHILE';
  } else if (merchant.maxRecoveryCost > 0 && recoveryCost > merchant.maxRecoveryCost) {
    decision = 'STOP';
    stopReason = 'RECOVERY_COST_TOO_HIGH';
  }

  return {
    revenueAtRisk,
    economicFactor,
    recoveryProbability,
    recoveryCost,
    expectedRecoveryValue,
    netExpectedRecovery,
    decision,
    stopReason
  };
}
