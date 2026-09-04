import { Job, Worker } from 'bullmq';
import { config } from '../config/env.js';
import { Redis } from 'ioredis';
import { executeRecovery } from './execution.service.js';
import { parseExecutionRequest } from './types/execution.types.js';

export const EXECUTION_QUEUE_NAME = 'risk-execution';

export function startExecutionWorker(queueName = EXECUTION_QUEUE_NAME): Worker {
  const connection = new Redis(config.INTERVENTION_REDIS_URL, { maxRetriesPerRequest: null, ...(config.INTERVENTION_REDIS_URL.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}) });
  const worker = new Worker(queueName, async (job: Job) => {
    console.log(`[Execution Worker] Received job ${job.id}`);
    const result = await executeRecovery(parseExecutionRequest(job.data));
    console.log(`[Execution Worker] ${job.id}: ${result.status} (${result.interventionType})`);
    return result;
  }, { connection });
  worker.on('failed', (job, error) => console.error(`[Execution Worker] Job ${job?.id} failed:`, error.message));
  return worker;
}
