import { ExecutionAction, ProviderExecutionResult } from '../types/execution.types.js';
import { ProviderAdapter } from './provider-adapter.js';

export class MockProviderAdapter implements ProviderAdapter {
  constructor(private readonly provider: string, private readonly actionTypes: string[]) {}
  supports(actionType: string): boolean { return this.actionTypes.includes(actionType); }
  async execute(_action: ExecutionAction): Promise<ProviderExecutionResult> {
    return { provider: this.provider, success: true, status: 'QUEUED', providerExecutionId: `mock_${Date.now()}` };
  }
}
