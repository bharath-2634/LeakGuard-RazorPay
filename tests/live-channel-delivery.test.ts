import assert from 'node:assert/strict';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../src/config/env.js';
import { startExecutionWorker } from '../src/execution/execution.worker.js';
import { ExecutionRequest } from '../src/execution/types/execution.types.js';

const runLive = process.env.RUN_LIVE_DELIVERY_TESTS === 'true';
const queueName = `risk-execution-channel-test-${Date.now()}`;
const redis = new Redis(config.INTERVENTION_REDIS_URL, { maxRetriesPerRequest: null, ...(config.INTERVENTION_REDIS_URL.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}) });
const queue = new Queue(queueName, { connection: redis });
const events = new QueueEvents(queueName, { connection: redis.duplicate() });

const baseContext = {
  metadata: { correlationId: `channel-test-${Date.now()}` },
  event: { riskEventId: 'risk-channel-test', paymentAttemptId: 'pa-channel-test', merchantId: 'merchant-channel-test', merchantOrderId: 'order-channel-test' },
  merchant: { id: 'merchant-channel-test', name: 'LeakGuard Channel Test', timezone: 'Asia/Kolkata', defaultCurrency: 'INR', recoveryEnabled: true, recoveryConfig: { whatsappEnabled: true, smsEnabled: true, emailEnabled: true, humanReviewEnabled: false } },
  customer: { id: 'customer-channel-test', name: 'Bharath', phone: '+917845425982', email: 'bharath2005goo@gmail.com' },
  payment: { paymentAttemptId: 'pa-channel-test', merchantOrderId: 'order-channel-test', amount: 100, currency: 'INR', providerState: 'FAILED', businessState: 'UNRESOLVED', revenueObligationStatus: 'UNRESOLVED' },
  diagnosis: { cause: 'MERCHANT_TECHNICAL_FAILURE', confidence: 0.99, actionabilityScore: 95, priority: 'HIGH' },
  economics: { revenueAtRisk: 100, expectedRecoveryValue: 80, netExpectedRecovery: 70 },
  evidence: { testCase: 'unresolved-channel-delivery' },
};

function request(type: 'SEND_WHATSAPP' | 'SEND_SMS' | 'SEND_EMAIL'): ExecutionRequest {
  return {
    executionRequestVersion: 'v1', policyEvaluationId: `policy-${type}-${Date.now()}`, riskEventId: 'risk-channel-test', paymentAttemptId: 'pa-channel-test', merchantId: 'merchant-channel-test',
    intervention: { type, rank: 1, score: 100 },
    policy: { decision: 'ALLOWED', policyVersion: 'merchant-v1', maxAttempts: 3, attemptsUsed: 0, attemptsRemaining: 3, coolOffSeconds: 0 },
    recoveryContext: baseContext,
    correlationId: `channel-${type}-${Date.now()}`,
  };
}

async function main() {
  if (!runLive) {
    process.env.EXECUTION_MODE = 'mock';
    console.log('DRY RUN: set RUN_LIVE_DELIVERY_TESTS=true and EXECUTION_MODE=live to contact providers.');
  }
  const worker = startExecutionWorker(queueName);
  await events.waitUntilReady();
  const results: Record<string, unknown>[] = [];
  for (const type of ['SEND_WHATSAPP', 'SEND_SMS', 'SEND_EMAIL'] as const) {
    const job = await queue.add(`TEST_${type}`, request(type), { removeOnComplete: true, removeOnFail: false });
    const result = await job.waitUntilFinished(events, 30000);
    results.push({ type, ...result });
    console.log(`${type}: ${result.status}${result.provider ? ` via ${result.provider}` : ''}${result.failureCode ? ` (${result.failureCode})` : ''}`);
  }
  if (!runLive) assert.deepEqual(results.map((result) => result.status), ['SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED']);
  await worker.close();
  await events.close();
  await queue.close();
  await redis.quit();
}

main().catch((error) => { console.error('Channel delivery test failed:', error); process.exitCode = 1; });
