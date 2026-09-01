import { DiagnosisResult, PriorityResult } from './interfaces.js';

export function determinePriority(diagnosis: DiagnosisResult): PriorityResult {
  const cause = diagnosis.diagnosedCause;

  // Configuration-driven mapping
  const priorityMap: Record<string, PriorityResult> = {
    'ISSUER_OUTAGE': 'HIGH',
    'PAYMENT_GATEWAY_FAILURE': 'HIGH',
    'MERCHANT_TECHNICAL_FAILURE': 'HIGH',
    
    '3DS_OTP_ABANDONMENT': 'MEDIUM',
    'CUSTOMER_ABANDONMENT': 'LOW',
    
    'INSUFFICIENT_FUNDS': 'LOW',
    'UNKNOWN_PROVIDER_ERROR': 'LOW',
    'UNKNOWN': 'LOW',
  };

  return priorityMap[cause] || 'LOW';
}
