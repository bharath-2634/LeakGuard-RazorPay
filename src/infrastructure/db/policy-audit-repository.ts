import { Pool, PoolClient } from 'pg';
import { GLOBAL_SAFE_DEFAULTS } from '../../recovery/intervention/policy/global-policy.js';
import { PolicyEvaluationResult } from '../../recovery/intervention/policy/policy.types.js';
import { RecoveryContext, RankedIntervention } from '../../recovery/intervention/selection/selection.types.js';

const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
    })
  : null;

export interface PolicyPersistenceResult {
  policyEvaluationIds: string[];
  executionOutboxId?: string;
}

export async function persistPolicyDecision(
  context: RecoveryContext,
  evaluations: PolicyEvaluationResult[],
  selectedCandidate?: RankedIntervention
): Promise<PolicyPersistenceResult> {
  if (!pool) return { policyEvaluationIds: [] };

  const merchantId = context.event?.merchantId || context.merchant?.id;
  const paymentAttemptId = context.event?.paymentAttemptId || context.payment?.paymentAttemptId;
  if (!merchantId || !paymentAttemptId) {
    throw new Error('Cannot persist policy evaluation without merchantId and paymentAttemptId');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const evaluationIds: string[] = [];
    let selectedEvaluationId: string | undefined;

    for (const evaluation of evaluations) {
      const result = await insertEvaluation(client, context, evaluation, merchantId, paymentAttemptId);
      evaluationIds.push(result.id);
      if (selectedCandidate?.interventionType === evaluation.interventionType && !selectedEvaluationId) {
        selectedEvaluationId = result.id;
      }
    }

    let executionOutboxId: string | undefined;
    if (selectedCandidate && selectedEvaluationId) {
      const selectedEvaluation = evaluations.find(
        (evaluation) => evaluation.interventionType === selectedCandidate.interventionType &&
          (evaluation.decision === 'ALLOWED' || evaluation.decision === 'APPROVAL_REQUIRED')
      );
      if (selectedEvaluation) {
        const executionPayload = {
          type: 'RECOVERY_EXECUTION_REQUEST',
          executionRequestVersion: 'v1',
          policyEvaluationId: selectedEvaluationId,
          validationResultId: context.metadata?.validationResultId,
          riskEventId: context.event?.riskEventId,
          paymentAttemptId,
          merchantId,
          correlationId: context.metadata?.correlationId || context.event?.riskEventId,
          intervention: selectedCandidate,
          recoveryContext: context,
          merchant: { recoveryEnabled: context.merchant?.recoveryPolicy?.recoveryEnabled !== false },
          policy: {
            decision: selectedEvaluation.decision,
            policyVersion: selectedEvaluation.policyVersion,
            maxAttempts: selectedEvaluation.effectiveBoundary.maxAttempts,
            attemptsUsed: selectedEvaluation.effectiveBoundary.attemptsUsed,
            attemptsRemaining: selectedEvaluation.effectiveBoundary.attemptsRemaining,
            coolOffSeconds: selectedEvaluation.effectiveBoundary.coolOffSeconds,
            secondsSinceLastAttempt: selectedEvaluation.effectiveBoundary.secondsSinceLastAttempt,
            checks: selectedEvaluation.checks,
          },
        };
        const outbox = await client.query<{ id: string }>(
          `INSERT INTO "outbox_events" ("event_type", "aggregate_id", "payload", "status")
           VALUES ($1, $2, $3::jsonb, 'PENDING') RETURNING "id"`,
          ['RECOVERY_EXECUTION_REQUEST', selectedEvaluationId, JSON.stringify(executionPayload)]
        );
        executionOutboxId = outbox.rows[0].id;
      }
    }

    await client.query('COMMIT');
    return { policyEvaluationIds: evaluationIds, executionOutboxId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function insertEvaluation(
  client: PoolClient,
  context: RecoveryContext,
  evaluation: PolicyEvaluationResult,
  merchantId: string,
  paymentAttemptId: string
): Promise<{ id: string }> {
  const merchantPolicy = context.merchant?.recoveryPolicy;
  const merchantInterventionPolicy = merchantPolicy?.[evaluation.interventionType];
  const contextualMaxAttempts = evaluation.effectiveBoundary.maxAttempts;
  const policySnapshot = {
    global: GLOBAL_SAFE_DEFAULTS[evaluation.interventionType],
    merchant: merchantInterventionPolicy,
    context: {
      contextualMaxAttempts,
      contextualCoolOffSeconds: 0,
      customerId: context.customer?.id,
      providerState: context.payment?.providerState,
      businessState: context.payment?.businessState,
    },
  };

  const result = await client.query<{ id: string }>(
    `INSERT INTO "recovery_policy_evaluations"
      ("merchantId", "paymentAttemptId", "riskEventId", "validationResultId", "interventionType", "decision", "policyVersion",
       "maxAttempts", "attemptsUsed", "attemptsRemaining", "coolOffSeconds", "secondsSinceLastAttempt",
       "killSwitchStatus", "complianceStatus", "frequencyStatus", "coolOffStatus", "rejectionReasons", "policySnapshot")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb)
     RETURNING "id"`,
    [
      merchantId,
      paymentAttemptId,
      context.event?.riskEventId || null,
      context.metadata?.validationResultId || null,
      evaluation.interventionType,
      evaluation.decision,
      evaluation.policyVersion,
      evaluation.effectiveBoundary.maxAttempts,
      evaluation.effectiveBoundary.attemptsUsed,
      evaluation.effectiveBoundary.attemptsRemaining,
      evaluation.effectiveBoundary.coolOffSeconds,
      evaluation.effectiveBoundary.secondsSinceLastAttempt ?? null,
      evaluation.checks.killSwitch,
      evaluation.checks.compliance,
      evaluation.checks.frequency,
      evaluation.checks.coolOff,
      JSON.stringify(evaluation.reasons),
      JSON.stringify(policySnapshot),
    ]
  );
  return result.rows[0];
}

export async function closePolicyAuditRepository(): Promise<void> {
  await pool?.end();
}
