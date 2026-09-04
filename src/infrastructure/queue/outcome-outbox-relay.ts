import { Queue } from 'bullmq';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { config } from '../../config/env.js';

export const OUTCOME_QUEUE_NAME = config.OUTCOME_QUEUE_NAME;
const redis = new Redis(config.INTERVENTION_REDIS_URL, { maxRetriesPerRequest: null, ...(config.INTERVENTION_REDIS_URL.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}) });
export const outcomeQueue = new Queue(OUTCOME_QUEUE_NAME, { connection: redis });
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : undefined }) : null;
let unavailableUntil = 0;

export async function relayOutcomeOutbox(): Promise<number> {
  if (!pool || Date.now() < unavailableUntil) return 0;
  let client;
  try { client = await pool.connect(); } catch { unavailableUntil = Date.now() + 30000; return 0; }
  try {
    const pending = await client.query(`SELECT "id", "event_type", "payload" FROM "outbox_events" WHERE "status" = 'PENDING' AND "event_type" IN ('EXECUTION_COMPLETED', 'EXECUTION_FAILED', 'EXECUTION_BLOCKED') ORDER BY "created_at" ASC LIMIT 50`);
    let count = 0;
    for (const event of pending.rows) {
      await outcomeQueue.add(event.event_type, event.payload, { jobId: event.id, removeOnComplete: true });
      await client.query(`UPDATE "outbox_events" SET "status" = 'PROCESSED', "processed_at" = NOW() WHERE "id" = $1 AND "status" = 'PENDING'`, [event.id]);
      count += 1;
    }
    return count;
  } finally { client.release(); }
}

export async function closeOutcomeRelay(): Promise<void> { await pool?.end(); await redis.quit(); }
