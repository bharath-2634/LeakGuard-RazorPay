import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../src/config/env.js';

async function checkQueue() {
  const client = new Redis(config.BULLMQ_REDIS_URL, { tls: { rejectUnauthorized: false } });
  const q = new Queue('risk-validation', { connection: client });
  
  const waiting = await q.getWaitingCount();
  const active = await q.getActiveCount();
  const completed = await q.getCompletedCount();
  const failed = await q.getFailedCount();
  
  console.log(`risk-validation queue stats: Waiting=${waiting}, Active=${active}, Completed=${completed}, Failed=${failed}`);
  
  process.exit(0);
}

checkQueue().catch(console.error);
