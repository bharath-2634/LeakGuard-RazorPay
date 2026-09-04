import { ExecutionAction, PaymentLinkResult, ProviderExecutionResult } from '../types/execution.types.js';
import { PaymentLinkProviderAdapter, ProviderAdapter } from './provider-adapter.js';

export class MockProviderAdapter implements ProviderAdapter {
  constructor(private readonly provider: string, private readonly actionTypes: string[]) {}
  supports(actionType: string): boolean { return this.actionTypes.includes(actionType); }
  async execute(_action: ExecutionAction): Promise<ProviderExecutionResult> {
    return { provider: this.provider, success: true, status: 'QUEUED', providerExecutionId: `mock_${Date.now()}` };
  }
}

export class MockPaymentLinkAdapter extends MockProviderAdapter implements PaymentLinkProviderAdapter {
  async createPaymentLink(action: ExecutionAction): Promise<PaymentLinkResult> {
    return { success: true, providerResourceId: `mock_link_${Date.now()}`, paymentLinkUrl: `https://pay.example.test/${encodeURIComponent(action.merchantOrderId || 'payment')}` };
  }
}
