import { prisma } from '../src/infrastructure/db/prisma-client.js';

async function checkValidationResult() {
  const result = await prisma.validationResult.findFirst({
    where: { paymentAttemptId: 'pa_e2e_01' }
  });
  
  if (result) {
    console.log('✅ Integration Test Succeeded! Found ValidationResult in DB:');
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('❌ ValidationResult not found for pa_e2e_01. Checking OutboxEvents...');
    const outbox = await prisma.outboxEvent.findMany({ where: { aggregateId: 'risk_e2e_01' } });
    console.log(outbox);
  }
}
checkValidationResult().catch(console.error).finally(() => process.exit(0));
