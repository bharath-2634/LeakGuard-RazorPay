import {
  CatalogEvaluationInput,
  CatalogEvaluationResult,
  InterventionCandidate,
  InterventionType
} from './interfaces.js';

export function getInterventionCandidates(input: CatalogEvaluationInput): CatalogEvaluationResult {
  const cause = (input.diagnosedCause || '').toUpperCase().trim();
  const candidates: InterventionCandidate[] = [];
  const rejectedInterventions: { type: InterventionType; reason: string }[] = [];

  let normalizedCause = cause;

  switch (cause) {
    case 'INSUFFICIENT_FUNDS':
    case 'CREDIT_LIMIT_EXCEEDED': {
      normalizedCause = 'INSUFFICIENT_FUNDS';

      // 1. SEND_PAYMENT_LINK
      candidates.push({
        type: 'SEND_PAYMENT_LINK',
        priority: 'HIGH',
        expectedRecovery: 'HIGH',
        requirements: ['valid payment/recovery link', 'unresolved RevenueObligation'],
        bestWhen: 'customer can complete payment later'
      });

      // 2. CHANGE_PAYMENT_METHOD_PROMPT
      candidates.push({
        type: 'CHANGE_PAYMENT_METHOD_PROMPT',
        priority: 'HIGH',
        expectedRecovery: 'HIGH',
        message: "Your payment couldn't be completed. Please try another payment method.",
        bestWhen: 'another payment instrument is likely available'
      });

      // 3. SEND_WHATSAPP
      candidates.push({
        type: 'SEND_WHATSAPP',
        priority: 'MEDIUM',
        expectedRecovery: 'HIGH', // MEDIUM/HIGH
        requirements: ['customer phone', 'WhatsApp enabled by merchant', 'payment/recovery link']
      });

      // 4. SEND_SMS
      candidates.push({
        type: 'SEND_SMS',
        priority: 'MEDIUM',
        requirements: ['customer phone', 'SMS enabled', 'payment/recovery link']
      });

      // 5. SEND_EMAIL
      candidates.push({
        type: 'SEND_EMAIL',
        priority: 'MEDIUM',
        requirements: ['customer email', 'email enabled']
      });

      // Explicitly reject RETRY_PAYMENT
      rejectedInterventions.push({
        type: 'RETRY_PAYMENT',
        reason: 'Direct retry generally NOT preferred for insufficient funds as repeatedly attempting does not create funds.'
      });
      break;
    }

    case 'MANUAL_3DS_OTP_ABANDONMENT':
    case '3DS_OTP_ABANDONMENT':
    case 'CUSTOMER_ABANDONMENT': {
      normalizedCause = 'MANUAL_3DS_OTP_ABANDONMENT';

      candidates.push({
        type: 'RETRY_PAYMENT',
        priority: 'HIGH',
        notes: 'Customer may have merely abandoned authentication flow'
      });

      candidates.push({
        type: 'SEND_PAYMENT_LINK',
        priority: 'HIGH'
      });

      candidates.push({
        type: 'CHANGE_PAYMENT_METHOD_PROMPT',
        priority: 'HIGH'
      });

      candidates.push({
        type: 'SEND_WHATSAPP',
        priority: 'MEDIUM'
      });

      candidates.push({
        type: 'SEND_SMS',
        priority: 'MEDIUM'
      });

      candidates.push({
        type: 'SEND_EMAIL',
        priority: 'LOW'
      });
      break;
    }

    case 'ACQUIRER_PAYMENT_GATEWAY_TIMEOUT':
    case 'ACQUIRER_GATEWAY_TIMEOUT':
    case 'GATEWAY_TIMEOUT': {
      normalizedCause = 'ACQUIRER_PAYMENT_GATEWAY_TIMEOUT';

      // Safety Rule: RETRY_PAYMENT only eligible if current state is STILL_FAILED
      if (input.currentState === 'STILL_FAILED') {
        candidates.push({
          type: 'RETRY_PAYMENT',
          priority: 'HIGH',
          notes: 'Confirmed previous transaction is definitively unresolved/failed'
        });
      } else {
        rejectedInterventions.push({
          type: 'RETRY_PAYMENT',
          reason: input.currentState === 'RESOLVED'
            ? 'Transaction resolved, state guard stopped intervention'
            : 'Safety Rule: RETRY_PAYMENT pending resolution/state guard confirmation'
        });
      }

      candidates.push({
        type: 'SEND_PAYMENT_LINK',
        priority: 'HIGH'
      });

      candidates.push({
        type: 'CHANGE_PAYMENT_METHOD_PROMPT',
        priority: 'HIGH'
      });

      candidates.push({
        type: 'SEND_WHATSAPP',
        priority: 'MEDIUM'
      });

      candidates.push({
        type: 'SEND_SMS',
        priority: 'MEDIUM'
      });

      candidates.push({
        type: 'SEND_EMAIL',
        priority: 'MEDIUM'
      });
      break;
    }

    case 'ISSUING_BANK_OUTAGE':
    case 'ISSUER_TECHNICAL_FAILURE':
    case 'ISSUER_DOWNSTREAM_OUTAGE': {
      normalizedCause = 'ISSUING_BANK_OUTAGE';

      candidates.push({
        type: 'SEND_PAYMENT_LINK',
        priority: 'HIGH'
      });

      candidates.push({
        type: 'CHANGE_PAYMENT_METHOD_PROMPT',
        priority: 'HIGH'
      });

      candidates.push({
        type: 'SEND_WHATSAPP',
        priority: 'MEDIUM'
      });

      candidates.push({
        type: 'SEND_SMS',
        priority: 'MEDIUM'
      });

      candidates.push({
        type: 'SEND_EMAIL',
        priority: 'MEDIUM'
      });

      // Conditional RETRY_PAYMENT with Low Priority, Cooldown, and Max Attempts
      candidates.push({
        type: 'RETRY_PAYMENT',
        priority: 'LOW',
        cooldownMs: 300000, // 5 minutes cooldown
        maxAttempts: 2,
        notes: 'Immediate retry discouraged during issuer outage. Rate-limited cooldown applied.'
      });
      break;
    }

    case 'TECHNICAL_FAILURE':
    case 'MERCHANT_TECHNICAL_FAILURE':
    case 'UNKNOWN_PROVIDER_ERROR': {
      normalizedCause = 'TECHNICAL_FAILURE';

      if (input.hasPersistentFailure) {
        candidates.push({
          type: 'HUMAN_REVIEW',
          priority: 'HIGH',
          notes: '500 errors / stack traces / persistent failure detected with no safe automated recovery.'
        });
      }

      candidates.push({
        type: 'RETRY_PAYMENT',
        priority: 'MEDIUM'
      });

      candidates.push({
        type: 'SEND_PAYMENT_LINK',
        priority: 'HIGH'
      });

      candidates.push({
        type: 'CHANGE_PAYMENT_METHOD_PROMPT',
        priority: 'HIGH'
      });

      candidates.push({
        type: 'SEND_WHATSAPP',
        priority: 'MEDIUM'
      });

      candidates.push({
        type: 'SEND_SMS',
        priority: 'MEDIUM'
      });

      candidates.push({
        type: 'SEND_EMAIL',
        priority: 'MEDIUM'
      });
      break;
    }

    case 'PAYMENT_INSTRUMENT_EXPIRED_INVALID':
    case 'PAYMENT_INSTRUMENT_INVALID':
    case 'EXPIRED_CARD':
    case 'INVALID_CARD':
    case 'INVALID_CVV':
    case 'EXPIRED_EXPIRY': {
      normalizedCause = 'PAYMENT_INSTRUMENT_EXPIRED_INVALID';

      candidates.push({
        type: 'CHANGE_PAYMENT_METHOD_PROMPT',
        priority: 'HIGH'
      });

      candidates.push({
        type: 'SEND_PAYMENT_LINK',
        priority: 'HIGH'
      });

      candidates.push({
        type: 'SEND_WHATSAPP',
        priority: 'MEDIUM'
      });

      candidates.push({
        type: 'SEND_SMS',
        priority: 'MEDIUM'
      });

      candidates.push({
        type: 'SEND_EMAIL',
        priority: 'MEDIUM'
      });

      rejectedInterventions.push({
        type: 'RETRY_PAYMENT',
        reason: 'The underlying payment instrument itself is invalid or expired. Blind retries are rejected.'
      });
      break;
    }

    case 'TRANSACTION_LIMIT_EXCEEDED': {
      normalizedCause = 'TRANSACTION_LIMIT_EXCEEDED';

      candidates.push({
        type: 'CHANGE_PAYMENT_METHOD_PROMPT',
        priority: 'HIGH'
      });

      candidates.push({
        type: 'SEND_PAYMENT_LINK',
        priority: 'HIGH'
      });

      candidates.push({
        type: 'SEND_WHATSAPP',
        priority: 'MEDIUM'
      });

      candidates.push({
        type: 'SEND_SMS',
        priority: 'MEDIUM'
      });

      candidates.push({
        type: 'SEND_EMAIL',
        priority: 'MEDIUM'
      });

      candidates.push({
        type: 'HUMAN_REVIEW',
        priority: 'MEDIUM',
        notes: 'For high-value transactions where merchant intervention is economically justified.'
      });

      rejectedInterventions.push({
        type: 'RETRY_PAYMENT',
        reason: 'Transaction limit will reject retries on the same instrument unless instrument or limit changes.'
      });
      break;
    }

    default: {
      normalizedCause = `GENERIC_UNKNOWN (${cause})`;

      candidates.push({
        type: 'SEND_PAYMENT_LINK',
        priority: 'HIGH'
      });

      candidates.push({
        type: 'CHANGE_PAYMENT_METHOD_PROMPT',
        priority: 'HIGH'
      });

      candidates.push({
        type: 'SEND_EMAIL',
        priority: 'MEDIUM'
      });
      break;
    }
  }

  return {
    diagnosedCause: input.diagnosedCause,
    normalizedCause,
    candidates,
    rejectedInterventions
  };
}
