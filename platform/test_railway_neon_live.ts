import { prisma } from './src/infrastructure/db/prisma-client';

async function testRailwayNeonLive() {
  const testId = `m_railway_neon_${Date.now().toString().slice(-6)}`;
  console.log('\n1. Sending POST /v1/merchants to Railway Backend:', testId);

  const res = await fetch('https://leakguard-razorpay-production.up.railway.app/v1/merchants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: testId,
      name: 'Railway Neon Live Verified Store',
      domain: 'railwayneonstore.com',
      environment: 'production',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      razorpayKeyId: 'rzp_test_TWEQTS4vaQiKvB',
      razorpayKeySecret: 'JwG1G4hB3xIpuPuwa1bJG9mL',
      defaultMarginRate: 0.20,
      categoryEconomics: {
        electrical: { margin_rate: 0.20 },
      },
    }),
  });

  const data = await res.json();
  console.log('HTTP Response Status:', res.status);
  console.log('API Output:', JSON.stringify(data, null, 2));

  console.log('\n2. Directly querying Neon Cloud PostgreSQL for created Merchant ID:', testId);
  const found = await prisma.merchant.findUnique({
    where: { id: testId },
    include: { economics: true },
  });

  if (found) {
    console.log('🎉 SUCCESS! Found Merchant record inside Neon Cloud PostgreSQL:');
    console.log(JSON.stringify(found, null, 2));
  } else {
    console.log('❌ NOT FOUND in Neon DB. Querying all merchants in Neon DB:');
    const all = await prisma.merchant.findMany();
    console.log('Total Merchants in Neon DB:', all.length, all);
  }
}

testRailwayNeonLive().catch(console.error);
