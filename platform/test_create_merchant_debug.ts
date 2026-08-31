async function debugCreateMerchant() {
  const testId = `m_debug_${Date.now()}`;
  console.log('Sending POST /v1/merchants to Railway API with Merchant ID:', testId);

  const res = await fetch('https://leakguard-razorpay-production.up.railway.app/v1/merchants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: testId,
      name: 'Debug Neon Test Merchant',
      domain: 'debugstore.com',
      environment: 'production',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      razorpayKeyId: 'rzp_test_debug',
      razorpayKeySecret: 'JwG1G4hB3xIpuPuwa1bJG9mL',
      defaultMarginRate: 0.20,
      categoryEconomics: {
        electrical: { margin_rate: 0.20 },
      },
    }),
  });

  const data = await res.json();
  console.log('HTTP Status:', res.status);
  console.log('Response Payload:', JSON.stringify(data, null, 2));
}

debugCreateMerchant().catch(console.error);
