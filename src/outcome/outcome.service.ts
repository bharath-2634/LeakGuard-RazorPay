import { OutcomeRepository } from './persistence/outcome.repository.js';
import { ResolutionMonitor } from './resolution/resolution-monitor.js';
import { OutcomeMeasurer } from './measurement/outcome-measurer.js';
import { ContinuationDecisionMaker } from './continuation/continuation-decision-maker.js';
import { EventReassessmentService } from './reassessment/event-reassessment.js';
import { RecoveryAuditService } from './audit/recovery-audit.service.js';
import { RecoveryControlService } from './control/recovery-control.service.js';
import { ExecutionEventPayload } from './types/outcome.types.js';

export class OutcomeService {
  constructor(
    private repository: OutcomeRepository = new OutcomeRepository(),
    private resolutionMonitor: ResolutionMonitor = new ResolutionMonitor(repository),
    private outcomeMeasurer: OutcomeMeasurer = new OutcomeMeasurer(repository, resolutionMonitor),
    private continuationDecisionMaker: ContinuationDecisionMaker = new ContinuationDecisionMaker(repository),
    private reassessmentService: EventReassessmentService = new EventReassessmentService(repository),
    private auditService: RecoveryAuditService = new RecoveryAuditService(repository),
    private controlService: RecoveryControlService = new RecoveryControlService(repository)
  ) {}

  async processExecutionEvent(payload: ExecutionEventPayload) {
    const { executionId, merchantId, paymentAttemptId, riskEventId, interventionType, status, correlationId } = payload;

    // 1. Audit execution event ingestion
    await this.auditService.logAudit({
      merchantId,
      paymentAttemptId,
      riskEventId,
      eventType: `EXECUTION_${status}`,
      actor: 'PROVIDER',
      component: 'EXECUTION',
      action: 'PROCESS_EXECUTION_OUTCOME',
      status,
      reason: payload.failureReason || `Provider execution status: ${status}`,
      inputSnapshot: { executionId, provider: payload.provider, providerExecutionId: payload.providerExecutionId },
      correlationId,
    });

    // 2. Check if recovery has been stopped by Merchant or System
    if (riskEventId) {
      const isActive = await this.controlService.isRecoveryActive(riskEventId);
      if (!isActive) {
        await this.repository.upsertRecoveryOutcome({
          merchantId,
          paymentAttemptId,
          riskEventId,
          executionId,
          interventionType,
          executionStatus: status,
          outcomeStatus: 'NOT_RECOVERED',
          resolutionStatus: 'UNRESOLVED',
          metadata: { stoppedReason: 'Recovery manually stopped by merchant' },
        });
        return { outcomeStatus: 'NOT_RECOVERED', continuation: { continue: false, reason: 'Recovery stopped by merchant' } };
      }
    }

    // 3. Authoritative RevenueObligation check
    const resolutionRes = await this.resolutionMonitor.checkResolutionByAttempt(paymentAttemptId);
    if (resolutionRes.status === 'RESOLVED') {
      const outcome = await this.repository.upsertRecoveryOutcome({
        merchantId,
        paymentAttemptId,
        riskEventId,
        executionId,
        interventionType,
        executionStatus: status,
        outcomeStatus: 'RECOVERED',
        resolutionStatus: 'RESOLVED',
        recoveryAmount: resolutionRes.recoveryAmount,
        recoveryCurrency: resolutionRes.recoveryCurrency,
        resolutionSource: resolutionRes.resolutionSource || 'PAYMENT_SUCCESS',
      });

      if (riskEventId) {
        await this.controlService.stopRecoveryBySystem(merchantId, paymentAttemptId, riskEventId, 'CUSTOMER_RECOVERED');
      }

      await this.auditService.logAudit({
        merchantId,
        paymentAttemptId,
        riskEventId,
        eventType: 'RECOVERY_DETECTED',
        actor: 'SYSTEM',
        component: 'OUTCOME',
        action: 'MARK_RECOVERED',
        status: 'RECOVERED',
        reason: 'Customer successfully resolved revenue obligation',
        outputSnapshot: { recoveryAmount: resolutionRes.recoveryAmount, currency: resolutionRes.recoveryCurrency },
        correlationId,
      });

      return { outcomeStatus: 'RECOVERED', outcome };
    }

    // 4. If execution failed or blocked, outcome is NOT_RECOVERED immediately
    if (status === 'FAILED' || status === 'BLOCKED') {
      const outcome = await this.repository.upsertRecoveryOutcome({
        merchantId,
        paymentAttemptId,
        riskEventId,
        executionId,
        interventionType,
        executionStatus: status,
        outcomeStatus: 'NOT_RECOVERED',
        resolutionStatus: 'UNRESOLVED',
        metadata: { failureCode: payload.failureCode, failureReason: payload.failureReason },
      });

      return this.evaluateContinuation({
        merchantId,
        paymentAttemptId,
        riskEventId,
        interventionType,
        correlationId,
      });
    }

    // 5. Execution succeeded but payment unresolved -> set PENDING & schedule measurement window
    const measureResult = await this.outcomeMeasurer.evaluateOutcomeNow({
      merchantId,
      paymentAttemptId,
      riskEventId,
      executionId,
      interventionType,
      executionStatus: status,
      correlationId,
    });

    await this.auditService.logAudit({
      merchantId,
      paymentAttemptId,
      riskEventId,
      eventType: 'OUTCOME_MEASURED',
      actor: 'SYSTEM',
      component: 'OUTCOME',
      action: 'MEASURE_OUTCOME',
      status: measureResult.outcomeStatus,
      reason: `Outcome initial state: ${measureResult.outcomeStatus}`,
      correlationId,
    });

    return measureResult;
  }

