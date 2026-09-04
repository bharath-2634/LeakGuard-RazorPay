import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config/env.js';
import { OutcomeService } from './outcome.service.js';
import { ExecutionEventPayload } from './types/outcome.types.js';

const redis = new Redis(config.INTERVENTION_REDIS_URL, {
  maxRetriesPerRequest: null,
  ...(config.INTERVENTION_REDIS_URL.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
});

const outcomeService = new OutcomeService();

export function startOutcomeWorker(): { mainWorker: Worker; delayedWorker: Worker } {
  const mainWorker = new Worker(
    config.OUTCOME_QUEUE_NAME,
    async (job: Job<ExecutionEventPayload>) => {
      console.log(`[OutcomeWorker] Processing event ${job.name} (Job ID: ${job.id})`);
      try {
        const result = await outcomeService.processExecutionEvent(job.data);
        console.log(`[OutcomeWorker] Event ${job.id} processed successfully:`, result.outcomeStatus);
        return result;
      } catch (err: any) {
        console.error(`[OutcomeWorker] Error processing event ${job.id}:`, err.message);
        throw err;
      }
    },
    { connection: redis, concurrency: 5 }
  );

  const delayedWorker = new Worker(
    'outcome-delayed-measure-queue',
    async (job: Job<any>) => {
      console.log(`[OutcomeWorker Delayed] Processing job ${job.name} (Job ID: ${job.id})`);
      try {
        const result = await outcomeService.processExpiredMeasurementWindow(job.data);
        console.log(`[OutcomeWorker Delayed] Job ${job.id} outcome evaluate result:`, result.outcomeStatus);
        return result;
      } catch (err: any) {
        console.error(`[OutcomeWorker Delayed] Error evaluating delayed outcome ${job.id}:`, err.message);
        throw err;
      }
    },
    { connection: redis, concurrency: 5 }
  );

  console.log(`[OutcomeWorker] Listening on queue '${config.OUTCOME_QUEUE_NAME}' and 'outcome-delayed-measure-queue'`);

  return { mainWorker, delayedWorker };
}
