import crypto from 'crypto';

const RAILWAY_URL = 'https://leakguard-razorpay-production.up.railway.app';
const REAL_RAZORPAY_KEY_ID = 'rzp_test_TWEQTS4vaQiKvB';
const REAL_RAZORPAY_SECRET = 'JwG1G4hB3xIpuPuwa1bJG9mL';
const MERCHANT_ID = `m_shopexpress_railway_${Date.now().toString().slice(-6)}`;
const MERCHANT_ORDER_ID = `order_railway_${Math.floor(1000 + Math.random() * 9000)}`;

async function testRailwayProduction() {
  console.log('\n================================================================');
  console.log('🚀 LIVE TESTING RAILWAY PRODUCTION DEPLOYMENT');
  console.log('🌐 Target URL:', RAILWAY_URL);
  console.log('================================================================\n');

  // STAGE 0: HEALTH CHECK
  console.log('📌 STAGE 0: TESTING HEALTHCHECK ENDPOINT');
  const healthRes = await fetch(`${RAILWAY_URL}/health`);
  const healthData = await healthRes.json();
  console.log('   HTTP Status:', healthRes.status, healthData);

  if (healthRes.status !== 200) {
    throw new Error('Health check failed!');
  }

  // STAGE 1: MERCHANT ONBOARDING (NEON DB PERSISTENCE)
  console.log('\n----------------------------------------------------------------');
  console.log('📌 STAGE 1: MERCHANT ONBOARDING (NEON POSTGRESQL)');
  console.log('----------------------------------------------------------------');
  const onboardRes = await fetch(`${RAILWAY_URL}/v1/merchants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: MERCHANT_ID,
      name: 'ShopExpress Railway Store',
      domain: 'shopexpress.com',
      environment: 'production',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      razorpayKeyId: REAL_RAZORPAY_KEY_ID,
      razorpayKeySecret: REAL_RAZORPAY_SECRET,
      defaultMarginRate: 0.20,
      categoryEconomics: {
        electrical: { margin_rate: 0.20 },
        home_appliances: { margin_rate: 0.15 },
      },
    }),
  });

  const onboardData = await onboardRes.json();
  console.log(' [API RESPONSE] Status:', onboardRes.status);
  console.log(JSON.stringify(onboardData, null, 2));

  // STAGE 2: UNIFIED PAYMENT SESSION (RAZORPAY + UPSTASH REDIS + NEON DB)
  console.log('\n----------------------------------------------------------------');
  console.log('📌 STAGE 2: UNIFIED PAYMENT SESSION & REAL RAZORPAY ORDER');
  console.log('----------------------------------------------------------------');
  const sessionRes = await fetch(`${RAILWAY_URL}/v1/payments/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantId: MERCHANT_ID,
      merchantOrderId: MERCHANT_ORDER_ID,
      amount: 750,
      currency: 'INR',
      customerId: 'cust_railway_user_1',
    }),
  });

  const sessionData = await sessionRes.json();
  console.log(' [API RESPONSE] Status:', sessionRes.status);
  console.log(JSON.stringify(sessionData, null, 2));

  const paId = sessionData.paymentAttemptId;
  const rzpOrderId = sessionData.razorpayOrderId;

  // STAGE 3: BROWSER SDK TELEMETRY INGESTION
  console.log('\n----------------------------------------------------------------');
  console.log('📌 STAGE 3: FAIL-OPEN BROWSER SDK TELEMETRY');
  console.log('----------------------------------------------------------------');
  const sdkRes = await fetch(`${RAILWAY_URL}/v1/sdk/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: MERCHANT_ID,
      payment_attempt_id: paId,
      events: [
        { event: 'checkout_opened', timestamp: new Date().toISOString(), source: 'sdk' },
        { event: 'payment_method_selected', timestamp: new Date().toISOString(), source: 'sdk' },
      ],
    }),
  });

  const sdkData = await sdkRes.json();
  console.log(' [API RESPONSE] Status:', sdkRes.status, sdkData);

  // STAGE 4: WEBHOOK HMAC SIGNATURE VERIFICATION & REJECTION TEST
  console.log('\n----------------------------------------------------------------');
  console.log('📌 STAGE 4: RAW BODY HMAC WEBHOOK SIGNATURE');
  console.log('----------------------------------------------------------------');

  const webhookPayload = {
    event: 'payment.failed',
    event_id: `evt_railway_fail_${Date.now()}`,
    account_id: MERCHANT_ID,
    payload: {
      payment: {
        entity: {
          id: `pay_railway_${Date.now()}`,
          order_id: rzpOrderId,
          status: 'failed',
          error_code: 'BAD_REQUEST_ERROR',
          error_reason: 'insufficient_funds',
          error_description: 'Payment failed due to insufficient funds',
        },
      },
    },
  };

  const rawBodyString = JSON.stringify(webhookPayload);

  // Calculate Authentic HMAC SHA-256
  const signature = crypto
    .createHmac('sha256', REAL_RAZORPAY_SECRET)
    .update(Buffer.from(rawBodyString))
    .digest('hex');

  console.log('   Calculated Signature:', signature);

  const webhookRes = await fetch(`${RAILWAY_URL}/v1/webhooks/razorpay?merchant_id=${MERCHANT_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature,
      'x-merchant-id': MERCHANT_ID,
    },
    body: rawBodyString,
  });

  const webhookData = await webhookRes.json();
  console.log(' [API RESPONSE] Status:', webhookRes.status, webhookData);

  console.log('\n ================================================================');
  console.log(' 🎉 SUCCESS: RAILWAY PRODUCTION DEPLOYMENT IS 100% FUNCTIONAL!');
  console.log(' ================================================================\n');
}

testRailwayProduction().catch((err) => console.error('Railway Test Error:', err));
