async function main() {
  console.log('Fetching https://leakguard-razorpay-production.up.railway.app/v1/db-status...');
  const res = await fetch('https://leakguard-razorpay-production.up.railway.app/v1/db-status');
  const data = await res.json();
  console.log('Response Status:', res.status);
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
