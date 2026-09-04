export type ExecutionStatus = 'SUCCEEDED' | 'FAILED' | 'BLOCKED' | 'SKIPPED';
export type OutcomeStatus = 'RECOVERED' | 'NOT_RECOVERED' | 'PENDING';
export type ResolutionStatus = 'RESOLVED' | 'UNRESOLVED';
export type RecoveryControlStatus = 'ACTIVE' | 'STOPPED';
export type StoppedByActor = 'MERCHANT' | 'SYSTEM';

export type AuditActor = 'SYSTEM' | 'GEMINI' | 'MERCHANT' | 'PROVIDER' | 'CUSTOMER';
export type AuditComponent =
  | 'DETECTION'
  | 'VALIDATION'
  | 'DIAGNOSIS'
  | 'SELECTION'
  | 'POLICY'
  | 'EXECUTION'
  | 'OUTCOME'
  | 'REASSESSMENT'
  | 'CONTROL';

export interface ExecutionEventPayload {
  eventType: 'EXECUTION_COMPLETED' | 'EXECUTION_FAILED' | 'EXECUTION_BLOCKED';
  executionId: string;
  merchantId: string;
  paymentAttemptId: string;
  riskEventId?: string;
  interventionType: string;
  status: ExecutionStatus;
  provider?: string;
  providerExecutionId?: string;
  failureCode?: string;
  failureReason?: string;
  correlationId: string;
}

export interface ContinuationContext {
  riskEventId?: string;
  merchantId: string;
  paymentAttemptId: string;
  merchantOrderId: string;
  amount: number;
  currency: string;
  diagnosedCause: string;
  confidence: number;
  priority: string;
  customerSegment?: string;
  historicalLtv?: number;
  attemptsUsed: number;
  maxAttempts: number;
  previousAttempts: Array<{
    intervention: string;
    status: string;
    attemptedAt?: Date | string;
  }>;
  previousOutcomes: Array<{
    interventionType: string;
    outcomeStatus: string;
    measuredAt?: Date | string;
  }>;
  remainingEligibleInterventions: string[];
}

export interface ContinuationDecisionResult {
  continue: boolean;
  reason: string;
  preferredNextIntervention?: string;
  confidence?: number;
  evaluator: 'DETERMINISTIC_STOP' | 'GEMINI_REASONING' | 'DETERMINISTIC_GUARDRAIL';
}

export interface ReassessmentContext {
  riskEventId: string;
  merchantId: string;
  paymentAttemptId: string;
  merchantOrderId: string;
  amount: number;
  currency: string;
  originalDiagnosis: string;
  previousDiagnosis?: string;
  attemptsCount: number;
  previousAttempts: Array<{
    intervention: string;
    status: string;
  }>;
  previousOutcomes: Array<{
    interventionType: string;
    outcomeStatus: string;
  }>;
  continuationReason: string;
  preferredNextIntervention?: string;
  correlationId: string;
  reassessedAt: string;
}

export interface AuditRecordInput {
  merchantId: string;
  paymentAttemptId: string;
  riskEventId?: string;
  eventType: string;
  actor: AuditActor;
  component: AuditComponent;
  action: string;
  status: string;
  reason?: string;
  inputSnapshot?: Record<string, any>;
  outputSnapshot?: Record<string, any>;
  correlationId: string;
}

export interface RecoveryMetricsByCurrency {
  currency: string;
  totalRevenueAtRisk: number;
  totalRecoveredRevenue: number;
  unrecoveredRevenue: number;
  recoveryRate: number;
  riskEventsDetected: number;
  recoveredEvents: number;
  unrecoveredEvents: number;
  activeRecoveries: number;
  stoppedRecoveries: number;
  totalInterventionAttempts: number;
  byIntervention: Array<{
    interventionType: string;
    attempts: number;
    recoveredEvents: number;
    recoveredRevenue: number;
  }>;
  byCause: Array<{
    cause: string;
    events: number;
    recoveredEvents: number;
    recoveredRevenue: number;
  }>;
}
