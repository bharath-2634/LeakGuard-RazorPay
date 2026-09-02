import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../src/config/env.js';

async function checkAllJobs() {
  const client = new Redis(config.BULLMQ_REDIS_URL, { tls: { rejectUnauthorized: false } });
  const q = new Queue('risk-validation', { connection: client });
  
  console.log('--- COMPLETED JOBS ---');
  const completed = await q.getCompleted(0, 10);
  for (const job of completed) {
    console.log(`[COMPLETED] Job ID: ${job.id}, Data: ${JSON.stringify(job.data)}`);
  }

  console.log('--- FAILED JOBS ---');
  const failed = await q.getFailed(0, 10);
  for (const job of failed) {
    console.log(`[FAILED] Job ID: ${job.id}, Data: ${JSON.stringify(job.data)}, Reason: ${job.failedReason}`);
  }
  
  process.exit(0);
}

checkAllJobs().catch(console.error);
