export type PriorityLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type InterventionType =
  | 'RETRY_PAYMENT'
  | 'SEND_PAYMENT_LINK'
  | 'CHANGE_PAYMENT_METHOD_PROMPT'
  | 'SEND_EMAIL'
  | 'SEND_SMS'
  | 'SEND_WHATSAPP'
  | 'HUMAN_REVIEW';

export type PaymentFailureCause =
  | 'INSUFFICIENT_FUNDS'
  | 'CREDIT_LIMIT_EXCEEDED'
  | 'MANUAL_3DS_OTP_ABANDONMENT'
  | '3DS_OTP_ABANDONMENT'
  | 'ACQUIRER_PAYMENT_GATEWAY_TIMEOUT'
  | 'GATEWAY_TIMEOUT'
  | 'ISSUING_BANK_OUTAGE'
  | 'ISSUER_TECHNICAL_FAILURE'
  | 'TECHNICAL_FAILURE'
  | 'MERCHANT_TECHNICAL_FAILURE'
  | 'PAYMENT_INSTRUMENT_EXPIRED_INVALID'
  | 'PAYMENT_INSTRUMENT_INVALID'
  | 'EXPIRED_CARD'
  | 'INVALID_CARD'
  | 'INVALID_CVV'
  | 'TRANSACTION_LIMIT_EXCEEDED';

export interface InterventionDefinition {
  type: InterventionType;
  name: string;
  description: string;
  supportedCauses: PaymentFailureCause[];
  priority: PriorityLevel;
  estimatedCost: number;
  expectedRecoveryProbability: number;
  maxAttempts: number;
  cooldownSeconds: number;
  requiredCustomerData: string[];
  requiredMerchantConfig: string[];
  supportedChannels: string[];
  requiresPaymentLink: boolean;
  requiresHumanApproval: boolean;
  requiresResolutionCheck: boolean;
  terminal: boolean;
  enabled: boolean;
  version: string;
}

export interface EligibilityContext {
  cause: string;
  customerData?: {
    email?: string;
    phone?: string;
    customerIdentity?: string;
    paymentAttemptId?: string;
    razorpayOrderId?: string;
  };
  merchantConfig?: {
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    whatsappEnabled?: boolean;
    humanReviewEnabled?: boolean;
    humanReviewContact?: string;
  };
  paymentState?: {
    isResolved?: boolean;
    isDefinitivelyFailed?: boolean;
  };
}
