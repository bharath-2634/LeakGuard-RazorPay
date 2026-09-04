import { ExecutionAction, PaymentLinkResult, ProviderExecutionResult } from '../types/execution.types.js';

export interface ProviderAdapter {
  supports(actionType: string): boolean;
  execute(action: ExecutionAction): Promise<ProviderExecutionResult>;
}

export interface PaymentLinkProviderAdapter extends ProviderAdapter {
  createPaymentLink(action: ExecutionAction): Promise<PaymentLinkResult>;
}
