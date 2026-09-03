export type PriorityLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type ExpectedRecoveryLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type InterventionType =
  | 'SEND_PAYMENT_LINK'
  | 'CHANGE_PAYMENT_METHOD_PROMPT'
  | 'SEND_WHATSAPP'
  | 'SEND_SMS'
  | 'SEND_EMAIL'
  | 'RETRY_PAYMENT'
  | 'HUMAN_REVIEW';

export interface InterventionCandidate {
  type: InterventionType;
  priority: PriorityLevel;
  expectedRecovery?: ExpectedRecoveryLevel;
  message?: string;
  requirements?: string[];
  bestWhen?: string;
  notes?: string;
  cooldownMs?: number;
  maxAttempts?: number;
}

export interface CatalogEvaluationInput {
  diagnosedCause: string;
  currentState?: 'RESOLVED' | 'STILL_FAILED' | 'UNKNOWN';
  errorDetails?: any;
  hasPersistentFailure?: boolean;
  transientIssue?: boolean;
}

export interface CatalogEvaluationResult {
  diagnosedCause: string;
  normalizedCause: string;
  candidates: InterventionCandidate[];
  rejectedInterventions: {
    type: InterventionType;
    reason: string;
  }[];
}
