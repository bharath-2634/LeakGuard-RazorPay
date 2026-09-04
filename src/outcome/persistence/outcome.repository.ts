import { Pool } from 'pg';
import { config } from '../../config/env.js';
import { AuditRecordInput, RecoveryMetricsByCurrency } from '../types/outcome.types.js';

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || config.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set for OutcomeRepository');
    }
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

export class OutcomeRepository {
  private pool = getDbPool();

  async getRevenueObligation(merchantId: string, merchantOrderId: string) {
    const result = await this.pool.query(
      `SELECT "id", "merchantId", "merchantOrderId", "amount", "currency", "status", "resolvedAt"
       FROM "revenue_obligations"
       WHERE "merchantId" = $1 AND "merchantOrderId" = $2 LIMIT 1`,
      [merchantId, merchantOrderId]
    );
    return result.rows[0] || null;
  }

  async getRevenueObligationByAttempt(paymentAttemptId: string) {
    const pa = await this.pool.query(
      `SELECT "merchantId", "merchantOrderId" FROM "payment_attempts" WHERE "id" = $1 LIMIT 1`,
      [paymentAttemptId]
    );
    if (!pa.rows.length) return null;
    return this.getRevenueObligation(pa.rows[0].merchantId, pa.rows[0].merchantOrderId);
  }

  async getRecoveryControl(riskEventId: string) {
    const result = await this.pool.query(
      `SELECT "id", "merchantId", "paymentAttemptId", "riskEventId", "status", "stoppedBy", "stopReason", "stoppedAt"
       FROM "recovery_controls"
       WHERE "riskEventId" = $1 LIMIT 1`,
      [riskEventId]
    );
    return result.rows[0] || null;
  }

