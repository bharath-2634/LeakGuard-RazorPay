import { prisma } from '../src/infrastructure/db/prisma-client.js';

async function query() {
  const ev = await prisma.outboxEvent.findFirst({ orderBy: { createdAt: 'desc' } });
  console.log('LATEST OUTBOX PAYLOAD:');
  console.log(JSON.stringify(ev?.payload, null, 2));
  process.exit(0);
}
query();
