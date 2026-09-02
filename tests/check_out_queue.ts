import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../src/config/env.js';

async function checkQueue() {
  const client = new Redis(config.INTERVENTION_REDIS_URL, { tls: { rejectUnauthorized: false } });
  const q = new Queue('risk-intervention', { connection: client });
  
  const waiting = await q.getWaitingCount();
  const active = await q.getActiveCount();
  const completed = await q.getCompletedCount();
  
  console.log(`risk-intervention queue stats: Waiting=${waiting}, Active=${active}, Completed=${completed}`);
  
  process.exit(0);
}

checkQueue().catch(console.error);
