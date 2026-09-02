import { prisma } from '../src/infrastructure/db/prisma-client.js';

async function check() {
  const events = await prisma.outboxEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
  console.log('Outbox Events:');
  console.log(JSON.stringify(events.map(e => ({ id: e.id, type: e.eventType, status: e.status })), null, 2));

  const validation = await prisma.validationResult.findMany({ orderBy: { createdAt: 'desc' }, take: 3 });
  console.log('Validation Results:');
  console.log(JSON.stringify(validation, null, 2));
  
  process.exit(0);
}
check();
