import { Queue } from 'bullmq';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { config } from '../../config/env.js';

export const EXECUTION_QUEUE_NAME = 'risk-execution';
const redis = new Redis(config.INTERVENTION_REDIS_URL, {
  maxRetriesPerRequest: null,
  ...(config.INTERVENTION_REDIS_URL.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
});
export const riskExecutionQueue = new Queue(EXECUTION_QUEUE_NAME, { connection: redis });

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
    })
  : null;
let unavailableUntil = 0;

export async function relayExecutionOutbox(): Promise<number> {
  if (!pool || Date.now() < unavailableUntil) return 0;
  let client;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailableUntil = Date.now() + 30000;
    console.warn('[Execution Outbox Relay] Database unavailable; retrying in 30 seconds.');
    return 0;
  }
  let count = 0;
  try {
    const pending = await client.query(
      `SELECT "id", "event_type", "payload", "attempts"
       FROM "outbox_events"
       WHERE "status" = 'PENDING' AND "event_type" = 'RECOVERY_EXECUTION_REQUEST'
       ORDER BY "created_at" ASC LIMIT 50`
    );

    for (const event of pending.rows) {
      try {
        await riskExecutionQueue.add(event.event_type, event.payload, {
          jobId: event.id,
          removeOnComplete: true,
        });
        await client.query(
          `UPDATE "outbox_events" SET "status" = 'PROCESSED', "processed_at" = NOW()
           WHERE "id" = $1 AND "status" = 'PENDING'`,
          [event.id]
        );
        count += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await client.query(
          `UPDATE "outbox_events"
           SET "attempts" = "attempts" + 1, "last_error" = $2,
               "status" = CASE WHEN "attempts" >= 3 THEN 'FAILED' ELSE "status" END
           WHERE "id" = $1`,
          [event.id, message]
        );
      }
    }
    return count;
  } finally {
    client.release();
  }
}

export async function closeExecutionOutboxRelay(): Promise<void> {
  await pool?.end();
  await redis.quit();
}
