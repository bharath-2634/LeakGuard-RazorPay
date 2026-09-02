import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '../infrastructure/db/prisma-client.js';
import { config } from '../config/env.js';

// Connection to the new Upstash Redis for Intervention module
export const interventionRedisClient = new Redis(config.INTERVENTION_REDIS_URL, {
  maxRetriesPerRequest: null,
  ...(config.INTERVENTION_REDIS_URL.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {})
});

export const INTERVENTION_QUEUE_NAME = 'risk-intervention';

// BullMQ Queue instance for Risk Intervention
export const riskInterventionQueue = new Queue(INTERVENTION_QUEUE_NAME, {
  connection: interventionRedisClient,
});

export const OutboxRelay = {
  /**
   * Polls Neon DB for PENDING outbox events and pushes them to the risk-intervention queue.
   */
  async relayPendingEvents(): Promise<number> {
    try {
      const pendingEvents = await prisma.outboxEvent.findMany({
        where: { status: 'PENDING', eventType: 'VALIDATION_COMPLETED' },
        take: 50,
        orderBy: { createdAt: 'asc' },
      });

      if (pendingEvents.length === 0) return 0;

      console.log(`[Validation Outbox Relay] Found ${pendingEvents.length} PENDING outbox events.`);

      let processedCount = 0;
      for (const event of pendingEvents) {
        try {
          // The payload is already FAT and self-contained
          await riskInterventionQueue.add('START_INTERVENTION', event.payload, {
            jobId: event.id, // Idempotency
            removeOnComplete: true,
          });

          await prisma.outboxEvent.update({
            where: { id: event.id },
            data: { status: 'PROCESSED', processedAt: new Date() },
          });

          processedCount++;
          console.log(`✅ [Validation Outbox Relay] Published Outbox Event #${event.id} to '${INTERVENTION_QUEUE_NAME}'.`);
        } catch (pubErr: any) {
          console.error(`⚠️ [Validation Outbox Relay] Failed to publish event #${event.id}:`, pubErr.message);
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

      return processedCount;
    } catch (err: any) {
      console.error('⚠️ [Validation Outbox Relay Error]:', err.message);
      return 0;
    }
  },
};
