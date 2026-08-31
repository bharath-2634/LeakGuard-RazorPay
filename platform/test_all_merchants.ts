import { prisma } from './src/infrastructure/db/prisma-client';

async function main() {
  const merchants = await prisma.merchant.findMany({ include: { economics: true } });
  console.log('Total Merchants in Neon DB:', merchants.length);
  console.log(JSON.stringify(merchants, null, 2));
}

main().catch(console.error);
