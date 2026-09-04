import { OutcomeRepository } from '../persistence/outcome.repository.js';
import { RecoveryAuditService } from '../audit/recovery-audit.service.js';

export class RecoveryControlService {
  constructor(
    private repository: OutcomeRepository = new OutcomeRepository(),
    private auditService: RecoveryAuditService = new RecoveryAuditService(repository)
  ) {}

  async isRecoveryActive(riskEventId: string): Promise<boolean> {
    const control = await this.repository.getRecoveryControl(riskEventId);
    if (!control) return true; // Default to active if control record doesn't exist yet
    return control.status === 'ACTIVE';
  }

  async stopRecoveryByMerchant(
    merchantId: string,
    riskEventId: string,
    reason: string = 'Merchant manually stopped recovery'
  ) {
    const pool = this.repository['pool'];
    const risk = await pool.query(
      `SELECT "id", "merchantId", "paymentAttemptId" FROM "risk_events" WHERE "id" = $1 AND "merchantId" = $2 LIMIT 1`,
      [riskEventId, merchantId]
    );

    if (!risk.rows.length) {
      throw new Error('RISK_EVENT_NOT_FOUND_FOR_MERCHANT');
    }

    const paymentAttemptId = risk.rows[0].paymentAttemptId;

    // Atomically transition control state
    const control = await this.repository.upsertRecoveryControl(
      riskEventId,
      merchantId,
      paymentAttemptId,
      'STOPPED',
      'MERCHANT',
      reason
    );

    // Atomically append audit log
    await this.auditService.logAudit({
      merchantId,
      paymentAttemptId,
      riskEventId,
      eventType: 'RECOVERY_STOPPED_BY_MERCHANT',
      actor: 'MERCHANT',
      component: 'CONTROL',
      action: 'STOP_RECOVERY',
      status: 'STOPPED',
      reason,
      correlationId: `corr_stop_${Date.now()}`,
    });

    // Update risk_event processingStatus to STOPPED
    await pool.query(
      `UPDATE "risk_events" SET "processingStatus" = 'STOPPED' WHERE "id" = $1`,
      [riskEventId]
    );

    return control;
  }

  async stopRecoveryBySystem(
    merchantId: string,
    paymentAttemptId: string,
    riskEventId: string,
    reason: string
  ) {
    const control = await this.repository.upsertRecoveryControl(
      riskEventId,
      merchantId,
      paymentAttemptId,
      'STOPPED',
      'SYSTEM',
      reason
    );

    await this.auditService.logAudit({
      merchantId,
      paymentAttemptId,
      riskEventId,
      eventType: 'RECOVERY_STOPPED_BY_SYSTEM',
      actor: 'SYSTEM',
      component: 'CONTROL',
      action: 'STOP_RECOVERY',
      status: 'STOPPED',
      reason,
      correlationId: `corr_sys_stop_${Date.now()}`,
    });

    const pool = this.repository['pool'];
    await pool.query(
      `UPDATE "risk_events" SET "processingStatus" = 'STOPPED' WHERE "id" = $1`,
      [riskEventId]
    );

    return control;
  }
}
