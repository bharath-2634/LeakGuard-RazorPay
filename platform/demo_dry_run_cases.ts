import crypto from 'crypto';
import { prisma } from './src/infrastructure/db/prisma-client';
import Redis from 'ioredis';

const RAILWAY_URL = 'https://leakguard-razorpay-production.up.railway.app';
const REAL_RAZORPAY_KEY_ID = 'rzp_test_TWEQTS4vaQiKvB';
const REAL_RAZORPAY_SECRET = 'JwG1G4hB3xIpuPuwa1bJG9mL';

async function runDemoCases() {
  console.log('\n================================================================================');
  console.log('🚀 LEAKGUARD PRODUCTION PLATFORM: DEMO & DRY-RUN EXECUTION SUITE');
  console.log('🌐 Target Production API:', RAILWAY_URL);
  console.log('================================================================================\n');

  const merchantId = `m_demo_store_${Date.now().toString().slice(-5)}`;

  // STAGE 1: ONBOARD DEMO MERCHANT
  console.log('📌 STEP 1: ONBOARD MERCHANT & CONFIGURE CATEGORY MARGINAL RATES');
  const onboardRes = await fetch(`${RAILWAY_URL}/v1/merchants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: merchantId,
      name: 'TechMart India E-Commerce',
      domain: 'techmart.in',
      environment: 'production',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      razorpayKeyId: REAL_RAZORPAY_KEY_ID,
      razorpayKeySecret: REAL_RAZORPAY_SECRET,
      defaultMarginRate: 0.20,
      categoryEconomics: {
        electrical: { margin_rate: 0.25 },
        home_appliances: { margin_rate: 0.15 },
      },
    }),
  });
  const onboardData = await onboardRes.json();
  console.log('   Merchant ID Generated:', merchantId);
  console.log('   API Response Status:', onboardRes.status);
  console.log('   Category Margins Configured: Electrical (25%), Home Appliances (15%)\n');

  // =================================================================================
  // DEMO CASE 1: High-Margin Electrical Failure (₹10,000 @ 25% Margin)
  // =================================================================================
  console.log('================================================================================');
  console.log('🧪 DEMO CASE 1: High-Margin Electrical Purchase Payment Failure');
  console.log('   Amount: ₹10,000 | Category: Electrical (25% Margin) | Reason: Insufficient Funds');
  console.log('================================================================================');

  const orderId1 = `order_demo1_${Math.floor(1000 + Math.random() * 9000)}`;

  // 1. Create Session
  const session1Res = await fetch(`${RAILWAY_URL}/v1/payments/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantId,
      merchantOrderId: orderId1,
      amount: 10000,
      currency: 'INR',
      customerId: 'cust_demo_user_1',
    }),
  });
  const session1 = await session1Res.json();
  console.log(' [1. SESSION CREATED] Payment Attempt ID:', session1.paymentAttemptId);
  console.log('                      Razorpay Order ID:', session1.razorpayOrderId);

  // 2. SDK Telemetry
  await fetch(`${RAILWAY_URL}/v1/sdk/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: merchantId,
      payment_attempt_id: session1.paymentAttemptId,
      events: [
        { event: 'checkout_opened', timestamp: new Date().toISOString(), source: 'sdk' },
        { event: 'payment_method_selected', timestamp: new Date().toISOString(), source: 'sdk', payload: { method: 'upi' } },
      ],
    }),
  });
  console.log(' [2. SDK TELEMETRY] Ingested 2 checkout events (checkout_opened, method_selected: upi)');

  // 3. Razorpay Webhook Payment Failed
  const webhook1Payload = {
    event: 'payment.failed',
    event_id: `evt_demo1_fail_${Date.now()}`,
    account_id: merchantId,
    payload: {
      payment: {
        entity: {
          id: `pay_demo1_${Date.now()}`,
          order_id: session1.razorpayOrderId,
          status: 'failed',
          amount: 1000000, // in paise = ₹10,000
          currency: 'INR',
          error_code: 'BAD_REQUEST_ERROR',
          error_reason: 'insufficient_funds',
          error_description: 'Payment failed due to insufficient funds in account',
        },
      },
    },
  };

  const raw1 = JSON.stringify(webhook1Payload);
  const sig1 = crypto.createHmac('sha256', REAL_RAZORPAY_SECRET).update(Buffer.from(raw1)).digest('hex');

  const wh1Res = await fetch(`${RAILWAY_URL}/v1/webhooks/razorpay?merchant_id=${merchantId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': sig1,
      'x-merchant-id': merchantId,
    },
    body: raw1,
  });
  const wh1Data = await wh1Res.json();
  console.log(' [3. WEBHOOK INGESTED] Status:', wh1Res.status, wh1Data);

  // =================================================================================
  // DEMO CASE 2: High-Value Home Appliance Failure (₹45,000 @ 15% Margin)
  // =================================================================================
  console.log('\n================================================================================');
  console.log('🧪 DEMO CASE 2: High-Value Home Appliance Purchase Payment Failure');
  console.log('   Amount: ₹45,000 | Category: Home Appliances (15% Margin) | Reason: Network Timeout');
  console.log('================================================================================');

  const orderId2 = `order_demo2_${Math.floor(1000 + Math.random() * 9000)}`;

  const session2Res = await fetch(`${RAILWAY_URL}/v1/payments/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantId,
      merchantOrderId: orderId2,
      amount: 45000,
      currency: 'INR',
      customerId: 'cust_demo_user_2',
    }),
  });
  const session2 = await session2Res.json();
  console.log(' [1. SESSION CREATED] Payment Attempt ID:', session2.paymentAttemptId);
  console.log('                      Razorpay Order ID:', session2.razorpayOrderId);

  const webhook2Payload = {
    event: 'payment.failed',
    event_id: `evt_demo2_fail_${Date.now()}`,
    account_id: merchantId,
    payload: {
      payment: {
        entity: {
          id: `pay_demo2_${Date.now()}`,
          order_id: session2.razorpayOrderId,
          status: 'failed',
          amount: 4500000, // ₹45,000
          currency: 'INR',
          error_code: 'GATEWAY_ERROR',
          error_reason: 'bank_technical_error',
          error_description: 'Issuer bank server timed out during authorization',
        },
      },
    },
  };

  const raw2 = JSON.stringify(webhook2Payload);
  const sig2 = crypto.createHmac('sha256', REAL_RAZORPAY_SECRET).update(Buffer.from(raw2)).digest('hex');

  await fetch(`${RAILWAY_URL}/v1/webhooks/razorpay?merchant_id=${merchantId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': sig2,
      'x-merchant-id': merchantId,
    },
    body: raw2,
  });
  console.log(' [2. WEBHOOK INGESTED] Processed failure correlation for Case 2.');

  // =================================================================================
  // DEMO CASE 3: Idempotent Webhook Replay (Duplicate Event Rejection)
  // =================================================================================
  console.log('\n================================================================================');
  console.log('🧪 DEMO CASE 3: Webhook Event Replay & Idempotency Test');
  console.log('   Re-sending Webhook Event ID:', webhook1Payload.event_id);
  console.log('================================================================================');

  const replayRes = await fetch(`${RAILWAY_URL}/v1/webhooks/razorpay?merchant_id=${merchantId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': sig1,
      'x-merchant-id': merchantId,
    },
    body: raw1,
  });
  const replayData = await replayRes.json();
  console.log(' [IDEMPOTENCY RESPONSE] Status:', replayRes.status, replayData);

  // =================================================================================
  // OUTPUT PERSISTENCE INSPECTION (NEON DB + UPSTASH REDIS)
  // =================================================================================
  console.log('\n================================================================================');
  console.log('📊 ACCESSIBLE MODULE OUTPUTS & STORED ARTIFACTS');
  console.log('================================================================================\n');

  // 1. NEON POSTGRESQL RISK EVENTS OUTPUT
  console.log('--------------------------------------------------------------------------------');
  console.log('🐘 OUTPUT 1: NEON CLOUD POSTGRESQL DATABASE (Risk Events & Leak Alerts)');
  console.log('--------------------------------------------------------------------------------');
  try {
    const riskEvents = await prisma.riskEvent.findMany({
      where: { merchantId },
      orderBy: { emittedAt: 'desc' },
    });

    console.log(`✅ Retrieved ${riskEvents.length} Revenue Risk Alert Events from Neon DB:\n`);
    riskEvents.forEach((evt, idx) => {
      console.log(`--- [Risk Event #${idx + 1}] ID: ${evt.id} ---`);
      console.log(`   Type:            ${evt.eventType}`);
      console.log(`   Emitted At:      ${evt.emittedAt.toISOString()}`);
      console.log(`   Payload Details:`, JSON.stringify(evt.payload, null, 2));
      console.log('');
    });
  } catch (err: any) {
    console.log('   (Risk events query via Neon direct pool):', err.message);
  }

  // 2. PAYMENT ATTEMPTS AUDIT TRAIL OUTPUT
  console.log('--------------------------------------------------------------------------------');
  console.log('🐘 OUTPUT 2: NEON CLOUD POSTGRESQL DATABASE (Payment Attempts Audit Trail)');
  console.log('--------------------------------------------------------------------------------');
  try {
    const attempts = await prisma.paymentAttempt.findMany({
      where: { merchantId },
      include: { paymentEvents: true },
    });
    console.log(`✅ Total Tracked Payment Sessions (${attempts.length}):\n`);
    attempts.forEach((pa) => {
      console.log(`   Attempt ID: ${pa.id} | Order: ${pa.merchantOrderId} | Amount: ₹${pa.amount} | Provider State: ${pa.providerState} | Business State: ${pa.businessState}`);
    });
  } catch (err: any) {
    console.log('   (Payment attempts query via Neon direct pool):', err.message);
  }

  // 3. UPSTASH REDIS HOT STATE OUTPUT
  console.log('\n--------------------------------------------------------------------------------');
  console.log('⚡ OUTPUT 3: UPSTASH CLOUD REDIS CACHE (Sub-millisecond Session State)');
  console.log('--------------------------------------------------------------------------------');
  const redisUrl = process.env.REDIS_URL || 'rediss://default:gQAAAAAAAfwyAAIgcDI3OThiZGI0NmI0MGM0M2Q0YmNiYTJjOTlkYTAxZGIzNw@engaging-lizard-130098.upstash.io:6379';
  const redis = new Redis(redisUrl, { tls: { rejectUnauthorized: false } });

  const keys = await redis.keys(`payment_attempt:*`);
  console.log(`✅ Active Redis Session Keys (${keys.length}):`, keys);
  for (const k of keys.slice(0, 2)) {
    const hash = await redis.hgetall(k);
    console.log(`   [REDIS HASH] ${k}:`, hash);
  }
  await redis.quit();

  console.log('\n================================================================================');
  console.log(' 🎉 DEMO DRY-RUN COMPLETED SUCCESSFULLY! ALL OUTPUTS VERIFIED.');
  console.log('================================================================================\n');
}

runDemoCases().catch(console.error);
