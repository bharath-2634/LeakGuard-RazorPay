import { ExecutionAction, ExecutionContext } from '../types/execution.types.js';

export interface ExecutionStrategy {
  supports(interventionType: string): boolean;
  execute(context: ExecutionContext): Promise<ExecutionAction>;
}
