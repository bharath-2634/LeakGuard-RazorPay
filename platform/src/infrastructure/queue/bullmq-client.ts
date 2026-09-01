import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { prisma } from '../db/prisma-client.js';

const BULLMQ_REDIS_URL =
  process.env.BULLMQ_REDIS_URL ||
  'rediss://default:gQAAAAAAA0b9AAIgcDE3ODA4MGE2ZTI0ZjU0ZDc4OTk0MWI4NGViYTM3ZmNiNQ@together-octopus-214781.upstash.io:6379';

// Configure ioredis for Upstash TLS connection
export const bullmqRedisClient = new Redis(BULLMQ_REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: { rejectUnauthorized: false },
});

export const QUEUE_NAME = 'risk-validation';

// BullMQ Queue instance
export const riskEventQueue = new Queue(QUEUE_NAME, {
  connection: bullmqRedisClient,
});

// BullMQ Worker processing Fat Event Payloads
export const riskEventWorker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    console.log(`\n================================================================================`);
    console.log(`⚡ [BULLMQ WORKER] CONSUMED FAT EVENT JOB #${job.id}`);
    console.log(`📌 Queue Name:       ${job.queueName}`);
    console.log(`📌 Job Name:        ${job.name}`);
    console.log(`📌 Enqueued At:     ${new Date(job.timestamp).toISOString()}`);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`🔥 FULL FAT PAYLOAD RECEIVED (Zero Database Queries Performed):`);
    console.log(JSON.stringify(job.data, null, 2));
    console.log(`================================================================================\n`);
  },
  {
    connection: bullmqRedisClient,
  }
);

riskEventWorker.on('completed', (job) => {
  console.log(`✅ [BULLMQ WORKER] Successfully processed Risk Event Job #${job.id}`);
});

riskEventWorker.on('failed', (job, err) => {
  console.error(`❌ [BULLMQ WORKER ERROR] Job #${job?.id} failed:`, err.message);
});

// Transactional Outbox Publisher / Relay
export const OutboxPublisher = {
  /**
   * Relay all PENDING outbox events from Neon DB to BullMQ Queue on Upstash Redis
   */
  async relayPendingEvents(): Promise<number> {
    if (!process.env.DATABASE_URL) {
      console.log('ℹ️ [OUTBOX RELAY] In-memory mode active; bypassing Neon outbox polling.');
      return 0;
    }

    try {
      const pendingEvents = await prisma.outboxEvent.findMany({
        where: { status: 'PENDING' },
        take: 10,
        orderBy: { createdAt: 'asc' },
      });

      if (pendingEvents.length === 0) return 0;

      console.log(`🚀 [OUTBOX RELAY] Found ${pendingEvents.length} PENDING outbox event(s) to publish to BullMQ...`);

      for (const event of pendingEvents) {
        try {
          // Minimize payload for Validation Worker
          const minimizedPayload = {
            riskEventId: event.aggregateId,
            paymentAttemptId: (event.payload as any).paymentAttempt?.id || (event.payload as any).paymentAttemptId,
            merchantId: (event.payload as any).merchant?.id || (event.payload as any).merchantId,
            merchantOrderId: (event.payload as any).paymentAttempt?.merchantOrderId || (event.payload as any).merchantOrderId
          };

          // Publish Minimized Payload into BullMQ Queue
          await riskEventQueue.add(event.eventType, minimizedPayload, {
            jobId: event.id, // Idempotent Job ID matching DB Outbox Event ID
            removeOnComplete: true,
          });

          // Mark Outbox Event as PROCESSED in Neon DB
          await prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'PROCESSED',
              processedAt: new Date(),
            },
          });

          console.log(`✅ [OUTBOX RELAY] Published Outbox Event #${event.id} to BullMQ Queue '${QUEUE_NAME}' & marked PROCESSED in Neon DB.`);
        } catch (pubErr: any) {
          console.error(`⚠️ [OUTBOX RELAY ERROR] Failed to publish outbox event #${event.id}:`, pubErr.message);
          await prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              attempts: event.attempts + 1,
              lastError: pubErr.message,
              ...(event.attempts >= 3 && { status: 'FAILED' }),
            },
          });
        }
      }

      return pendingEvents.length;
    } catch (err: any) {
      console.error('⚠️ [OUTBOX RELAY POLLING ERROR]:', err.message);
      return 0;
    }
  },
};
