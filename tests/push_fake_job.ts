import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../src/config/env.js';

async function pushFakeJob() {
  const client = new Redis(config.BULLMQ_REDIS_URL, { tls: { rejectUnauthorized: false } });
  const q = new Queue('risk-validation', { connection: client });
  
  const job = await q.add('PAYMENT_FAILURE_RISK', {
    merchantId: 'live_e2e_1788339384405',
    riskEventId: 'f64e6acf-37c5-4923-8672-41a90eae5296',
    eventVersion: 1,
    merchantOrderId: 'order_1788339387683',
    paymentAttemptId: 'pa_2f0b5d5d2f67458a'
  }, {
    jobId: 'fake_test_job_123',
    removeOnComplete: false
  });
  
  console.log(`Pushed fake job ${job.id}`);
  process.exit(0);
}

pushFakeJob().catch(console.error);