  async processExpiredMeasurementWindow(payload: {
    merchantId: string;
    paymentAttemptId: string;
    riskEventId?: string;
    executionId: string;
    interventionType: string;
    correlationId: string;
  }) {
    // 1. Authoritative check on RevenueObligation
    const res = await this.resolutionMonitor.checkResolutionByAttempt(payload.paymentAttemptId);
    if (res.status === 'RESOLVED') {
      const outcome = await this.repository.upsertRecoveryOutcome({
        merchantId: payload.merchantId,
        paymentAttemptId: payload.paymentAttemptId,
        riskEventId: payload.riskEventId,
        executionId: payload.executionId,
        interventionType: payload.interventionType,
        executionStatus: 'SUCCEEDED',
        outcomeStatus: 'RECOVERED',
        resolutionStatus: 'RESOLVED',
        recoveryAmount: res.recoveryAmount,
        recoveryCurrency: res.recoveryCurrency,
        resolutionSource: res.resolutionSource || 'PAYMENT_SUCCESS',
      });

      if (payload.riskEventId) {
        await this.controlService.stopRecoveryBySystem(payload.merchantId, payload.paymentAttemptId, payload.riskEventId, 'CUSTOMER_RECOVERED');
      }

      await this.auditService.logAudit({
        merchantId: payload.merchantId,
        paymentAttemptId: payload.paymentAttemptId,
        riskEventId: payload.riskEventId,
        eventType: 'RECOVERY_DETECTED',
        actor: 'SYSTEM',
        component: 'OUTCOME',
        action: 'MARK_RECOVERED',
        status: 'RECOVERED',
        reason: 'Revenue obligation resolved during measurement window',
        correlationId: payload.correlationId,
      });

      return { outcomeStatus: 'RECOVERED', outcome };
    }

    // 2. Window expired without resolution -> mark NOT_RECOVERED
    const outcome = await this.repository.upsertRecoveryOutcome({
      merchantId: payload.merchantId,
      paymentAttemptId: payload.paymentAttemptId,
      riskEventId: payload.riskEventId,
      executionId: payload.executionId,
      interventionType: payload.interventionType,
      executionStatus: 'SUCCEEDED',
      outcomeStatus: 'NOT_RECOVERED',
      resolutionStatus: 'UNRESOLVED',
    });

    await this.auditService.logAudit({
      merchantId: payload.merchantId,
      paymentAttemptId: payload.paymentAttemptId,
      riskEventId: payload.riskEventId,
      eventType: 'OUTCOME_NOT_RECOVERED',
      actor: 'SYSTEM',
      component: 'OUTCOME',
      action: 'EXPIRE_MEASUREMENT_WINDOW',
      status: 'NOT_RECOVERED',
      reason: 'Measurement window expired without payment resolution',
      correlationId: payload.correlationId,
    });

    // 3. Evaluate continuation
    return this.evaluateContinuation(payload);
  }

