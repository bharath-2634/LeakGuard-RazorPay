import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../src/config/env.js';

async function retryFailed() {
  const client = new Redis(config.BULLMQ_REDIS_URL, { tls: { rejectUnauthorized: false } });
  const q = new Queue('risk-validation', { connection: client });
  
  const failedJobs = await q.getFailed(0, 10);
  for (const job of failedJobs) {
    console.log(`Retrying Job ${job.id} (failed with: ${job.failedReason})...`);
    await job.retry();
  }
  
  console.log('Retry triggered for failed jobs.');
  process.exit(0);
}

retryFailed().catch(console.error);
