import { PrismaClient } from '@prisma/client';

async function main() {
  const url = 'postgresql://neondb_owner:npg_yzMGPcU9O8Nr@ep-orange-cell-axyxwxyj-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=15';
  console.log('Testing Neon Pooler with pgbouncer=true...');

  const prismaClient = new PrismaClient({
    datasources: {
      db: { url },
    },
  });

  try {
    await prismaClient.$connect();
    console.log('✅ Connected successfully to Neon Pooler!');

    const merchantCount = await prismaClient.merchant.count();
    console.log('Merchant Count in Neon DB:', merchantCount);

    const created = await prismaClient.merchant.create({
      data: {
        id: `m_pgb_${Date.now()}`,
        name: 'PgBouncer Test Store',
        domain: 'pgbstore.com',
        environment: 'production',
        defaultCurrency: 'INR',
        timezone: 'Asia/Kolkata',
        razorpayKeyId: 'rzp_test_pgb',
        razorpaySecretRef: 'encrypted_pgb',
      },
    });

    console.log('✅ Created Merchant Record via PgBouncer Pooler:', created.id);

    const allMerchants = await prismaClient.merchant.findMany();
    console.log('🎉 Total Merchants in Neon DB:', allMerchants.length, allMerchants);
  } catch (err: any) {
    console.error('❌ Connection error:', err.message);
  } finally {
    await prismaClient.$disconnect();
  }
}

main().catch(console.error);