  private async evaluateContinuation(payload: {
    merchantId: string;
    paymentAttemptId: string;
    riskEventId?: string;
    interventionType: string;
    correlationId: string;
  }) {
    const history = await this.repository.getPaymentHistory(payload.paymentAttemptId);
    const pool = this.repository['pool'];

    const pa = await pool.query(`SELECT * FROM "payment_attempts" WHERE "id" = $1 LIMIT 1`, [payload.paymentAttemptId]);
    const payment = pa.rows[0] || {};

    const val = payload.riskEventId
      ? await pool.query(`SELECT * FROM "validation_results" WHERE "riskEventId" = $1 LIMIT 1`, [payload.riskEventId])
      : { rows: [] };
    const validation = val.rows[0] || {};

    const ALL_CANDIDATES = ['CHANGE_PAYMENT_METHOD_PROMPT', 'SEND_PAYMENT_LINK', 'RETRY_PAYMENT', 'SEND_WHATSAPP', 'SEND_SMS', 'SEND_EMAIL'];
    const attemptedTypes = new Set(history.attempts.map((a: any) => a.interventionType));
    const remainingEligibleInterventions = ALL_CANDIDATES.filter((c) => !attemptedTypes.has(c));

    const decision = await this.continuationDecisionMaker.decideContinuation({
      riskEventId: payload.riskEventId,
      merchantId: payload.merchantId,
      paymentAttemptId: payload.paymentAttemptId,
      merchantOrderId: payment.merchantOrderId || '',
      amount: Number(payment.amount || 0),
      currency: payment.currency || 'INR',
      diagnosedCause: validation.diagnosedCause || 'UNKNOWN',
      confidence: Number(validation.diagnosisConfidence || 0),
      priority: validation.priority || 'UNKNOWN',
      customerSegment: payment.customerSegment,
      historicalLtv: payment.historicalLtv ? Number(payment.historicalLtv) : undefined,
      attemptsUsed: history.attempts.length,
      maxAttempts: 3,
      previousAttempts: history.attempts.map((a: any) => ({ intervention: a.interventionType, status: a.status })),
      previousOutcomes: history.outcomes.map((o: any) => ({ interventionType: o.interventionType, outcomeStatus: o.outcomeStatus })),
      remainingEligibleInterventions,
    });

    await this.auditService.logAudit({
      merchantId: payload.merchantId,
      paymentAttemptId: payload.paymentAttemptId,
      riskEventId: payload.riskEventId,
      eventType: decision.continue ? 'CONTINUATION_APPROVED' : 'CONTINUATION_STOPPED',
      actor: decision.evaluator === 'GEMINI_REASONING' ? 'GEMINI' : 'SYSTEM',
      component: 'OUTCOME',
      action: 'EVALUATE_CONTINUATION',
      status: decision.continue ? 'CONTINUE' : 'STOP',
      reason: decision.reason,
      outputSnapshot: { preferredNextIntervention: decision.preferredNextIntervention, confidence: decision.confidence },
      correlationId: payload.correlationId,
    });

    if (!decision.continue) {
      if (payload.riskEventId) {
        await this.controlService.stopRecoveryBySystem(payload.merchantId, payload.paymentAttemptId, payload.riskEventId, decision.reason);
      }
      return { outcomeStatus: 'NOT_RECOVERED', continuation: decision };
    }

    // Continuation approved -> trigger reassessment loopback
    if (payload.riskEventId) {
      await this.reassessmentService.triggerReassessment({
        riskEventId: payload.riskEventId,
        merchantId: payload.merchantId,
        paymentAttemptId: payload.paymentAttemptId,
        merchantOrderId: payment.merchantOrderId || '',
        amount: Number(payment.amount || 0),
        currency: payment.currency || 'INR',
        originalDiagnosis: validation.diagnosedCause || 'UNKNOWN',
        continuationReason: decision.reason,
        preferredNextIntervention: decision.preferredNextIntervention,
        correlationId: payload.correlationId,
      });
    }

    return { outcomeStatus: 'NOT_RECOVERED', continuation: decision };
  }
}
