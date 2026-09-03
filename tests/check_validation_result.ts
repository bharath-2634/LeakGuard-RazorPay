import { prisma } from '../src/infrastructure/db/prisma-client.js';

async function check() {
  const lastResult = await prisma.validationResult.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  console.log('LAST VALIDATION RESULT:', JSON.stringify(lastResult, null, 2));

  const lastEvent = await prisma.riskEvent.findFirst({
    orderBy: { emittedAt: 'desc' }
  });
  console.log('LAST RISK EVENT:', JSON.stringify(lastEvent, null, 2));

  await prisma.$disconnect();
}

check();
