import assert from 'node:assert/strict';
import { ExecutionRequest } from '../src/execution/types/execution.types.js';

delete process.env.DATABASE_URL;
process.env.EXECUTION_MODE = 'mock';
const { executeRecovery } = await import('../src/execution/execution.service.js');

function request(type: string, overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    executionRequestVersion: 'v1',
    policyEvaluationId: `policy-${type}`,
    validationResultId: 'validation-test',
    riskEventId: 'risk-test',
    paymentAttemptId: 'payment-test',
    merchantId: 'merchant-test',
    intervention: { type, rank: 1, score: 90 },
    policy: { decision: 'ALLOWED', policyVersion: 'merchant-v1', maxAttempts: 3, attemptsUsed: 0, attemptsRemaining: 3, coolOffSeconds: 0 },
    recoveryContext: {
      metadata: { correlationId: 'execution-test' },
      event: { riskEventId: 'risk-test', paymentAttemptId: 'payment-test', merchantId: 'merchant-test', merchantOrderId: 'order-test' },
      merchant: { id: 'merchant-test', name: 'Test Merchant', timezone: 'UTC', defaultCurrency: 'INR', recoveryEnabled: true, recoveryConfig: { smsEnabled: true, whatsappEnabled: true, emailEnabled: true, humanReviewEnabled: true } },
      customer: { id: 'customer-test', name: 'Test Customer', phone: '+919999999999', email: 'customer@example.com' },
      payment: { paymentAttemptId: 'payment-test', merchantOrderId: 'order-test', amount: 100, currency: 'INR', providerState: 'FAILED', businessState: 'UNRESOLVED' },
      diagnosis: { cause: 'INSUFFICIENT_FUNDS', confidence: 0.9, actionabilityScore: 90, priority: 'HIGH' },
      economics: {},
      evidence: {},
    },
    ...overrides,
  };
}

const success = await executeRecovery(request('SEND_SMS'));
assert.equal(success.status, 'SUCCEEDED');
assert.equal(success.provider, 'TWILIO');

const missingPhone = await executeRecovery(request('SEND_WHATSAPP', {
  recoveryContext: {
    ...request('SEND_WHATSAPP').recoveryContext,
    customer: { id: 'customer-test', name: 'No Phone', email: 'customer@example.com' },
  },
}));
assert.equal(missingPhone.status, 'BLOCKED');
assert.equal(missingPhone.failureCode, 'FINAL_SAFETY_CHECK_FAILED');

const approval = await executeRecovery(request('HUMAN_REVIEW', {
  policy: { ...request('HUMAN_REVIEW').policy, decision: 'APPROVAL_REQUIRED' },
}));
assert.equal(approval.status, 'BLOCKED');
assert.equal(approval.failureCode, 'APPROVAL_REQUIRED');

const resolved = await executeRecovery(request('SEND_SMS', {
  recoveryContext: {
    ...request('SEND_SMS').recoveryContext,
    payment: { paymentAttemptId: 'payment-test', merchantOrderId: 'order-test', amount: 100, currency: 'INR', providerState: 'CAPTURED', businessState: 'RESOLVED' },
  },
}));
assert.equal(resolved.status, 'BLOCKED');
assert.equal(resolved.failureCode, 'FINAL_SAFETY_CHECK_FAILED');

console.log('Execution engine tests passed');
