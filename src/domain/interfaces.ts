// src/domain/interfaces.ts

export interface EventContext {
    riskEventId: string;
    paymentAttemptId: string;
    merchantOrderId: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    amount: number;
    currency: string;
    providerState: string;
    paymentMethod?: string;
    errorCode?: string;
    errorSource?: string;
    errorStep?: string;
    errorReason?: string;
    errorDescription?: string;
    causeEvidence?: any;
    journeyEvents: any[];
    timestamps: {
      startedAt: Date;
      emittedAt: Date;
    };
  }
  
  export interface UserContext {
    customerId?: string | null;
    customerRecord?: {
      id: string;
      externalCustomerId?: string | null;
      name?: string | null;
      email?: string | null;
      phone?: string | null;
    };
    customerSegment?: string | null;
    customerValueSegment?: string | null;
    historicalLtv?: number | null;
    previousAttemptCount: number;
  }
  
  export interface MerchantContext {
    merchantId: string;
    name?: string;
    currency: string;
    timezone: string;
    defaultMarginRate: number;
    categoryEconomics: any;
    baseRecoveryCost: number;
    minimumRecoveryThreshold: number;
    maxRecoveryCost: number;
    economicsVersion: number;
    orderCategory?: string | null;
    recoveryConfig?: {
      emailEnabled: boolean;
      smsEnabled: boolean;
      whatsappEnabled: boolean;
      inAppNotificationEnabled: boolean;
      humanReviewEnabled: boolean;
      humanReviewEmail?: string | null;
      version: number;
    };
    recoveryPolicy?: {
      recoveryEnabled: boolean;
      version: number;
      [key: string]: boolean | number | undefined;
    };
  }
  
  export interface ValidationContext {
    event: EventContext;
    user: UserContext;
    merchant: MerchantContext;
    previousRecoveryAttempts: Array<{
      interventionType: string;
      status: string;
      attemptedAt?: Date | null;
      completedAt?: Date | null;
    }>;
  }
  
  export interface DiagnosisResult {
    diagnosedCause: string;
    confidence: number;
    evidence: {
      sources: string[];
      items: any[];
    };
  }
  
  export interface ActionabilityResult {
    score: number;
    status: 'HIGHLY_ACTIONABLE' | 'ACTIONABLE' | 'UNCERTAIN' | 'INSUFFICIENT';
  }
  
  export type PriorityResult = 'LOW' | 'MEDIUM' | 'HIGH';
  
  export interface EconomicResult {
    revenueAtRisk: number;
    economicFactor: number;
    recoveryProbability: number;
    recoveryCost: number;
    expectedRecoveryValue: number;
    netExpectedRecovery: number;
    decision: 'PROCEED' | 'STOP';
    stopReason?: string;
  }
