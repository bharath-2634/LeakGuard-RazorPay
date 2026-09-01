import { DiagnosisResult, EventContext } from './interfaces.js';

export function runDiagnosis(event: EventContext): DiagnosisResult {
  // 1. Provider Evidence (Razorpay) has highest precedence
  if (event.errorReason) {
    let cause = 'UNKNOWN_PROVIDER_ERROR';
    if (event.errorReason === 'insufficient_funds') cause = 'INSUFFICIENT_FUNDS';
    else if (event.errorReason === 'payment_failed') cause = 'PAYMENT_FAILED';
    // Add other deterministic mappings...
    
    return {
      diagnosedCause: cause,
      confidence: 0.99, // High confidence for explicit provider reasons
      evidence: {
        sources: ['razorpay'],
        items: [{ field: 'error_reason', value: event.errorReason }]
      }
    };
  }

  if (event.errorStep === 'otp') {
    return {
      diagnosedCause: '3DS_OTP_ABANDONMENT',
      confidence: 0.95,
      evidence: {
        sources: ['razorpay'],
        items: [{ field: 'error_step', value: 'otp' }]
      }
    };
  }

  // 2. SDK Behavioral Evidence
  // E.g., customer exits checkout
  const sdkEvents = event.journeyEvents || [];
  const checkoutClosed = sdkEvents.find((e: any) => e.event === 'checkout_closed' && e.metadata?.reason === 'user_dismissed');
  
  if (checkoutClosed) {
    return {
      diagnosedCause: 'CUSTOMER_ABANDONMENT',
      confidence: 0.85,
      evidence: {
        sources: ['sdk'],
        items: [{ event: 'checkout_closed', reason: 'user_dismissed' }]
      }
    };
  }

  // 3. Inference / Unknown
  return {
    diagnosedCause: 'UNKNOWN',
    confidence: 0.40,
    evidence: {
      sources: [],
      items: []
    }
  };
}
