import { ExecutionAction, ProviderExecutionResult } from '../types/execution.types.js';

export interface ProviderAdapter {
  supports(actionType: string): boolean;
  execute(action: ExecutionAction): Promise<ProviderExecutionResult>;
}
