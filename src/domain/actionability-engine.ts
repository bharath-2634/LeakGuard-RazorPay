import { ActionabilityResult, DiagnosisResult, EventContext } from './interfaces.js';

export function classifyActionabilityStatus(score: number): 'HIGHLY_ACTIONABLE' | 'ACTIONABLE' | 'UNCERTAIN' | 'INSUFFICIENT' {
  if (score >= 90) return 'HIGHLY_ACTIONABLE';
  if (score >= 75) return 'ACTIONABLE';
  if (score >= 60) return 'UNCERTAIN';
  return 'INSUFFICIENT';
}

export function determineActionability(diagnosis: DiagnosisResult, event: EventContext): ActionabilityResult {
  // Score mapping: 0.35E + 0.25S + 0.20C + 0.20R
  
  // Evidence Quality (E)
  let evidenceQuality = 0;
  if (diagnosis.evidence.sources.includes('razorpay')) evidenceQuality = 100;
  else if (diagnosis.evidence.sources.includes('merchant')) evidenceQuality = 80;
  else if (diagnosis.evidence.sources.includes('sdk')) evidenceQuality = 70;
  else evidenceQuality = 30;

  // Specificity (S)
  let specificity = 0;
  if (diagnosis.diagnosedCause === 'INSUFFICIENT_FUNDS') specificity = 100;
  else if (diagnosis.diagnosedCause === '3DS_OTP_ABANDONMENT') specificity = 95;
  else if (diagnosis.diagnosedCause === 'CUSTOMER_ABANDONMENT') specificity = 80;
  else specificity = 50;

  // Consistency (C)
  let consistency = diagnosis.confidence * 100;

  // Recovery Mapping (R)
  let recoveryMapping = 0;
  if (['INSUFFICIENT_FUNDS', '3DS_OTP_ABANDONMENT', 'CUSTOMER_ABANDONMENT'].includes(diagnosis.diagnosedCause)) {
    recoveryMapping = 95;
  } else {
    recoveryMapping = 40;
  }

  const score = (0.35 * evidenceQuality) + (0.25 * specificity) + (0.20 * consistency) + (0.20 * recoveryMapping);

  const status = classifyActionabilityStatus(score);

  return {
    score,
    status
  };
}
