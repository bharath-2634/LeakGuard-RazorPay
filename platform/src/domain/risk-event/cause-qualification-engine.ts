import { Repository } from '../../infrastructure/db/repository.js';

export interface QualificationInput {
  paymentAttemptId: string;
  merchantId: string;
  merchantOrderId: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  customerId?: string;
  amount: number;
  currency: string;
  providerState: string;
  razorpayError?: {
    code?: string;
    description?: string;
    source?: string;
    step?: string;
    reason?: string;
  };
  merchantTelemetryErrors?: any[];
  sdkJourneyEvents?: string[];
  sources: string[];
}

export interface RiskEventPayload {
  event_type: 'PAYMENT_FAILURE_RISK';
  payment_attempt_id: string;
  merchant_id: string;
  customer_id: string | null;
  merchant_order_id: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  amount: number;
  currency: string;
  payment_status: string;
  revenue_obligation_resolved: false;
  cause_evidence: {
    candidate_causes: string[];
    supporting_evidence: string[];
    confidence: number;
  };
  audit: {
    source: string[];
    timestamp: string;
    correlation_id: string;
  };
}

export class CauseQualificationEngine {
  public static qualifyAndBuildRiskEvent(input: QualificationInput): RiskEventPayload | null {
    const candidateCauses: string[] = [];
    const supportingEvidence: string[] = [];
    let confidence = 0.5;

    if (input.razorpayError) {
      const { code, description, source, step, reason } = input.razorpayError;
      const combined = `${code || ''} ${description || ''} ${reason || ''}`.toLowerCase();

      if (reason === 'insufficient_funds' || combined.includes('insufficient')) {
        candidateCauses.push('INSUFFICIENT_FUNDS');
        supportingEvidence.push('razorpay:error_reason:insufficient_funds');
        confidence = 0.99;
      } else if (step === 'otp' || combined.includes('otp') || combined.includes('3ds')) {
        candidateCauses.push('3DS_OTP_ABANDONMENT');
        supportingEvidence.push('razorpay:step:otp');
        confidence = 0.95;
      } else if (reason === 'gateway_timeout' || combined.includes('timeout')) {
        candidateCauses.push('GATEWAY_TIMEOUT');
        supportingEvidence.push('razorpay:error_reason:gateway_timeout');
        confidence = 0.90;
      } else if (combined.includes('issuer') || combined.includes('down')) {
        candidateCauses.push('ISSUER_DOWNSTREAM_OUTAGE');
        supportingEvidence.push('razorpay:error_source:issuer');
        confidence = 0.90;
      } else if (combined.includes('expired')) {
        candidateCauses.push('CARD_EXPIRED');
        supportingEvidence.push('razorpay:reason:card_expired');
        confidence = 0.95;
      }
    }

    if (input.merchantTelemetryErrors && input.merchantTelemetryErrors.length > 0) {
      const merchantErr = input.merchantTelemetryErrors[0];
      if (merchantErr.eventType === 'payment_create_failed' || merchantErr.status >= 500) {
        candidateCauses.push('MERCHANT_TECHNICAL_FAILURE');
        supportingEvidence.push(`merchant:telemetry:${merchantErr.eventType}:${merchantErr.errorCode || merchantErr.status}`);
        confidence = Math.max(confidence, 0.90);
      }
    }

    if (input.sdkJourneyEvents && input.sdkJourneyEvents.length > 0) {
      if (input.sdkJourneyEvents.includes('checkout_closed') && candidateCauses.length === 0) {
        candidateCauses.push('3DS_OTP_ABANDONMENT');
        supportingEvidence.push('sdk:journey:checkout_closed');
        confidence = 0.70;
      }
    }

    if (candidateCauses.length === 0) {
      candidateCauses.push('UNKNOWN_UNRESOLVED');
      supportingEvidence.push('system:unresolved_payment_attempt');
      confidence = 0.50;
    }

    return {
      event_type: 'PAYMENT_FAILURE_RISK',
      payment_attempt_id: input.paymentAttemptId,
      merchant_id: input.merchantId,
      customer_id: input.customerId || null,
      merchant_order_id: input.merchantOrderId,
      razorpay_order_id: input.razorpayOrderId || null,
      razorpay_payment_id: input.razorpayPaymentId || null,
      amount: input.amount,
      currency: input.currency,
      payment_status: input.providerState,
      revenue_obligation_resolved: false,
      cause_evidence: {
        candidate_causes: candidateCauses,
        supporting_evidence: supportingEvidence,
        confidence,
      },
      audit: {
        source: Array.from(new Set(input.sources)),
        timestamp: new Date().toISOString(),
        correlation_id: `corr_${input.paymentAttemptId}`,
      },
    };
  }

  public static async emitRiskEvent(payload: RiskEventPayload): Promise<void> {
    await Repository.createRiskEvent({
      paymentAttemptId: payload.payment_attempt_id,
      merchantId: payload.merchant_id,
      eventType: payload.event_type,
      payload: payload as any,
      emittedAt: new Date(),
    });
  }
}
