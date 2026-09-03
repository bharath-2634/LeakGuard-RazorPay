import { InterventionType } from '../catalog/intervention.types.js';

export type ComplianceStatus = 'ALLOWED' | 'BLOCKED' | 'UNKNOWN';
export type PolicyDecision = 'ALLOWED' | 'REJECTED' | 'APPROVAL_REQUIRED';
export type PolicyCheckStatus = 'PASS' | 'FAIL';

export interface InterventionPolicy {
  allowed?: boolean;
  maxAttempts?: number;
  coolOffSeconds?: number;
}

export type MerchantPolicy = Partial<Record<InterventionType, InterventionPolicy>> & {
  recoveryEnabled: boolean;
  version: string;
};

export interface GlobalInterventionPolicy {
  maxAttempts: number;
  coolOffSeconds: number;
}

export type GlobalPolicy = Record<InterventionType, GlobalInterventionPolicy>;

export interface RecoveryAttemptRecord {
  interventionType: InterventionType;
  status: string;
  attemptedAt?: Date | string | null;
  completedAt?: Date | string | null;
}

export interface CustomerContext {
  customerId?: string;
  email?: string;
  phone?: string;
  previousFailedRecoveryAttempts?: number;
}

export interface EventContext {
  paymentAttemptId?: string;
  riskEventId?: string;
  providerState?: string;
  businessState?: string;
  revenueObligationStatus?: string;
  complianceStatus?: ComplianceStatus;
  complianceReason?: string;
}

export interface EffectiveBoundary {
  interventionType: InterventionType;
  allowed: boolean;
  maxAttempts: number;
  attemptsUsed: number;
  attemptsRemaining: number;
  coolOffSeconds: number;
  secondsSinceLastAttempt?: number;
  complianceRequired: boolean;
  requiresHumanApproval: boolean;
  reason?: string;
  policyVersion: string;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  interventionType: InterventionType;
  checks: {
    killSwitch: PolicyCheckStatus;
    compliance: PolicyCheckStatus;
    frequency: PolicyCheckStatus;
    coolOff: PolicyCheckStatus;
  };
  reasons: string[];
  effectiveBoundary: EffectiveBoundary;
  policyVersion: string;
}
