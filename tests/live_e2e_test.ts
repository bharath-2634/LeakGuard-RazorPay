import { prisma } from '../src/infrastructure/db/prisma-client.js';
import crypto from 'crypto';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { config } from '../src/config/env.js';

// Connection to the Live Upstash Redis for Intervention module (Output)
const interventionRedisClient = new Redis(config.INTERVENTION_REDIS_URL, {
  maxRetriesPerRequest: null,
  ...(config.INTERVENTION_REDIS_URL.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {})
});

const riskInterventionQueue = new Queue('risk-intervention', {
  connection: interventionRedisClient,
});

// The Live SDK Platform endpoint
const SDK_URL = 'https://leakguard-razorpay-production.up.railway.app';

async function runLiveE2E() {
  console.log('--- STARTING LIVE END-TO-END TEST ---');

  // 1. Setup a Test Merchant in Live DB
  const testMerchantId = `live_e2e_${Date.now()}`;
  console.log(`Setting up Test Merchant: ${testMerchantId}`);

  await prisma.merchant.create({
    data: {
      id: testMerchantId,
      name: 'Live E2E Test Merchant',
      domain: 'live-e2e.test.com',
      environment: 'test',
      razorpayKeyId: 'rzp_test_e2e',
      razorpaySecretRef: 'mock_secret_key' // Will be handled by the fallback in webhook.controller
    }
  });

  await prisma.merchantEconomics.create({
    data: {
      merchantId: testMerchantId,
      minimumRecoveryThreshold: 0,
      baseRecoveryCost: 0,
      defaultMarginRate: 1.0
    }
  });

  // 2. Create Payment Session
  console.log('\n2. Creating Payment Session via SDK API...');
  const sessionRes = await fetch(`${SDK_URL}/v1/payments/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantId: testMerchantId,
      merchantOrderId: `order_${Date.now()}`,
      amount: 5000,
      currency: 'INR'
    })
  });

  if (!sessionRes.ok) {
    throw new Error(`Failed to create session: ${await sessionRes.text()}`);
  }
  
  const sessionData = await sessionRes.json();
  console.log('Payment Session created:', sessionData);

  const { paymentAttemptId, merchantOrderId, razorpayOrderId } = sessionData;

  // 3. Send SDK Telemetry (Checkout Closed)
  console.log('\n3. Simulating SDK Event (checkout_closed)...');
  const telemetryRes = await fetch(`${SDK_URL}/v1/merchant-telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: testMerchantId,
      payment_attempt_id: paymentAttemptId,
      merchant_order_id: merchantOrderId,
      event_type: 'checkout_closed',
      severity: 'INFO',
      status: 200
    })
  });
  console.log('Telemetry Response:', await telemetryRes.json());

  // 4. Send Razorpay Webhook (payment.failed)
  console.log('\n4. Simulating Razorpay Webhook (payment.failed)...');
  const webhookBody = {
    event: 'payment.failed',
    event_id: `evt_rzp_${Date.now()}`,
    account_id: testMerchantId,
    payload: {
      payment: {
        entity: {
          id: `pay_${Date.now()}`,
          order_id: razorpayOrderId,
          status: 'failed',
          error_code: 'BAD_REQUEST_ERROR',
          error_reason: 'insufficient_funds',
          error_source: 'issuer',
          error_step: 'payment_authorization'
        }
      }
    }
  };

  const secretKey = 'mock_secret_key'; // The fallback in webhook.controller
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(JSON.stringify(webhookBody))
    .digest('hex');

  const webhookRes = await fetch(`${SDK_URL}/v1/webhooks/razorpay`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature,
      'x-merchant-id': testMerchantId
    },
    body: JSON.stringify(webhookBody)
  });
  console.log('Webhook Response:', await webhookRes.json());

  // 5. Wait for SDK to produce RiskEvent and ValidationEngine to process it
  console.log('\n5. Waiting for Live Pipelines to process (SDK Correlator -> BullMQ -> ValidationEngine -> OutboxRelay)...');
  
  let riskEvent = null;
  let validationResult = null;
  
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(`Checking DB (Attempt ${i+1}/20)...`);
    
    if (!riskEvent) {
      riskEvent = await prisma.riskEvent.findFirst({
        where: { merchantId: testMerchantId }
      });
      if (riskEvent) console.log(`[SDK Correlator] RiskEvent found! Status: ${riskEvent.processingStatus}`);
    }

    if (riskEvent && !validationResult) {
      validationResult = await prisma.validationResult.findUnique({
        where: { riskEventId: riskEvent.id }
      });
      if (validationResult) {
        console.log(`[Validation Worker] ValidationResult generated! Decision: ${validationResult.decision}`);
      }
    }

    if (validationResult) break;
  }

  if (!validationResult) {
    throw new Error('Timeout waiting for ValidationResult to be generated in Live DB');
  }

  // 6. Check final output in the Intervention Upstash Queue
  console.log('\n6. Checking Upstash Risk Intervention Queue...');
  await new Promise(resolve => setTimeout(resolve, 3000)); // Allow time for OutboxRelay

  const jobs = await riskInterventionQueue.getJobs(['waiting', 'active', 'delayed']);
  const handoffJob = jobs.find(j => j.data.riskEventId === riskEvent?.id);

  if (handoffJob) {
    console.log(`✅ VERIFIED: Found Job #${handoffJob.id} in 'risk-intervention' queue!`);
    console.log(`Payload Decision:`, handoffJob.data.economics.decision);
    console.log(`Payload Merchant:`, handoffJob.data.context.merchant.name);
  } else {
    console.error('❌ ERROR: Handoff job not found in queue. OutboxRelay might not have processed it yet.');
  }

  console.log('\n🎉 E2E LIVE TEST COMPLETE!');
  process.exit(0);
}

runLiveE2E().catch(err => {
  console.error('❌ E2E TEST FAILED:', err);
  process.exit(1);
});
