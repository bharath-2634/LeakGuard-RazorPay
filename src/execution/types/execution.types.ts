import { z } from 'zod';

export type ExecutionStatus = 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'BLOCKED' | 'SKIPPED' | 'EXPIRED';
export type ExecutionPolicyDecision = 'ALLOWED' | 'APPROVAL_REQUIRED' | 'REJECTED' | 'UNKNOWN';
export type ActionType = 'WHATSAPP_MESSAGE' | 'SMS_MESSAGE' | 'EMAIL_MESSAGE' | 'PAYMENT_LINK' | 'PAYMENT_RETRY' | 'PAYMENT_METHOD_PROMPT' | 'HUMAN_REVIEW';

export interface ExecutionRequest {
  executionRequestVersion?: string;
  policyEvaluationId: string;
  validationResultId?: string;
  riskEventId?: string;
  paymentAttemptId: string;
  merchantId: string;
  intervention: { type: string; rank?: number; score?: number };
  policy: {
    decision: ExecutionPolicyDecision;
    policyVersion: string;
    maxAttempts: number;
    attemptsUsed: number;
    attemptsRemaining: number;
    coolOffSeconds: number;
    secondsSinceLastAttempt?: number;
    checks?: Record<string, string>;
  };
  recoveryContext: Record<string, unknown>;
  correlationId?: string;
}

export interface ExecutionContext {
  executionRequestId: string;
  riskEventId?: string;
  validationResultId?: string;
  merchant: {
    id: string;
    name: string;
    timezone: string;
    defaultCurrency: string;
    recoveryEnabled: boolean;
    recoveryConfig: {
      emailEnabled: boolean;
      smsEnabled: boolean;
      whatsappEnabled: boolean;
      humanReviewEnabled: boolean;
      humanReviewEmail?: string | null;
      humanReviewPhone?: string | null;
    };
  };
  customer: {
    id: string | null;
    externalCustomerId: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  payment: {
    paymentAttemptId: string;
    merchantOrderId: string;
    razorpayOrderId: string | null;
    amount: number;
    currency: string;
    providerState: string;
    businessState: string;
    revenueObligationStatus?: string;
  };
  intervention: { type: string; rank?: number; score?: number };
  policy: {
    evaluationId: string;
    decision: ExecutionPolicyDecision;
    policyVersion: string;
    maxAttempts: number;
    attemptsUsed: number;
    attemptsRemaining: number;
    coolOffSeconds: number;
    secondsSinceLastAttempt?: number;
    checks?: Record<string, string>;
  };
  diagnosis: { cause: string; confidence: number; actionabilityScore: number; priority: string };
  economics: Record<string, unknown>;
  evidence: Record<string, unknown>;
  correlationId: string;
}

export interface ExecutionAction {
  actionType: ActionType;
  interventionType: string;
  provider: string;
  recipient?: string;
  subject?: string;
  content?: string;
  amount?: number;
  currency?: string;
  merchantOrderId?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderExecutionResult {
  provider: string;
  success: boolean;
  status: string;
  providerExecutionId?: string;
  providerResourceId?: string;
  paymentLinkUrl?: string;
  response?: Record<string, unknown>;
  failureCode?: string;
  failureReason?: string;
}

export interface PaymentLinkResult {
  success: boolean;
  paymentLinkUrl?: string;
  providerResourceId?: string;
  failureCode?: string;
  failureReason?: string;
}

export interface SafetyCheckResult {
  safe: boolean;
  reason?: string;
  checks: {
    revenueUnresolved: boolean;
    recoveryEnabled: boolean;
    policyAllowed: boolean;
    attemptsAvailable: boolean;
    requiredDataAvailable: boolean;
    interventionEnabled: boolean;
    recoveryNotStopped?: boolean;
  };
}

export interface SafetyValidationResult {
  valid: boolean;
  violations: Array<{ code: string; message: string; severity: 'BLOCKING' | 'WARNING' }>;
}

export interface ExecutionResult {
  executionId: string;
  status: Exclude<ExecutionStatus, 'STARTED' | 'EXPIRED'>;
  interventionType: string;
  provider?: string;
  providerExecutionId?: string;
  executedAt?: string;
  failureCode?: string;
  failureReason?: string;
}

const executionRequestSchema = z.object({
  executionRequestVersion: z.string().default('v1'),
  policyEvaluationId: z.string().min(1),
  validationResultId: z.string().optional(),
  riskEventId: z.string().optional(),
  paymentAttemptId: z.string().min(1),
  merchantId: z.string().min(1),
  intervention: z.object({ type: z.string().min(1), rank: z.number().optional(), score: z.number().optional() }),
  policy: z.object({
    decision: z.enum(['ALLOWED', 'APPROVAL_REQUIRED', 'REJECTED', 'UNKNOWN']),
    policyVersion: z.string().min(1),
    maxAttempts: z.number().int().nonnegative(),
    attemptsUsed: z.number().int().nonnegative(),
    attemptsRemaining: z.number().int().nonnegative(),
    coolOffSeconds: z.number().int().nonnegative(),
    secondsSinceLastAttempt: z.number().int().nonnegative().optional(),
    checks: z.record(z.string()).optional(),
  }),
  recoveryContext: z.record(z.unknown()),
  correlationId: z.string().optional(),
});

export function parseExecutionRequest(value: unknown): ExecutionRequest {
  return executionRequestSchema.parse(value);
}
