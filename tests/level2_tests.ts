import { Queue, Worker } from 'bullmq';
import { prisma } from '../src/infrastructure/db/prisma-client.js';
import { config } from '../src/config/env.js';
import Redis from 'ioredis';
import assert from 'node:assert';

// Import the actual worker logic
import { validationWorker } from '../src/application/validation-worker.js';

const redisUrl = process.env.BULLMQ_REDIS_URL || config.BULLMQ_REDIS_URL;
const redis = new Redis(redisUrl, {
  ...(redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {})
});
const riskQueue = new Queue('risk-validation', { connection: redis });

async function waitForWorker() {
  console.log('Waiting for ValidationWorker to connect to Redis...');
  await validationWorker.waitUntilReady();
  console.log('ValidationWorker is ready!');
}

async function seedBaseData(prefix: string) {
  const merchantId = `m_${prefix}`;
  const merchantOrderId = `mo_${prefix}`;
  const paymentAttemptId = `pa_${prefix}`;

  await prisma.merchant.upsert({
    where: { id: merchantId },
    update: {},
    create: { id: merchantId, name: 'L2 Test', domain: 'l2.com', razorpayKeyId: 'rzp_l2', razorpaySecretRef: 'sec_l2' }
  });

  await prisma.paymentAttempt.upsert({
    where: { id: paymentAttemptId },
    update: {},
    create: { id: paymentAttemptId, merchantId, merchantOrderId, amount: 1000, currency: 'INR', providerState: 'failed', startedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) }
  });

  return { merchantId, merchantOrderId, paymentAttemptId };
}

async function waitForProcessing(riskEventId: string) {
  let lastStatus = 'UNKNOWN';
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 200)); // Increase wait time to 10s total
    const evt = await prisma.riskEvent.findUnique({ where: { id: riskEventId } });
    if (evt) lastStatus = evt.processingStatus;
    if (evt && (evt.processingStatus === 'COMPLETED' || evt.processingStatus === 'STOPPED')) return evt;
  }
  throw new Error(`Timeout waiting for event ${riskEventId}. Last status: ${lastStatus}`);
}

async function runLevel2A() {
  console.log('\n--- Scenario 2A: Normal PROCEED ---');
  const { merchantId, merchantOrderId, paymentAttemptId } = await seedBaseData('l2a');
  const riskEventId = 're_l2a_01';

  await prisma.merchantEconomics.upsert({
    where: { merchantId }, update: { minimumRecoveryThreshold: 0, baseRecoveryCost: 0 },
    create: { merchantId, minimumRecoveryThreshold: 0, baseRecoveryCost: 0, defaultMarginRate: 1.0 }
  });
  
  await prisma.revenueObligation.upsert({
    where: { merchantId_merchantOrderId: { merchantId, merchantOrderId } },
    update: { status: 'UNRESOLVED' },
    create: { merchantId, merchantOrderId, amount: 1000, currency: 'INR', status: 'UNRESOLVED' }
  });

  // Seed a razorpay webhook event to guarantee PROCEED
  await prisma.razorpayWebhookEvent.deleteMany({ where: { merchantId, orderId: merchantOrderId } });
  await prisma.razorpayWebhookEvent.create({
    data: { razorpayEventId: 'ev_l2a', merchantId, orderId: merchantOrderId, eventType: 'payment.failed', payload: { payload: { payment: { entity: { error: { code: 'ERR', reason: 'insufficient_funds', source: 'issuer', step: 'payment_authorization' } } } } } }
  });

  await prisma.riskEvent.create({ data: { id: riskEventId, paymentAttemptId, merchantId, eventType: 'PAYMENT_FAILURE_RISK', payload: {}, processingStatus: 'PENDING' } });
  
  await riskQueue.add('VALIDATE', { riskEventId, paymentAttemptId, merchantId, merchantOrderId });
  
  const re = await waitForProcessing(riskEventId);
  assert.strictEqual(re.processingStatus, 'COMPLETED');
  
  const vr = await prisma.validationResult.findUnique({ where: { riskEventId } });
  assert.strictEqual(vr?.decision, 'PROCEED');
  
  const outbox = await prisma.outboxEvent.findFirst({ where: { aggregateId: riskEventId, eventType: 'VALIDATION_COMPLETED' } });
  assert.ok(outbox);
  console.log('✅ Scenario 2A Passed');
}

async function runLevel2B_Actionability() {
  console.log('\n--- Scenario 2B: Business STOP (Actionability = INSUFFICIENT) ---');
  const { merchantId, merchantOrderId, paymentAttemptId } = await seedBaseData('l2b_act');
  const riskEventId = 're_l2b_act_01';

  await prisma.merchantEconomics.upsert({
    where: { merchantId }, update: {},
    create: { merchantId, minimumRecoveryThreshold: 0, baseRecoveryCost: 0, defaultMarginRate: 1.0 }
  });
  
  await prisma.revenueObligation.upsert({
    where: { merchantId_merchantOrderId: { merchantId, merchantOrderId } },
    update: { status: 'UNRESOLVED' },
    create: { merchantId, merchantOrderId, amount: 1000, currency: 'INR', status: 'UNRESOLVED' }
  });

  await prisma.razorpayWebhookEvent.deleteMany({ where: { merchantId, orderId: merchantOrderId } }); // Empty evidence -> UNKNOWN -> INSUFFICIENT

  await prisma.riskEvent.create({ data: { id: riskEventId, paymentAttemptId, merchantId, eventType: 'PAYMENT_FAILURE_RISK', payload: {}, processingStatus: 'PENDING' } });
  
  await riskQueue.add('VALIDATE', { riskEventId, paymentAttemptId, merchantId, merchantOrderId });
  
  const re = await waitForProcessing(riskEventId);
  assert.strictEqual(re.processingStatus, 'STOPPED');
  
  const vr = await prisma.validationResult.findUnique({ where: { riskEventId } });
  assert.strictEqual(vr?.decision, 'STOP');
  assert.strictEqual(vr?.stopReason, 'ACTIONABILITY_INSUFFICIENT');
  
  const outbox = await prisma.outboxEvent.findFirst({ where: { aggregateId: riskEventId, eventType: 'VALIDATION_COMPLETED' } });
  assert.strictEqual(outbox, null);
  console.log('✅ Scenario 2B (Actionability) Passed');
}

