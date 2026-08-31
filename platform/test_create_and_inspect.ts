import { prisma } from './src/infrastructure/db/prisma-client';

async function testCreateAndInspect() {
  const testMerchantId = `m_shopexpress_neon_${Date.now().toString().slice(-6)}`;

  console.log('\n1. Sending POST /v1/merchants request to Railway API...');
  const res = await fetch('https://leakguard-razorpay-production.up.railway.app/v1/merchants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: testMerchantId,
      name: 'ShopExpress Live Neon Test Store',
      domain: 'shopexpress.com',
      environment: 'production',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      razorpayKeyId: 'rzp_test_TWEQTS4vaQiKvB',
      razorpayKeySecret: 'JwG1G4hB3xIpuPuwa1bJG9mL',
      defaultMarginRate: 0.25,
      categoryEconomics: {
        electrical: { margin_rate: 0.25 },
      },
    }),
  });

  const data = await res.json();
  console.log('HTTP Status:', res.status, data);

  console.log('\n2. Querying Neon Cloud Database directly for created Merchant...');
  const merchantRecord = await prisma.merchant.findUnique({
    where: { id: testMerchantId },
    include: { economics: true },
  });

  console.log('🐘 Neon Database Record Result:');
  console.log(JSON.stringify(merchantRecord, null, 2));
}

testCreateAndInspect().catch(console.error);
