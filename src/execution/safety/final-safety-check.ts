import { getIntervention } from '../../recovery/intervention/catalog/intervention-catalog.js';
import { ExecutionContext, SafetyCheckResult } from '../types/execution.types.js';
import { Pool } from 'pg';
import { config } from '../../config/env.js';

let pool: Pool | null = null;
function getDbPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || config.DATABASE_URL;
    pool = new Pool({
      connectionString,
      ssl: connectionString?.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export function runFinalSafetyCheck(context: ExecutionContext): SafetyCheckResult {
  const definition = getIntervention(context.intervention.type as any);
  const revenueUnresolved =
    context.payment.businessState !== 'RESOLVED' &&
    context.payment.providerState !== 'CAPTURED' &&
    context.payment.revenueObligationStatus !== 'RESOLVED';
  const recoveryEnabled = context.merchant.recoveryEnabled;
  const policyAllowed = context.policy.decision === 'ALLOWED';
  const attemptsAvailable = context.policy.attemptsUsed < context.policy.maxAttempts && context.policy.attemptsRemaining > 0;
  const requiredDataAvailable = (definition?.requiredCustomerData || []).every((field) => {
    if (field === 'paymentAttemptId') return Boolean(context.payment.paymentAttemptId);
    if (field === 'customerIdentity')
      return Boolean(context.customer.id || context.customer.externalCustomerId || context.customer.email || context.customer.phone);
    if (field === 'email') return Boolean(context.customer.email);
    if (field === 'phone') return Boolean(context.customer.phone);
    return true;
  });
  const interventionEnabled =
    definition?.enabled !== false &&
    (() => {
      const config = context.merchant.recoveryConfig;
      if (context.intervention.type === 'SEND_EMAIL') return config.emailEnabled;
      if (context.intervention.type === 'SEND_SMS') return config.smsEnabled;
      if (context.intervention.type === 'SEND_WHATSAPP') return config.whatsappEnabled;
      if (context.intervention.type === 'HUMAN_REVIEW') return config.humanReviewEnabled;
      return true;
    })();

  const checks = { revenueUnresolved, recoveryEnabled, policyAllowed, attemptsAvailable, requiredDataAvailable, interventionEnabled };
  const failed = Object.entries(checks).find(([, passed]) => !passed)?.[0];
  return { safe: !failed, reason: failed ? `Final safety check failed: ${failed}` : undefined, checks };
}

export async function runFinalSafetyCheckAsync(context: ExecutionContext): Promise<SafetyCheckResult & { failureCode?: string }> {
  // First run in-memory safety checks
  const baseResult = runFinalSafetyCheck(context);
  if (!baseResult.safe) {
    return baseResult;
  }

  // Next run live PostgreSQL check directly before external side effect
  try {
    const dbPool = getDbPool();

    // 1. Live Merchant/System Control Check
    if (context.riskEventId) {
      const controlRes = await dbPool.query(
        `SELECT "status", "stoppedBy", "stopReason" FROM "recovery_controls" WHERE "riskEventId" = $1 LIMIT 1`,
        [context.riskEventId]
      );
      if (controlRes.rows.length > 0 && controlRes.rows[0].status === 'STOPPED') {
        const row = controlRes.rows[0];
        return {
          safe: false,
          failureCode: 'MERCHANT_STOPPED_RECOVERY',
          reason: `Merchant or system manually stopped recovery: ${row.stopReason || 'STOPPED'}`,
          checks: { ...baseResult.checks, recoveryNotStopped: false },
        };
      }
    }

    // 2. Live Revenue Obligation Resolution Check
    if (context.merchant.id && context.payment.merchantOrderId) {
      const obligationRes = await dbPool.query(
        `SELECT "status" FROM "revenue_obligations" WHERE "merchantId" = $1 AND "merchantOrderId" = $2 LIMIT 1`,
        [context.merchant.id, context.payment.merchantOrderId]
      );
      if (obligationRes.rows.length > 0 && obligationRes.rows[0].status === 'RESOLVED') {
        return {
          safe: false,
          failureCode: 'CUSTOMER_ALREADY_RECOVERED',
          reason: 'Revenue obligation has already been resolved by customer payment',
          checks: { ...baseResult.checks, revenueUnresolved: false },
        };
      }
    }
  } catch (err) {
    console.warn('[SafetyCheck] Live DB safety check failed, proceeding with in-memory check:', (err as Error).message);
  }

  return baseResult;
}
