import crypto from 'crypto';
import { prisma } from './src/infrastructure/db/prisma-client.js';
import { bullmqRedisClient, riskEventQueue, riskEventWorker, OutboxPublisher } from './src/infrastructure/queue/bullmq-client.js';

const RAILWAY_URL = 'https://leakguard-razorpay-production.up.railway.app';
const REAL_RAZORPAY_KEY_ID = 'rzp_test_TWEQTS4vaQiKvB';
const REAL_RAZORPAY_SECRET = 'JwG1G4hB3xIpuPuwa1bJG9mL';

async function runOutboxBullMQE2ETest() {
  console.log('\n================================================================================');
  console.log('🚀 TRANSACTIONAL OUTBOX & UPSTASH BULLMQ QUEUE E2E VERIFICATION TEST');
  console.log('🌐 Target Production API: ', RAILWAY_URL);
  console.log('🌐 Upstash Redis Queue:  ', 'together-octopus-214781.upstash.io');
  console.log('================================================================================\n');

  const merchantId = `m_outbox_store_${Date.now().toString().slice(-5)}`;
  const orderId = `order_outbox_${Math.floor(1000 + Math.random() * 9000)}`;

  // 1. ONBOARD MERCHANT
  console.log('📌 STEP 1: Onboarding Merchant with Category Economics...');
  const onboardRes = await fetch(`${RAILWAY_URL}/v1/merchants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: merchantId,
      name: 'ShopExpress Outbox E-Commerce',
      domain: 'shopexpress-outbox.com',
      environment: 'production',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      razorpayKeyId: REAL_RAZORPAY_KEY_ID,
      razorpayKeySecret: REAL_RAZORPAY_SECRET,
      defaultMarginRate: 0.20,
      categoryEconomics: {
        electrical: { margin_rate: 0.25 },
      },
    }),
  });
  console.log('   Status:', onboardRes.status, 'Merchant ID:', merchantId);

  // 2. CREATE PAYMENT SESSION
  console.log('\n📌 STEP 2: Creating Payment Attempt Session (₹20,000 Electrical)...');
  const sessionRes = await fetch(`${RAILWAY_URL}/v1/payments/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantId,
      merchantOrderId: orderId,
      amount: 20000,
      currency: 'INR',
      customerId: 'cust_outbox_user_99',
    }),
  });
  const session = await sessionRes.json();
  console.log('   Payment Attempt ID:', session.paymentAttemptId);
  console.log('   Razorpay Order ID: ', session.razorpayOrderId);

  // 3. INGEST WEBOOK FAILURE
  console.log('\n📌 STEP 3: Ingesting Razorpay Payment Failed Webhook Event...');
  const webhookPayload = {
    event: 'payment.failed',
    event_id: `evt_outbox_fail_${Date.now()}`,
    account_id: merchantId,
    payload: {
      payment: {
        entity: {
          id: `pay_outbox_${Date.now()}`,
          order_id: session.razorpayOrderId,
          status: 'failed',
          amount: 2000000, // ₹20,000
          currency: 'INR',
          error_code: 'BAD_REQUEST_ERROR',
          error_reason: 'insufficient_funds',
          error_description: 'Card issuer reported insufficient funds',
        },
      },
    },
  };

  const rawBody = JSON.stringify(webhookPayload);
  const signature = crypto.createHmac('sha256', REAL_RAZORPAY_SECRET).update(Buffer.from(rawBody)).digest('hex');

  const webhookRes = await fetch(`${RAILWAY_URL}/v1/webhooks/razorpay?merchant_id=${merchantId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature,
      'x-merchant-id': merchantId,
    },
    body: rawBody,
  });
  console.log('   Webhook HTTP Status:', webhookRes.status, await webhookRes.json());

  // 4. VERIFY NEON DB ATOMIC TRANSACTION (risk_events + outbox_events)
  console.log('\n📌 STEP 4: Inspecting Neon Cloud PostgreSQL Atomic Transaction Tables...');
  try {
    const riskEvent = await prisma.riskEvent.findFirst({
      where: { merchantId },
      orderBy: { emittedAt: 'desc' },
    });

    console.log('\n🐘 [NEON DB] Table `risk_events` Record:');
    console.log(JSON.stringify(riskEvent, null, 2));

    const outboxEvent = await prisma.outboxEvent.findFirst({
      where: { aggregateId: session.paymentAttemptId },
      orderBy: { createdAt: 'desc' },
    });

    console.log('\n🐘 [NEON DB] Table `outbox_events` Record:');
    console.log(JSON.stringify(outboxEvent, null, 2));
  } catch (dbErr: any) {
    console.log('   (Neon DB query error):', dbErr.message);
  }

  // 5. WAIT & VERIFY BULLMQ WORKER CONSUMPTION
  console.log('\n📌 STEP 5: Waiting 5 Seconds for BullMQ Worker to Process Queue Job...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log('\n📌 STEP 6: Checking Outbox Event Processed Status in Neon DB...');
  try {
    const processedOutbox = await prisma.outboxEvent.findFirst({
      where: { aggregateId: session.paymentAttemptId },
    });
    console.log('   Outbox Event Status:', processedOutbox?.status, 'Processed At:', processedOutbox?.processedAt);
  } catch (e: any) {}

  // CLEANUP QUEUE & WORKER
  await riskEventWorker.close();
  await riskEventQueue.close();
  await bullmqRedisClient.quit();

  console.log('\n================================================================================');
  console.log('🎉 END-TO-END TRANSACTIONAL OUTBOX & BULLMQ TEST COMPLETE!');
  console.log('================================================================================\n');
}

runOutboxBullMQE2ETest().catch(console.error);
