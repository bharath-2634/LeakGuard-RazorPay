import { Worker } from 'bullmq';
import { bullmqRedisClient, QUEUE_NAME } from '../src/infrastructure/redis/bullmq-client.js';
import { prisma } from '../src/infrastructure/db/prisma-client.js';

const w = new Worker(QUEUE_NAME, async (job) => {
  console.log(`[LOCAL WORKER] Processing job ${job.id} with data:`, job.data);
  const { riskEventId } = job.data;
  const claimedEvent = await prisma.riskEvent.updateMany({
    where: {
      id: riskEventId,
      OR: [
        { processingStatus: 'PENDING' },
        { processingStatus: 'PROCESSING', processingLeaseUntil: { lt: new Date() } }
      ]
    },
    data: {
      processingStatus: 'PROCESSING',
      attemptCount: { increment: 1 }
    }
  });
  console.log(`[LOCAL WORKER] claimedEvent.count: ${claimedEvent.count}`);
  if (claimedEvent.count === 0) {
    const ev = await prisma.riskEvent.findUnique({ where: { id: riskEventId } });
    console.log(`[LOCAL WORKER] Current DB state for ${riskEventId}:`, ev);
  }
}, { connection: bullmqRedisClient });

console.log('Local worker started...');
