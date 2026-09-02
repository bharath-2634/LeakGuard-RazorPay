import { prisma } from '../src/infrastructure/db/prisma-client.js';

async function checkRiskEvent() {
  const events = await prisma.riskEvent.findMany({ orderBy: { emittedAt: 'desc' }, take: 3 });
  console.log(JSON.stringify(events.map(e => ({ id: e.id, status: e.processingStatus, attempts: e.attemptCount })), null, 2));
  process.exit(0);
}
checkRiskEvent().catch(console.error);
