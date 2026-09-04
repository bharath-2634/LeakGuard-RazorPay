import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../../config/env.js';
import { OutcomeRepository } from '../persistence/outcome.repository.js';
import { ResolutionMonitor } from '../resolution/resolution-monitor.js';

export const OUTCOME_WINDOWS: Record<string, number> = {
  SEND_WHATSAPP: 30 * 60, // 30 mins
  SEND_SMS: 30 * 60,      // 30 mins
  SEND_EMAIL: 60 * 60,    // 60 mins
  SEND_PAYMENT_LINK: 60 * 60, // 60 mins
  CHANGE_PAYMENT_METHOD_PROMPT: 15 * 60, // 15 mins
  HUMAN_REVIEW: 120 * 60, // 2 hours
};

const DEFAULT_WINDOW_SECONDS = 30 * 60;

let outcomeDelayedQueue: Queue | null = null;

export function getOutcomeDelayedQueue(): Queue {
  if (!outcomeDelayedQueue) {
    const redis = new Redis(config.INTERVENTION_REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      enableOfflineQueue: false,
      retryStrategy: () => null, // Do not reconnect infinitely if offline
      ...(config.INTERVENTION_REDIS_URL.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
    });
    redis.on('error', (err) => {
      console.warn('[OutcomeMeasurer] Redis connection notice:', err.message);
    });
    outcomeDelayedQueue = new Queue('outcome-delayed-measure-queue', { connection: redis as any });
  }
  return outcomeDelayedQueue;
}

export class OutcomeMeasurer {
  constructor(
    private repository: OutcomeRepository = new OutcomeRepository(),
    private resolutionMonitor: ResolutionMonitor = new ResolutionMonitor(repository)
  ) {}

  getMeasurementWindowSeconds(interventionType: string): number {
    return OUTCOME_WINDOWS[interventionType] || DEFAULT_WINDOW_SECONDS;
  }

  async scheduleDelayedOutcomeCheck(payload: {
    merchantId: string;
    paymentAttemptId: string;
    riskEventId?: string;
    executionId: string;
    interventionType: string;
    correlationId: string;
    delaySeconds?: number;
  }) {
    const delayMs = (payload.delaySeconds ?? this.getMeasurementWindowSeconds(payload.interventionType)) * 1000;
    const jobId = `delayed_outcome_${payload.executionId}`;

    try {
      const queue = getOutcomeDelayedQueue();
      await queue.add(
        'CHECK_OUTCOME_WINDOW_EXPIRED',
        payload,
        {
          delay: Math.min(delayMs, 5000),
          jobId,
          removeOnComplete: true,
        }
      );
    } catch (err: any) {
      console.warn('[OutcomeMeasurer] Redis queue scheduling skipped:', err.message);
    }
  }

  async evaluateOutcomeNow(data: {
    merchantId: string;
    paymentAttemptId: string;
    riskEventId?: string;
    executionId: string;
    interventionType: string;
    executionStatus: string;
    merchantOrderId?: string;
    correlationId: string;
  }) {
    // 1. Check authoritative RevenueObligation
    let res = data.merchantOrderId
      ? await this.resolutionMonitor.checkResolution(data.merchantId, data.merchantOrderId)
      : await this.resolutionMonitor.checkResolutionByAttempt(data.paymentAttemptId);

    if (res.status === 'RESOLVED') {
      const outcome = await this.repository.upsertRecoveryOutcome({
        merchantId: data.merchantId,
        paymentAttemptId: data.paymentAttemptId,
        riskEventId: data.riskEventId,
        executionId: data.executionId,
        interventionType: data.interventionType,
        executionStatus: data.executionStatus,
        outcomeStatus: 'RECOVERED',
        resolutionStatus: 'RESOLVED',
        recoveryAmount: res.recoveryAmount,
        recoveryCurrency: res.recoveryCurrency,
        resolutionSource: res.resolutionSource || 'PAYMENT_SUCCESS',
      });
      return { outcomeStatus: 'RECOVERED', outcome };
    }

    // 2. If unresolved, record as PENDING and schedule delayed check
    const outcome = await this.repository.upsertRecoveryOutcome({
      merchantId: data.merchantId,
      paymentAttemptId: data.paymentAttemptId,
      riskEventId: data.riskEventId,
      executionId: data.executionId,
      interventionType: data.interventionType,
      executionStatus: data.executionStatus,
      outcomeStatus: 'PENDING',
      resolutionStatus: 'UNRESOLVED',
    });

    await this.scheduleDelayedOutcomeCheck({
      merchantId: data.merchantId,
      paymentAttemptId: data.paymentAttemptId,
      riskEventId: data.riskEventId,
      executionId: data.executionId,
      interventionType: data.interventionType,
      correlationId: data.correlationId,
    });

    return { outcomeStatus: 'PENDING', outcome };
  }
}
