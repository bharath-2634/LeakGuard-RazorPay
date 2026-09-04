import { Pool, PoolClient } from 'pg';
import { ExecutionAction, ExecutionContext, ExecutionResult, ProviderExecutionResult, SafetyCheckResult, SafetyValidationResult } from '../types/execution.types.js';

const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : undefined }) : null;

export interface ExecutionRecordInput {
  context: ExecutionContext;
  status: string;
  attemptNumber: number;
  idempotencyKey: string;
  safetyCheck?: SafetyCheckResult;
  safetyValidation?: SafetyValidationResult;
  action?: ExecutionAction;
  providerResult?: ProviderExecutionResult;
  failureCode?: string;
  failureReason?: string;
}

export async function startOrGetExecution(input: ExecutionRecordInput): Promise<{ id: string; status: string; attemptNumber: number }> {
  if (!pool) return { id: `exec_local_${Date.now()}`, status: input.status, attemptNumber: input.attemptNumber };
  const client = await pool.connect();
  try {
    const existing = await client.query<{ id: string; status: string; attemptNumber: number }>(
      `SELECT "id", "status", "attemptNumber" FROM "recovery_executions" WHERE "idempotencyKey" = $1`,
      [input.idempotencyKey]
    );
    if (existing.rowCount) return existing.rows[0];
    const result = await client.query<{ id: string; status: string; attemptNumber: number }>(
      `INSERT INTO "recovery_executions"
        ("merchantId", "paymentAttemptId", "riskEventId", "validationResultId", "policyEvaluationId", "interventionType", "status", "attemptNumber", "idempotencyKey", "requestSnapshot", "safetyCheckSnapshot", "safetyValidation", "startedAt", "correlationId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14)
       RETURNING "id", "status", "attemptNumber"`,
      [
        input.context.merchant.id,
        input.context.payment.paymentAttemptId,
        input.context.riskEventId || null,
        input.context.validationResultId || null,
        input.context.policy.evaluationId,
        input.context.intervention.type,
        input.status,
        input.attemptNumber,
        input.idempotencyKey,
        JSON.stringify(snapshotRequest(input.context)),
        input.safetyCheck ? JSON.stringify(input.safetyCheck) : null,
        input.safetyValidation ? JSON.stringify(input.safetyValidation) : null,
        input.status === 'STARTED' ? new Date() : null,
        input.context.correlationId,
      ]
    );
    return result.rows[0];
  } finally { client.release(); }
}

export async function persistInvalidExecution(request: {
  policyEvaluationId?: string;
  validationResultId?: string;
  riskEventId?: string;
  paymentAttemptId?: string;
  merchantId?: string;
  interventionType?: string;
  policyVersion?: string;
  correlationId?: string;
  recoveryContext?: Record<string, unknown>;
}, failureCode: string, failureReason: string): Promise<string | undefined> {
  if (!pool || !request.policyEvaluationId || !request.paymentAttemptId || !request.merchantId || !request.interventionType) return undefined;
  const client = await pool.connect();
  const idempotencyKey = `${request.merchantId}:${request.paymentAttemptId}:${request.interventionType}:invalid`;
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: string }>(`SELECT "id" FROM "recovery_executions" WHERE "idempotencyKey" = $1`, [idempotencyKey]);
    if (existing.rowCount) { await client.query('COMMIT'); return existing.rows[0].id; }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO "recovery_executions"
        ("merchantId", "paymentAttemptId", "riskEventId", "validationResultId", "policyEvaluationId", "interventionType", "status", "attemptNumber", "idempotencyKey", "requestSnapshot", "failureCode", "failureReason", "completedAt", "correlationId")
       VALUES ($1, $2, $3, $4, $5, $6, 'BLOCKED', 0, $7, $8::jsonb, $9, $10, NOW(), $11) RETURNING "id"`,
      [request.merchantId, request.paymentAttemptId, request.riskEventId || null, request.validationResultId || null, request.policyEvaluationId, request.interventionType, idempotencyKey, JSON.stringify(sanitizeSnapshot(request.recoveryContext || {})), failureCode, failureReason, request.correlationId || request.policyEvaluationId]
    );
    const executionId = inserted.rows[0].id;
    await client.query(`INSERT INTO "outbox_events" ("event_type", "aggregate_id", "payload", "status") VALUES ('EXECUTION_BLOCKED', $1, $2::jsonb, 'PENDING')`, [executionId, JSON.stringify({ eventType: 'EXECUTION_BLOCKED', executionId, paymentAttemptId: request.paymentAttemptId, merchantId: request.merchantId, interventionType: request.interventionType, status: 'BLOCKED', failureCode, failureReason, correlationId: request.correlationId || request.policyEvaluationId })]);
    await client.query('COMMIT');
    return executionId;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function completeExecution(input: {
  executionId: string;
  context: ExecutionContext;
  result: ExecutionResult;
  action?: ExecutionAction;
  safetyCheck?: SafetyCheckResult;
  safetyValidation?: SafetyValidationResult;
  providerResult?: ProviderExecutionResult;
}): Promise<void> {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE "recovery_executions"
       SET "status" = $2, "provider" = $3, "providerExecutionId" = $4, "actionSnapshot" = $5::jsonb,
           "safetyCheckSnapshot" = $6::jsonb, "safetyValidation" = $7::jsonb, "providerResponse" = $8::jsonb,
           "failureCode" = $9, "failureReason" = $10, "completedAt" = $11
       WHERE "id" = $1`,
      [input.executionId, input.result.status, input.result.provider || null, input.result.providerExecutionId || null,
        input.action ? JSON.stringify(input.action) : null, input.safetyCheck ? JSON.stringify(input.safetyCheck) : null,
        input.safetyValidation ? JSON.stringify(input.safetyValidation) : null, input.providerResult ? JSON.stringify(input.providerResult) : null,
        input.result.failureCode || null, input.result.failureReason || null, new Date()]
    );
    const eventType = input.result.status === 'SUCCEEDED' ? 'EXECUTION_COMPLETED' : input.result.status === 'BLOCKED' ? 'EXECUTION_BLOCKED' : 'EXECUTION_FAILED';
    await client.query(
      `INSERT INTO "outbox_events" ("event_type", "aggregate_id", "payload", "status") VALUES ($1, $2, $3::jsonb, 'PENDING')`,
      [eventType, input.executionId, JSON.stringify({ eventType, executionId: input.executionId, paymentAttemptId: input.context.payment.paymentAttemptId, merchantId: input.context.merchant.id, interventionType: input.context.intervention.type, status: input.result.status, provider: input.result.provider, providerExecutionId: input.result.providerExecutionId, correlationId: input.context.correlationId })]
    );
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

function snapshotRequest(context: ExecutionContext): Record<string, unknown> {
  return { executionRequestId: context.executionRequestId, merchant: context.merchant, customer: context.customer, payment: context.payment, intervention: context.intervention, policy: context.policy, diagnosis: context.diagnosis, economics: context.economics, evidence: context.evidence, correlationId: context.correlationId };
}

function sanitizeSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSnapshot);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !/(secret|token|password|api.?key|credential)/i.test(key)).map(([key, child]) => [key, sanitizeSnapshot(child)]));
}

export async function closeExecutionRepository(): Promise<void> { await pool?.end(); }
