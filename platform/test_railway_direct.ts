async function testBackend() {
  const targetUrl = 'https://leakguard-razorpay-production.up.railway.app';
  console.log('Testing Railway Backend Target:', targetUrl);

  try {
    const healthRes = await fetch(`${targetUrl}/health`);
    const healthText = await healthRes.text();
    console.log('\n/health HTTP Status:', healthRes.status);
    console.log('Response Content:', healthText.substring(0, 300));
  } catch (err: any) {
    console.error('Health fetch error:', err.message);
  }

  try {
    const dbRes = await fetch(`${targetUrl}/v1/db-status`);
    const dbText = await dbRes.text();
    console.log('\n/v1/db-status HTTP Status:', dbRes.status);
    console.log('Response Content:', dbText.substring(0, 300));
  } catch (err: any) {
    console.error('DB Status fetch error:', err.message);
  }
}

testBackend().catch(console.error);
