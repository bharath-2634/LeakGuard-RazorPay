import { OutcomeRepository } from '../persistence/outcome.repository.js';
import { ResolutionStatus } from '../types/outcome.types.js';

export interface ResolutionCheckResult {
  status: ResolutionStatus;
  recoveryAmount?: number;
  recoveryCurrency?: string;
  resolutionSource?: string;
  resolvedAt?: Date;
}

export class ResolutionMonitor {
  constructor(private repository: OutcomeRepository = new OutcomeRepository()) {}

  async checkResolution(merchantId: string, merchantOrderId: string): Promise<ResolutionCheckResult> {
    const obligation = await this.repository.getRevenueObligation(merchantId, merchantOrderId);
    if (obligation && obligation.status === 'RESOLVED') {
      return {
        status: 'RESOLVED',
        recoveryAmount: Number(obligation.amount),
        recoveryCurrency: String(obligation.currency || 'INR'),
        resolutionSource: 'PAYMENT_SUCCESS',
        resolvedAt: obligation.resolvedAt ? new Date(obligation.resolvedAt) : new Date(),
      };
    }

    return {
      status: 'UNRESOLVED',
    };
  }

  async checkResolutionByAttempt(paymentAttemptId: string): Promise<ResolutionCheckResult> {
    const obligation = await this.repository.getRevenueObligationByAttempt(paymentAttemptId);
    if (obligation && obligation.status === 'RESOLVED') {
      return {
        status: 'RESOLVED',
        recoveryAmount: Number(obligation.amount),
        recoveryCurrency: String(obligation.currency || 'INR'),
        resolutionSource: 'PAYMENT_SUCCESS',
        resolvedAt: obligation.resolvedAt ? new Date(obligation.resolvedAt) : new Date(),
      };
    }
    return { status: 'UNRESOLVED' };
  }
}
