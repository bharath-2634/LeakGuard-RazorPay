import { OutcomeRepository } from '../persistence/outcome.repository.js';
import { ReassessmentContext } from '../types/outcome.types.js';
import { RecoveryAuditService } from '../audit/recovery-audit.service.js';

export class EventReassessmentService {
  constructor(
    private repository: OutcomeRepository = new OutcomeRepository(),
    private auditService: RecoveryAuditService = new RecoveryAuditService(repository)
  ) {}

  async triggerReassessment(params: {
    riskEventId: string;
    merchantId: string;
    paymentAttemptId: string;
    merchantOrderId: string;
    amount: number;
    currency: string;
    originalDiagnosis: string;
    continuationReason: string;
    preferredNextIntervention?: string;
    correlationId: string;
  }): Promise<ReassessmentContext> {
    const history = await this.repository.getPaymentHistory(params.paymentAttemptId);

    const reassessmentContext: ReassessmentContext = {
      riskEventId: params.riskEventId,
      merchantId: params.merchantId,
      paymentAttemptId: params.paymentAttemptId,
      merchantOrderId: params.merchantOrderId,
      amount: params.amount,
      currency: params.currency,
      originalDiagnosis: params.originalDiagnosis,
      attemptsCount: history.attempts.length,
      previousAttempts: history.attempts.map((a) => ({
        intervention: a.interventionType,
        status: a.status,
      })),
      previousOutcomes: history.outcomes.map((o) => ({
        interventionType: o.interventionType,
        outcomeStatus: o.outcomeStatus,
      })),
      continuationReason: params.continuationReason,
      preferredNextIntervention: params.preferredNextIntervention,
      correlationId: params.correlationId,
      reassessedAt: new Date().toISOString(),
    };

    const pool = this.repository['pool'];

    // 1. Transactionally persist OutboxEvent for REASSESSMENT_REQUESTED
    await pool.query(
      `INSERT INTO "outbox_events" ("id", "event_type", "aggregate_id", "payload", "status", "created_at")
       VALUES ($1, $2, $3, $4, 'PENDING', NOW())`,
      [
        `outbox_reassess_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        'REASSESSMENT_REQUESTED',
        params.riskEventId,
        JSON.stringify(reassessmentContext),
      ]
    );

    // 2. Append immutable audit log for REASSESSMENT_STARTED
    await this.auditService.logAudit({
      merchantId: params.merchantId,
      paymentAttemptId: params.paymentAttemptId,
      riskEventId: params.riskEventId,
      eventType: 'REASSESSMENT_STARTED',
      actor: 'SYSTEM',
      component: 'REASSESSMENT',
      action: 'TRIGGER_REASSESSMENT',
      status: 'SUCCESS',
      reason: params.continuationReason,
      inputSnapshot: { originalDiagnosis: params.originalDiagnosis, attemptsCount: history.attempts.length },
      outputSnapshot: { preferredNextIntervention: params.preferredNextIntervention },
      correlationId: params.correlationId,
    });

    return reassessmentContext;
  }
}
