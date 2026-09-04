import { OutcomeRepository } from '../persistence/outcome.repository.js';
import { AuditRecordInput } from '../types/outcome.types.js';

export class RecoveryAuditService {
  constructor(private repository: OutcomeRepository = new OutcomeRepository()) {}

  async logAudit(input: AuditRecordInput) {
    // Append-only: create new immutable record, never modify existing historical entries
    return this.repository.appendAuditRecord(input);
  }

  async getTimeline(riskEventId: string) {
    return this.repository.getAuditTimeline(riskEventId);
  }

  async getMerchantAudits(merchantId: string, limit = 100) {
    return this.repository.getMerchantAudits(merchantId, limit);
  }
}