async function runLevel2B_Economics() {
  console.log('\n--- Scenario 2B: Business STOP (Economics) ---');
  const { merchantId, merchantOrderId, paymentAttemptId } = await seedBaseData('l2b_eco');
  const riskEventId = 're_l2b_eco_01';

  await prisma.merchantEconomics.upsert({
    where: { merchantId }, update: { minimumRecoveryThreshold: 999999 }, // Force NER < threshold
    create: { merchantId, minimumRecoveryThreshold: 999999, baseRecoveryCost: 0, defaultMarginRate: 1.0 }
  });
  
  await prisma.revenueObligation.upsert({
    where: { merchantId_merchantOrderId: { merchantId, merchantOrderId } },
    update: { status: 'UNRESOLVED' },
    create: { merchantId, merchantOrderId, amount: 1000, currency: 'INR', status: 'UNRESOLVED' }
  });

  await prisma.razorpayWebhookEvent.deleteMany({ where: { merchantId, orderId: merchantOrderId } });
  await prisma.razorpayWebhookEvent.create({
    data: { razorpayEventId: 'ev_l2b_eco', merchantId, orderId: merchantOrderId, eventType: 'payment.failed', payload: { payload: { payment: { entity: { error: { code: 'ERR', reason: 'insufficient_funds', source: 'issuer', step: 'payment_authorization' } } } } } }
  });

  await prisma.riskEvent.create({ data: { id: riskEventId, paymentAttemptId, merchantId, eventType: 'PAYMENT_FAILURE_RISK', payload: {}, processingStatus: 'PENDING' } });
  
  await riskQueue.add('VALIDATE', { riskEventId, paymentAttemptId, merchantId, merchantOrderId });
  
  const re = await waitForProcessing(riskEventId);
  assert.strictEqual(re.processingStatus, 'STOPPED');
  
  const vr = await prisma.validationResult.findUnique({ where: { riskEventId } });
  assert.strictEqual(vr?.decision, 'STOP');
  assert.strictEqual(vr?.stopReason, 'ECONOMICALLY_NOT_WORTHWHILE');
  
  const outbox = await prisma.outboxEvent.findFirst({ where: { aggregateId: riskEventId, eventType: 'VALIDATION_COMPLETED' } });
  assert.strictEqual(outbox, null);
  console.log('✅ Scenario 2B (Economics) Passed');
}

async function runLevel2C() {
  console.log('\n--- Scenario 2C: Already Resolved ---');
  const { merchantId, merchantOrderId, paymentAttemptId } = await seedBaseData('l2c');
  const riskEventId = 're_l2c_01';

  await prisma.merchantEconomics.upsert({
    where: { merchantId }, update: {},
    create: { merchantId, minimumRecoveryThreshold: 0, baseRecoveryCost: 0, defaultMarginRate: 1.0 }
  });
  
  await prisma.revenueObligation.upsert({
    where: { merchantId_merchantOrderId: { merchantId, merchantOrderId } },
    update: { status: 'RESOLVED' }, // ALREADY RESOLVED!
    create: { merchantId, merchantOrderId, amount: 1000, currency: 'INR', status: 'RESOLVED' }
  });

  await prisma.riskEvent.create({ data: { id: riskEventId, paymentAttemptId, merchantId, eventType: 'PAYMENT_FAILURE_RISK', payload: {}, processingStatus: 'PENDING' } });
  
  await riskQueue.add('VALIDATE', { riskEventId, paymentAttemptId, merchantId, merchantOrderId });
  
  const re = await waitForProcessing(riskEventId);
  assert.strictEqual(re.processingStatus, 'STOPPED');
  
  const vr = await prisma.validationResult.findUnique({ where: { riskEventId } });
  assert.strictEqual(vr, null, 'ValidationResult should NOT exist');
  
  console.log('✅ Scenario 2C Passed');
}

async function runAll() {
  await waitForWorker();
  
  // Clean DB for specific records before we start
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { startsWith: 're_l2' } } });
  await prisma.validationResult.deleteMany({ where: { riskEventId: { startsWith: 're_l2' } } });
  await prisma.riskEvent.deleteMany({ where: { id: { startsWith: 're_l2' } } });
  
  await runLevel2A();
  await runLevel2B_Actionability();
  await runLevel2B_Economics();
  await runLevel2C();
  console.log('\n🎉 ALL LEVEL 2 INTEGRATION TESTS PASSED!');
  process.exit(0);
}

runAll().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
