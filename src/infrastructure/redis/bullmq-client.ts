import { Redis } from 'ioredis';
import { config } from '../../config/env.js';

// Configure ioredis for Upstash TLS connection
export const bullmqRedisClient = new Redis(config.BULLMQ_REDIS_URL, {
  maxRetriesPerRequest: null,
  ...(config.BULLMQ_REDIS_URL.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {})
});

export const QUEUE_NAME = 'risk-validation';
