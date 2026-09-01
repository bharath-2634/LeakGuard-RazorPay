// src/domain/interfaces.ts

export interface EventContext {
    riskEventId: string;
    paymentAttemptId: string;
    merchantOrderId: string;
    amount: number;
    currency: string;
    providerState: string;
    paymentMethod?: string;
    errorCode?: string;
    errorSource?: string;
    errorStep?: string;
    errorReason?: string;
    errorDescription?: string;
    journeyEvents: any[];
    timestamps: {
      startedAt: Date;
      emittedAt: Date;
    };
  }
  
  export interface UserContext {
    customerId?: string | null;
    customerSegment?: string | null;
    customerValueSegment?: string | null;
    historicalLtv?: number | null;
    previousAttemptCount: number;
  }
  
  export interface MerchantContext {
    merchantId: string;
    currency: string;
    timezone: string;
    defaultMarginRate: number;
    categoryEconomics: Record<string, any>;
    baseRecoveryCost: number;
    minimumRecoveryThreshold: number;
    maxRecoveryCost: number;
    economicsVersion: number;
    orderCategory?: string | null;
  }
  
  export interface ValidationContext {
    event: EventContext;
    user: UserContext;
    merchant: MerchantContext;
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
