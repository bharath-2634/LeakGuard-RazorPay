import { prisma } from './src/infrastructure/db/prisma-client';

async function main() {
  console.log('Writing directly to Neon PostgreSQL using Prisma...');
  const testId = `m_direct_neon_${Date.now()}`;
  const res = await prisma.merchant.create({
    data: {
      id: testId,
      name: 'Direct Neon Test Store',
      domain: 'directstore.com',
      environment: 'production',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      razorpayKeyId: 'rzp_test_direct',
      razorpaySecretRef: 'encrypted_ref_123',
      economics: {
        create: {
          defaultMarginRate: 0.20,
          categoryEconomics: { electrical: { margin_rate: 0.20 } },
        },
      },
    },
    include: { economics: true },
  });

  console.log('✅ Created Merchant Record in Neon PostgreSQL:');
  console.log(JSON.stringify(res, null, 2));

  const all = await prisma.merchant.findMany({ include: { economics: true } });
  console.log(`\n🎉 Total Merchants Query from Neon DB (${all.length}):`);
  console.log(JSON.stringify(all, null, 2));
}

main().catch(console.error);
