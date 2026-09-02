import Redis from 'ioredis';
import { config } from '../src/config/env.js';

async function checkRedis() {
  const client = new Redis(config.BULLMQ_REDIS_URL, { tls: { rejectUnauthorized: false } });
  const keys = await client.keys('bull:risk-validation:*fake*');
  console.log('Fake keys:', keys);
  
  if (keys.length > 0) {
    const jobData = await client.hgetall(keys[0]);
    console.log('Fake job data:', jobData);
  }
  
  process.exit(0);
}
checkRedis();
