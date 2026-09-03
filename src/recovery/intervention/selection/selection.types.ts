import { InterventionDefinition } from '../catalog/intervention.types.js';
import { ComplianceStatus, MerchantPolicy, PolicyEvaluationResult, RecoveryAttemptRecord } from '../policy/policy.types.js';

export interface RecoveryContext {
  metadata?: {
    recoveryContextVersion?: string;
    validationResultId?: string;
    correlationId?: string;
    riskEventVersion?: number;
    validationRulesVersion?: string;
  };

  event?: {
    riskEventId?: string;
    paymentAttemptId?: string;
    merchantId?: string;
    merchantOrderId?: string;
    amount?: number;
    currency?: string;
  };

  diagnosis?: {
    cause?: string;
    diagnosedCause?: string;
    confidence?: number;
    actionabilityScore?: number;
    actionabilityStatus?: string;
    priority?: string;
  };

  economics?: {
    revenueAtRisk?: number;
    economicFactor?: number;
    recoveryProbability?: number;
    recoveryCost?: number;
    expectedRecoveryValue?: number;
    netExpectedRecovery?: number;
    minimumRecoveryThreshold?: number;
    maxRecoveryCost?: number;
  };

  customer?: {
    id?: string;
    externalCustomerId?: string;
    name?: string;
    email?: string;
    phone?: string;
    customerSegment?: string;
    customerValueSegment?: string;
  };

  merchant?: {
    id?: string;
    name?: string;
    timezone?: string;
    defaultCurrency?: string;
    recoveryConfig?: {
      emailEnabled?: boolean;
      smsEnabled?: boolean;
      whatsappEnabled?: boolean;
      inAppNotificationEnabled?: boolean;
      humanReviewEnabled?: boolean;
      humanReviewEmail?: string;
      version?: number;
    };
    recoveryPolicy?: MerchantPolicy;
  };

  payment?: {
    paymentAttemptId?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    providerState?: string;
    businessState?: string;
  };

  order?: {
    merchantOrderId?: string;
    amount?: number;
    currency?: string;
    category?: string;
  };

  evidence?: Record<string, unknown>;
  previousAttempts?: Array<Record<string, unknown>>;
  policyRejectionReasons?: string[];
  compliance?: Partial<Record<string, ComplianceStatus>>;
  complianceReasons?: Record<string, string>;
}

export interface RankedIntervention {
  interventionType: string;
  rank: number;
  score: number;
  rationale: string;
  expectedOutcome: string;
  risks: string[];
}

export interface InterventionSelectionResult {
  selector: string;
  selectorVersion: string;
  model?: string;
  rankedCandidates: RankedIntervention[];
  selectedCandidate?: RankedIntervention;
  reasoningSummary: string;
  fallbackUsed: boolean;
  correlationId: string;
  status?: 'COMPLETED' | 'STOPPED_ALREADY_RESOLVED' | 'NO_ELIGIBLE_INTERVENTIONS' | 'NO_POLICY_ALLOWED_INTERVENTION';
  policyEvaluations?: PolicyEvaluationResult[];
  policyRejectionReasons?: string[];
  actualAttempts?: RecoveryAttemptRecord[];
  replanUsed?: boolean;
  policyEvaluationIds?: string[];
  executionOutboxId?: string;
}

export interface InterventionSelector {
  select(
    context: RecoveryContext,
    candidates: InterventionDefinition[]
  ): Promise<InterventionSelectionResult>;
}
