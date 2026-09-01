import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../src/config/env.js';

async function publishTestJob() {
  console.log('Connecting to Upstash Redis...');
  const redis = new Redis(config.BULLMQ_REDIS_URL, { tls: { rejectUnauthorized: false } });
  const queue = new Queue('risk-validation', { connection: redis });

  console.log('Publishing test job to risk-validation queue...');
  
  // We send a minimal payload just like the SDK Outbox Relay does
  const job = await queue.add('VALIDATE_RISK', {
    riskEventId: 'risk_test_live_01',
    paymentAttemptId: 'pa_test_val_01', // Re-using the seeded DB record from the independent test
    merchantId: 'm_test_validation_01',
    merchantOrderId: 'order_test_val_01'
  });

  console.log(`✅ Successfully published Job ID: ${job.id}`);
  console.log('Now check the terminal where `npm start` is running!');
  process.exit(0);
}

publishTestJob().catch(console.error);
