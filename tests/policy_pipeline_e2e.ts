import assert from 'node:assert/strict';
import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../src/config/env.js';
import { startInterventionWorker } from '../src/recovery/intervention/orchestration/intervention-worker.js';
import { CAUSE_INTERVENTION_MAP } from '../src/recovery/intervention/catalog/cause-catalog.js';
import { InterventionType } from '../src/recovery/intervention/catalog/intervention.types.js';

const queueName = `risk-intervention-e2e-${Date.now()}`;
const connection = new Redis(config.INTERVENTION_REDIS_URL, {
  maxRetriesPerRequest: null,
  ...(config.INTERVENTION_REDIS_URL.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {})
});
const queue = new Queue(queueName, { connection });
const queueEvents = new QueueEvents(queueName, { connection: connection.duplicate() });

const allPolicies = (allowed = true) => ({
  recoveryEnabled: true,
  version: 'merchant-v1',
  ...Object.fromEntries([
    'RETRY_PAYMENT', 'SEND_PAYMENT_LINK', 'CHANGE_PAYMENT_METHOD_PROMPT',
    'SEND_EMAIL', 'SEND_SMS', 'SEND_WHATSAPP', 'HUMAN_REVIEW'
  ].map((type) => [type, { allowed }])),
});

const allCompliance = () => ({
  SEND_EMAIL: 'ALLOWED' as const,
  SEND_SMS: 'ALLOWED' as const,
  SEND_WHATSAPP: 'ALLOWED' as const,
});

function context(cause: string, overrides: Record<string, unknown> = {}) {
  return {
    metadata: { correlationId: `e2e-${cause}-${Date.now()}` },
    event: { riskEventId: `risk-${cause}`, paymentAttemptId: `pa-${cause}`, merchantId: 'merchant-e2e', merchantOrderId: `order-${cause}`, amount: 8500, currency: 'INR' },
    diagnosis: { cause, diagnosedCause: cause, confidence: 0.99, actionabilityScore: 95, actionabilityStatus: 'HIGHLY_ACTIONABLE', priority: 'HIGH' },
    economics: { revenueAtRisk: 8500, expectedRecoveryValue: 5000, netExpectedRecovery: 4900 },
    customer: { id: 'customer-e2e', externalCustomerId: 'customer-e2e', name: 'E2E Customer', email: 'customer@example.com', phone: '+919999988888' },
    merchant: {
      id: 'merchant-e2e', name: 'E2E Merchant', timezone: 'Asia/Kolkata', defaultCurrency: 'INR',
      recoveryConfig: { emailEnabled: true, smsEnabled: true, whatsappEnabled: true, humanReviewEnabled: true, humanReviewEmail: 'recovery@example.com', version: 1 },
      recoveryPolicy: allPolicies(),
    },
    payment: { paymentAttemptId: `pa-${cause}`, providerState: 'FAILED', businessState: 'UNRESOLVED' },
    order: { merchantOrderId: `order-${cause}`, amount: 8500, currency: 'INR' },
    compliance: allCompliance(),
    ...overrides,
  };
}

async function runCase(name: string, payload: Record<string, unknown>) {
  const job = await queue.add('START_INTERVENTION', payload, { removeOnComplete: false, removeOnFail: false });
  const result = await job.waitUntilFinished(queueEvents, 120000);
  const selection = result.selectionResult;
  const loops = (selection.policyEvaluations?.length || 0) + (selection.replanUsed ? 1 : 0);
  console.log(`\nCASE ${name}`);
  console.log(`  status=${selection.status} selector=${selection.selector} fallback=${selection.fallbackUsed} loops=${loops}`);
  console.log(`  candidates=${selection.rankedCandidates.map((candidate: any) => `${candidate.interventionType}#${candidate.rank}`).join(', ') || 'none'}`);
  console.log(`  policy=${selection.policyEvaluations?.map((evaluation: any) => `${evaluation.interventionType}:${evaluation.decision}`).join(', ') || 'none'}`);
  return selection;
}

async function main() {
  const worker = await startInterventionWorker(queueName);
  await queueEvents.waitUntilReady();
  const results: Array<{ name: string; status: string }> = [];

  for (const cause of Object.keys(CAUSE_INTERVENTION_MAP)) {
    if (cause === 'UNKNOWN') continue;
    const selection = await runCase(`failure:${cause}`, context(cause));
    assert.equal(selection.status, 'COMPLETED', `${cause} should produce an executable or approval-required candidate`);
    results.push({ name: cause, status: selection.status || 'undefined' });
  }

  const resolved = await runCase('success:captured-payment', context('INSUFFICIENT_FUNDS', {
    payment: { paymentAttemptId: 'pa-success', providerState: 'CAPTURED', businessState: 'RESOLVED' },
  }));
  assert.equal(resolved.status, 'STOPPED_ALREADY_RESOLVED');
  results.push({ name: 'success:captured-payment', status: resolved.status || 'undefined' });

  const killSwitch = await runCase('policy:kill-switch-off', context('TECHNICAL_FAILURE', {
    merchant: { ...context('TECHNICAL_FAILURE').merchant as any, recoveryPolicy: { ...allPolicies(), recoveryEnabled: false } },
  }));
  assert.equal(killSwitch.status, 'NO_POLICY_ALLOWED_INTERVENTION');
  results.push({ name: 'policy:kill-switch-off', status: killSwitch.status || 'undefined' });

  const unknownCompliance = await runCase('policy:unknown-compliance', context('TECHNICAL_FAILURE', {
    merchant: { ...context('TECHNICAL_FAILURE').merchant as any, recoveryPolicy: { ...allPolicies(false), SEND_EMAIL: { allowed: true } } },
    compliance: {},
  }));
  assert.equal(unknownCompliance.status, 'NO_POLICY_ALLOWED_INTERVENTION');
  results.push({ name: 'policy:unknown-compliance', status: unknownCompliance.status || 'undefined' });

  const exhausted = await runCase('policy:frequency-exhausted', context('TECHNICAL_FAILURE', {
    previousAttempts: Object.keys(allPolicies()).filter((type) => type !== 'recoveryEnabled' && type !== 'version').map((type) => ({ interventionType: type, status: 'FAILED', attemptedAt: new Date().toISOString() })),
  }));
  assert.equal(exhausted.status, 'NO_POLICY_ALLOWED_INTERVENTION');
  results.push({ name: 'policy:frequency-exhausted', status: exhausted.status || 'undefined' });

  const coolOffAttempts = Object.keys(allPolicies()).filter((type) => type !== 'recoveryEnabled' && type !== 'version').map((type) => ({ interventionType: type, status: 'EXECUTED', attemptedAt: new Date().toISOString() }));
  const coolOff = await runCase('policy:cool-off-active', context('TECHNICAL_FAILURE', { previousAttempts: coolOffAttempts }));
  assert.equal(coolOff.status, 'NO_POLICY_ALLOWED_INTERVENTION');
  results.push({ name: 'policy:cool-off-active', status: coolOff.status || 'undefined' });

  console.log(`\nSUMMARY: ${results.length} cases passed`);
  console.log(results.map((result) => `  ${result.name}: ${result.status}`).join('\n'));

  await worker.close();
  await queueEvents.close();
  await queue.close();
  await connection.quit();
}

main().catch(async (error) => {
  console.error('E2E pipeline test failed:', error);
  await queueEvents.close().catch(() => undefined);
  await queue.close().catch(() => undefined);
  await connection.quit().catch(() => undefined);
  process.exitCode = 1;
});
