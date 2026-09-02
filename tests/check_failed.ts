import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../src/config/env.js';

async function checkFailed() {
  const client = new Redis(config.BULLMQ_REDIS_URL, { tls: { rejectUnauthorized: false } });
  const q = new Queue('risk-validation', { connection: client });
  
  const failedJobs = await q.getFailed(0, 50);
  for (const job of failedJobs) {
    console.log(`Job ${job.id} failed with reason:`, job.failedReason);
  }
  
  process.exit(0);
}

checkFailed().catch(console.error);
