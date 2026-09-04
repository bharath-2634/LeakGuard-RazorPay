import { resolveExecutionContext, ExecutionContextError } from './context/execution-context-resolver.js';
import { runFinalSafetyCheck } from './safety/final-safety-check.js';
import { validateExecutionAction } from './safety/execution-safety-validator.js';
import { createStrategies } from './strategy/strategies.js';
import { createProviderRegistry } from './providers/provider-registry.js';
import { completeExecution, persistInvalidExecution, startOrGetExecution } from './persistence/recovery-execution.repository.js';
import { ExecutionAction, ExecutionRequest, ExecutionResult } from './types/execution.types.js';
import { PaymentLinkProviderAdapter } from './providers/provider-adapter.js';

const strategies = createStrategies();
const providers = createProviderRegistry();

export async function executeRecovery(request: ExecutionRequest): Promise<ExecutionResult> {
  let context;
  try { context = resolveExecutionContext(request); }
  catch (error) {
    const invalid = error instanceof ExecutionContextError ? error : new ExecutionContextError('EXECUTION_CONTEXT_INVALID', String(error));
    const persistedId = await persistInvalidExecution(request, invalid.code, invalid.message);
    return { executionId: persistedId || `invalid_${Date.now()}`, status: 'BLOCKED', interventionType: request.intervention?.type || 'UNKNOWN', failureCode: invalid.code, failureReason: invalid.message };
  }

  const safetyCheck = runFinalSafetyCheck(context);
  const attemptNumber = context.policy.attemptsUsed + 1;
  const idempotencyKey = `${context.merchant.id}:${context.payment.paymentAttemptId}:${context.intervention.type}:${attemptNumber}`;
  const blocked = (failureCode: string, failureReason: string): ExecutionResult => ({ executionId: `pending_${idempotencyKey}`, status: 'BLOCKED', interventionType: context.intervention.type, failureCode, failureReason });

  const safetyFailureWithoutPolicy = Object.entries(safetyCheck.checks)
    .filter(([key]) => key !== 'policyAllowed')
    .some(([, passed]) => !passed);
  if (context.policy.decision === 'APPROVAL_REQUIRED' && !safetyFailureWithoutPolicy) {
    const record = await startOrGetExecution({ context, status: 'BLOCKED', attemptNumber, idempotencyKey, safetyCheck, failureCode: 'APPROVAL_REQUIRED', failureReason: 'Human approval is required before execution' });
    const result = { ...blocked('APPROVAL_REQUIRED', 'Human approval is required before execution'), executionId: record.id } as ExecutionResult;
    await completeExecution({ executionId: record.id, context, result, safetyCheck });
    return result;
  }
  if (!safetyCheck.safe) {
    const record = await startOrGetExecution({ context, status: 'BLOCKED', attemptNumber, idempotencyKey, safetyCheck, failureCode: 'FINAL_SAFETY_CHECK_FAILED', failureReason: safetyCheck.reason });
    const result = { ...blocked('FINAL_SAFETY_CHECK_FAILED', safetyCheck.reason || 'Final safety check failed'), executionId: record.id } as ExecutionResult;
    await completeExecution({ executionId: record.id, context, result, safetyCheck });
    return result;
  }
  const strategy = strategies.find((candidate) => candidate.supports(context.intervention.type));
  if (!strategy) return blocked('EXECUTION_STRATEGY_UNSUPPORTED', `No strategy supports ${context.intervention.type}`);
  const action = await strategy.execute(context);
  const validation = validateExecutionAction(action, context);
  if (!validation.valid) {
    const record = await startOrGetExecution({ context, status: 'BLOCKED', attemptNumber, idempotencyKey, safetyCheck, safetyValidation: validation, action, failureCode: 'EXECUTION_ACTION_INVALID', failureReason: validation.violations.map((violation) => violation.code).join(',') });
    const result = { ...blocked('EXECUTION_ACTION_INVALID', validation.violations.map((violation) => violation.message).join('; ')), executionId: record.id } as ExecutionResult;
    await completeExecution({ executionId: record.id, context, result, action, safetyCheck, safetyValidation: validation });
    return result;
  }

  const record = await startOrGetExecution({ context, status: 'STARTED', attemptNumber, idempotencyKey, safetyCheck, action });
  if (record.status !== 'STARTED') return { executionId: record.id, status: record.status as any, interventionType: context.intervention.type };
  const provider = providers.find((candidate) => candidate.supports(action.actionType));
  if (!provider) {
    const result = { executionId: record.id, status: 'FAILED' as const, interventionType: context.intervention.type, failureCode: 'PROVIDER_UNSUPPORTED', failureReason: `No provider supports ${action.actionType}` };
    await completeExecution({ executionId: record.id, context, result, action, safetyCheck, safetyValidation: validation });
    return result;
  }
  try {
    let finalAction = action;
    if (action.actionType !== 'PAYMENT_LINK' && action.content?.includes('{{PAYMENT_LINK}}')) {
      const paymentLinkProvider = providers.find((candidate): candidate is PaymentLinkProviderAdapter => 'createPaymentLink' in candidate && candidate.supports('PAYMENT_LINK'));
      if (!paymentLinkProvider) {
        const result: ExecutionResult = { executionId: record.id, status: 'FAILED', interventionType: context.intervention.type, failureCode: 'PAYMENT_LINK_PROVIDER_UNSUPPORTED', failureReason: 'No payment-link provider is configured' };
        await completeExecution({ executionId: record.id, context, result, action, safetyCheck, safetyValidation: validation });
        return result;
      }
      const paymentLinkAction: ExecutionAction = {
        actionType: 'PAYMENT_LINK',
        interventionType: 'SEND_PAYMENT_LINK',
        provider: 'RAZORPAY',
        amount: context.payment.amount,
        currency: context.payment.currency,
        merchantOrderId: context.payment.merchantOrderId,
        metadata: { merchantId: context.merchant.id, customer: context.customer },
      };
      const paymentLink = await paymentLinkProvider.createPaymentLink(paymentLinkAction);
      if (!paymentLink.success || !paymentLink.paymentLinkUrl) {
        const result: ExecutionResult = { executionId: record.id, status: 'FAILED', interventionType: context.intervention.type, provider: 'RAZORPAY', failureCode: paymentLink.failureCode || 'PAYMENT_LINK_CREATION_FAILED', failureReason: paymentLink.failureReason || 'Razorpay did not return a payment link' };
        await completeExecution({ executionId: record.id, context, result, action, safetyCheck, safetyValidation: validation, providerResult: { provider: 'RAZORPAY', success: false, status: 'FAILED', failureCode: result.failureCode, failureReason: result.failureReason } });
        return result;
      }
      finalAction = { ...action, content: action.content.replaceAll('{{PAYMENT_LINK}}', paymentLink.paymentLinkUrl), metadata: { ...action.metadata, paymentLinkUrl: paymentLink.paymentLinkUrl, paymentLinkProviderResourceId: paymentLink.providerResourceId } };
      const finalValidation = validateExecutionAction(finalAction, context);
      if (!finalValidation.valid) {
        const result: ExecutionResult = { executionId: record.id, status: 'BLOCKED', interventionType: context.intervention.type, failureCode: 'EXECUTION_ACTION_INVALID', failureReason: finalValidation.violations.map((violation) => violation.message).join('; ') };
        await completeExecution({ executionId: record.id, context, result, action: finalAction, safetyCheck, safetyValidation: finalValidation });
        return result;
      }
    }
    const providerResult = await provider.execute(finalAction);
    const result: ExecutionResult = providerResult.success
      ? { executionId: record.id, status: 'SUCCEEDED', interventionType: context.intervention.type, provider: providerResult.provider, providerExecutionId: providerResult.providerExecutionId || providerResult.providerResourceId, executedAt: new Date().toISOString() }
      : { executionId: record.id, status: 'FAILED', interventionType: context.intervention.type, provider: providerResult.provider, failureCode: providerResult.failureCode || 'PROVIDER_FAILURE', failureReason: providerResult.failureReason || 'Provider rejected the action' };
    await completeExecution({ executionId: record.id, context, result, action, safetyCheck, safetyValidation: validation, providerResult });
    return result;
  } catch (error) {
    const result: ExecutionResult = { executionId: record.id, status: 'FAILED', interventionType: context.intervention.type, provider: action.provider, failureCode: 'PROVIDER_EXCEPTION', failureReason: error instanceof Error ? error.message : String(error) };
    await completeExecution({ executionId: record.id, context, result, action, safetyCheck, safetyValidation: validation });
    return result;
  }
}