  async upsertRecoveryControl(
    riskEventId: string,
    merchantId: string,
    paymentAttemptId: string,
    status: 'ACTIVE' | 'STOPPED',
    stoppedBy?: 'MERCHANT' | 'SYSTEM' | null,
    stopReason?: string | null
  ) {
    const now = new Date();
    const stoppedAtValue = status === 'STOPPED' ? now : null;
    const result = await this.pool.query(
      `INSERT INTO "recovery_controls" (
        "id", "merchantId", "paymentAttemptId", "riskEventId", "status", "stoppedBy", "stopReason", "stoppedAt", "version", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 1, NOW(), NOW()
      )
      ON CONFLICT ("riskEventId") DO UPDATE SET
        "status" = EXCLUDED."status",
        "stoppedBy" = EXCLUDED."stoppedBy",
        "stopReason" = EXCLUDED."stopReason",
        "stoppedAt" = EXCLUDED."stoppedAt",
        "updatedAt" = NOW()
      RETURNING *`,
      [`rc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, merchantId, paymentAttemptId, riskEventId, status, stoppedBy || null, stopReason || null, stoppedAtValue]
    );
    return result.rows[0];
  }

  async upsertRecoveryOutcome(data: {
    merchantId: string;
    paymentAttemptId: string;
    riskEventId?: string;
    executionId: string;
    interventionType: string;
    executionStatus: string;
    outcomeStatus: string;
    resolutionStatus: string;
    recoveryAmount?: number;
    recoveryCurrency?: string;
    resolutionSource?: string;
    evidence?: any;
    metadata?: any;
  }) {
    const existing = await this.pool.query(
      `SELECT "id", "outcomeStatus" FROM "recovery_outcomes" WHERE "executionId" = $1 LIMIT 1`,
      [data.executionId]
    );

    if (existing.rows.length > 0) {
      // If already terminal (RECOVERED), do not overwrite terminal state with NOT_RECOVERED
      if (existing.rows[0].outcomeStatus === 'RECOVERED' && data.outcomeStatus !== 'RECOVERED') {
        return existing.rows[0];
      }
      const updated = await this.pool.query(
        `UPDATE "recovery_outcomes" SET
          "outcomeStatus" = $1,
          "resolutionStatus" = $2,
          "recoveryAmount" = COALESCE($3, "recoveryAmount"),
          "recoveryCurrency" = COALESCE($4, "recoveryCurrency"),
          "resolutionSource" = COALESCE($5, "resolutionSource"),
          "evidence" = COALESCE($6, "evidence"),
          "metadata" = COALESCE($7, "metadata"),
          "updatedAt" = NOW()
         WHERE "executionId" = $8
         RETURNING *`,
        [
          data.outcomeStatus,
          data.resolutionStatus,
          data.recoveryAmount || null,
          data.recoveryCurrency || null,
          data.resolutionSource || null,
          data.evidence ? JSON.stringify(data.evidence) : null,
          data.metadata ? JSON.stringify(data.metadata) : null,
          data.executionId,
        ]
      );
      return updated.rows[0];
    }

    const inserted = await this.pool.query(
      `INSERT INTO "recovery_outcomes" (
        "id", "merchantId", "paymentAttemptId", "riskEventId", "executionId", "interventionType",
        "executionStatus", "outcomeStatus", "resolutionStatus", "recoveryAmount", "recoveryCurrency",
        "resolutionSource", "measuredAt", "evidence", "metadata", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, $14, NOW(), NOW()
      ) RETURNING *`,
      [
        `ro_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        data.merchantId,
        data.paymentAttemptId,
        data.riskEventId || null,
        data.executionId,
        data.interventionType,
        data.executionStatus,
        data.outcomeStatus,
        data.resolutionStatus,
        data.recoveryAmount || null,
        data.recoveryCurrency || null,
        data.resolutionSource || null,
        data.evidence ? JSON.stringify(data.evidence) : null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );
    return inserted.rows[0];
  }

  async appendAuditRecord(input: AuditRecordInput) {
    const result = await this.pool.query(
      `INSERT INTO "recovery_audits" (
        "id", "merchantId", "paymentAttemptId", "riskEventId", "eventType", "actor", "component",
        "action", "status", "reason", "inputSnapshot", "outputSnapshot", "correlationId", "createdAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()
      ) RETURNING *`,
      [
        `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        input.merchantId,
        input.paymentAttemptId,
        input.riskEventId || null,
        input.eventType,
        input.actor,
        input.component,
        input.action,
        input.status,
        input.reason || null,
        input.inputSnapshot ? JSON.stringify(input.inputSnapshot) : null,
        input.outputSnapshot ? JSON.stringify(input.outputSnapshot) : null,
        input.correlationId,
      ]
    );
    return result.rows[0];
  }

  async getAuditTimeline(riskEventId: string) {
    const result = await this.pool.query(
      `SELECT "id", "merchantId", "paymentAttemptId", "riskEventId", "eventType", "actor", "component",
              "action", "status", "reason", "inputSnapshot", "outputSnapshot", "correlationId", "createdAt"
       FROM "recovery_audits"
       WHERE "riskEventId" = $1
       ORDER BY "createdAt" ASC`,
      [riskEventId]
    );
    return result.rows;
  }

  async getMerchantAudits(merchantId: string, limit = 100) {
    const result = await this.pool.query(
      `SELECT "id", "merchantId", "paymentAttemptId", "riskEventId", "eventType", "actor", "component",
              "action", "status", "reason", "inputSnapshot", "outputSnapshot", "correlationId", "createdAt"
       FROM "recovery_audits"
       WHERE "merchantId" = $1
       ORDER BY "createdAt" DESC LIMIT $2`,
      [merchantId, limit]
    );
    return result.rows;
  }

  async getPaymentHistory(paymentAttemptId: string) {
    const attempts = await this.pool.query(
      `SELECT "id", "interventionType", "status", "attemptedAt" FROM "recovery_attempts" WHERE "paymentAttemptId" = $1 ORDER BY "createdAt" ASC`,
      [paymentAttemptId]
    );
    const executions = await this.pool.query(
      `SELECT "id", "interventionType", "status", "provider", "failureCode", "createdAt" FROM "recovery_executions" WHERE "paymentAttemptId" = $1 ORDER BY "createdAt" ASC`,
      [paymentAttemptId]
    );
    const outcomes = await this.pool.query(
      `SELECT "id", "executionId", "interventionType", "executionStatus", "outcomeStatus", "resolutionStatus", "measuredAt" FROM "recovery_outcomes" WHERE "paymentAttemptId" = $1 ORDER BY "createdAt" ASC`,
      [paymentAttemptId]
    );
    return {
      attempts: attempts.rows,
      executions: executions.rows,
      outcomes: outcomes.rows,
    };
  }

  async getRecoveryDetail(riskEventId: string) {
    const risk = await this.pool.query(`SELECT * FROM "risk_events" WHERE "id" = $1 LIMIT 1`, [riskEventId]);
    if (!risk.rows.length) return null;
    const riskEvent = risk.rows[0];

    const paymentAttemptId = riskEvent.paymentAttemptId;
    const merchantId = riskEvent.merchantId;

    const pa = await this.pool.query(`SELECT * FROM "payment_attempts" WHERE "id" = $1 LIMIT 1`, [paymentAttemptId]);
    const payment = pa.rows[0] || null;

    const cust = payment?.customerId ? await this.pool.query(`SELECT * FROM "customers" WHERE "id" = $1 LIMIT 1`, [payment.customerId]) : null;
    const customer = cust?.rows[0] || null;

    const val = await this.pool.query(`SELECT * FROM "validation_results" WHERE "riskEventId" = $1 LIMIT 1`, [riskEventId]);
    const validation = val.rows[0] || null;

    const control = await this.getRecoveryControl(riskEventId);
    const history = await this.getPaymentHistory(paymentAttemptId);
    const auditTimeline = await this.getAuditTimeline(riskEventId);

    const obligation = payment ? await this.getRevenueObligation(merchantId, payment.merchantOrderId) : null;
    const isRecovered = obligation?.status === 'RESOLVED';

    return {
      riskEventId,
      paymentAttemptId,
      merchantId,
      merchantOrderId: payment?.merchantOrderId || null,
      customer: customer ? { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone } : null,
      payment: payment ? { amount: payment.amount, currency: payment.currency, startedAt: payment.startedAt, resolvedAt: payment.resolvedAt } : null,
      diagnosis: validation ? { cause: validation.diagnosedCause, confidence: validation.diagnosisConfidence, priority: validation.priority, revenueAtRisk: validation.revenueAtRisk } : null,
      control: control ? { status: control.status, stoppedBy: control.stoppedBy, stopReason: control.stopReason, stoppedAt: control.stoppedAt } : { status: 'ACTIVE' },
      currentState: {
        riskEventStatus: riskEvent.processingStatus,
        obligationStatus: obligation?.status || 'UNRESOLVED',
        isRecovered,
      },
      attempts: history.executions,
      outcomes: history.outcomes,
      auditTimeline,
      moneyRecovered: isRecovered ? { amount: payment?.amount || 0, currency: payment?.currency || 'INR' } : { amount: 0, currency: payment?.currency || 'INR' },
    };
  }

  async getRecoveryMetrics(merchantId: string): Promise<RecoveryMetricsByCurrency[]> {
    const riskEventsRes = await this.pool.query(
      `SELECT r."id" as "riskEventId", r."paymentAttemptId", p."amount", p."currency", v."diagnosedCause"
       FROM "risk_events" r
       JOIN "payment_attempts" p ON r."paymentAttemptId" = p."id"
       LEFT JOIN "validation_results" v ON r."id" = v."riskEventId"
       WHERE r."merchantId" = $1`,
      [merchantId]
    );

    const outcomesRes = await this.pool.query(
      `SELECT o.*, ro."status" as "obligationStatus", p."amount", p."currency", p."merchantOrderId"
       FROM "recovery_outcomes" o
       JOIN "payment_attempts" p ON o."paymentAttemptId" = p."id"
       LEFT JOIN "revenue_obligations" ro ON p."merchantId" = ro."merchantId" AND p."merchantOrderId" = ro."merchantOrderId"
       WHERE o."merchantId" = $1`,
      [merchantId]
    );

    const controlsRes = await this.pool.query(
      `SELECT * FROM "recovery_controls" WHERE "merchantId" = $1`,
      [merchantId]
    );

    const currencies = Array.from(new Set(riskEventsRes.rows.map((r) => r.currency || 'INR')));
    const metricsList: RecoveryMetricsByCurrency[] = [];

    for (const curr of currencies) {
      const currRiskEvents = riskEventsRes.rows.filter((r) => (r.currency || 'INR') === curr);
      const currOutcomes = outcomesRes.rows.filter((o) => (o.currency || 'INR') === curr);

      const totalRevenueAtRisk = currRiskEvents.reduce((sum, r) => sum + Number(r.amount || 0), 0);

      // A recovery is counted ONLY IF RevenueObligation = RESOLVED AND RecoveryOutcome = RECOVERED
      const recoveredOutcomes = currOutcomes.filter((o) => o.obligationStatus === 'RESOLVED' && o.outcomeStatus === 'RECOVERED');
      const totalRecoveredRevenue = recoveredOutcomes.reduce((sum, o) => sum + Number(o.amount || 0), 0);

      const unrecoveredRevenue = Math.max(0, totalRevenueAtRisk - totalRecoveredRevenue);
      const recoveryRate = totalRevenueAtRisk > 0 ? Number((totalRecoveredRevenue / totalRevenueAtRisk).toFixed(4)) : 0;

      const riskEventsDetected = currRiskEvents.length;
      const recoveredEventIds = new Set(recoveredOutcomes.map((o) => o.paymentAttemptId));
      const recoveredEvents = recoveredEventIds.size;
      const unrecoveredEvents = Math.max(0, riskEventsDetected - recoveredEvents);

      const stoppedRiskIds = new Set(controlsRes.rows.filter((c) => c.status === 'STOPPED').map((c) => c.riskEventId));
      const stoppedRecoveries = currRiskEvents.filter((r) => stoppedRiskIds.has(r.riskEventId)).length;
      const activeRecoveries = Math.max(0, riskEventsDetected - recoveredEvents - stoppedRecoveries);

      const totalInterventionAttempts = currOutcomes.length;

      // Group by intervention
      const interventionMap = new Map<string, { attempts: number; recoveredEvents: Set<string>; recoveredRevenue: number }>();
      for (const out of currOutcomes) {
        const type = out.interventionType;
        if (!interventionMap.has(type)) {
          interventionMap.set(type, { attempts: 0, recoveredEvents: new Set(), recoveredRevenue: 0 });
        }
        const item = interventionMap.get(type)!;
        item.attempts += 1;
        if (out.obligationStatus === 'RESOLVED' && out.outcomeStatus === 'RECOVERED') {
          item.recoveredEvents.add(out.paymentAttemptId);
          item.recoveredRevenue += Number(out.amount || 0);
        }
      }

      const byIntervention = Array.from(interventionMap.entries()).map(([interventionType, data]) => ({
        interventionType,
        attempts: data.attempts,
        recoveredEvents: data.recoveredEvents.size,
        recoveredRevenue: data.recoveredRevenue,
      }));

      // Group by cause
      const causeMap = new Map<string, { events: Set<string>; recoveredEvents: Set<string>; recoveredRevenue: number }>();
      for (const re of currRiskEvents) {
        const cause = re.diagnosedCause || 'UNKNOWN';
        if (!causeMap.has(cause)) {
          causeMap.set(cause, { events: new Set(), recoveredEvents: new Set(), recoveredRevenue: 0 });
        }
        const item = causeMap.get(cause)!;
        item.events.add(re.riskEventId);
        if (recoveredEventIds.has(re.paymentAttemptId)) {
          item.recoveredEvents.add(re.riskEventId);
          item.recoveredRevenue += Number(re.amount || 0);
        }
      }

      const byCause = Array.from(causeMap.entries()).map(([cause, data]) => ({
        cause,
        events: data.events.size,
        recoveredEvents: data.recoveredEvents.size,
        recoveredRevenue: data.recoveredRevenue,
      }));

      metricsList.push({
        currency: curr,
        totalRevenueAtRisk,
        totalRecoveredRevenue,
        unrecoveredRevenue,
        recoveryRate,
        riskEventsDetected,
        recoveredEvents,
        unrecoveredEvents,
        activeRecoveries,
        stoppedRecoveries,
        totalInterventionAttempts,
        byIntervention,
        byCause,
      });
    }

    return metricsList;
  }

  async getActiveRecoveries(merchantId: string, limit = 50) {
    const result = await this.pool.query(
      `SELECT r."id" as "riskEventId", r."paymentAttemptId", r."processingStatus", r."emittedAt",
              p."merchantOrderId", p."amount", p."currency",
              c."name" as "customerName", c."email" as "customerEmail", c."phone" as "customerPhone",
              v."diagnosedCause", v."priority",
              rc."status" as "controlStatus"
       FROM "risk_events" r
       JOIN "payment_attempts" p ON r."paymentAttemptId" = p."id"
       LEFT JOIN "customers" c ON p."customerId" = c."id"
       LEFT JOIN "validation_results" v ON r."id" = v."riskEventId"
       LEFT JOIN "recovery_controls" rc ON r."id" = rc."riskEventId"
       WHERE r."merchantId" = $1
       ORDER BY r."emittedAt" DESC LIMIT $2`,
      [merchantId, limit]
    );
    return result.rows.map((row) => ({
      riskEventId: row.riskEventId,
      paymentAttemptId: row.paymentAttemptId,
      merchantOrderId: row.merchantOrderId,
      customer: {
        name: row.customerName,
        email: row.customerEmail,
        phone: row.customerPhone,
      },
      amount: Number(row.amount),
      currency: row.currency,
      diagnosis: {
        cause: row.diagnosedCause || 'UNKNOWN',
        priority: row.priority || 'UNKNOWN',
      },
      recoveryStatus: row.controlStatus === 'STOPPED' ? 'STOPPED' : row.processingStatus,
      startedAt: row.emittedAt,
    }));
  }
}
