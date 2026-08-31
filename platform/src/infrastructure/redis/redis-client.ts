import { Redis } from 'ioredis';
import { config } from '../../config/env.js';

export interface HotPaymentState {
  paymentAttemptId: string;
  merchantId: string;
  merchantOrderId: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  providerState: string; // CREATED, AUTHORIZED, CAPTURED, FAILED
  businessState: string; // UNRESOLVED, RESOLVED
  revenueObligationResolved: boolean;
  lastEvent?: string;
  lastEventAt?: string;
  expiresAt: string;
  version: number;
}

// In-memory fallback map if Redis service is unreachable (e.g. unit testing environment)
const inMemoryFallback = new Map<string, HotPaymentState>();
let redisInstance: Redis | null = null;
let redisConnected = false;

try {
  const isTls = config.redisUrl.startsWith('rediss://') || config.redisUrl.includes('upstash.io');
  redisInstance = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    tls: isTls ? { rejectUnauthorized: false } : undefined,
    retryStrategy(times) {
      if (times > 5) return null;
      return Math.min(times * 100, 1000);
    },
    lazyConnect: true,
  });

  redisInstance.on('connect', () => {
    redisConnected = true;
    console.log('⚡ [REDIS] Successfully connected to Upstash Cloud Redis!');
  });

  redisInstance.on('ready', () => {
    redisConnected = true;
  });

  redisInstance.on('error', (err) => {
    console.warn('⚠️ [REDIS WARNING]', err.message);
  });

  redisInstance.connect().then(() => {
    redisConnected = true;
  }).catch(() => {
    redisConnected = false;
  });
} catch (e) {
  redisConnected = false;
}

export const redis = redisInstance;

export async function getHotPaymentState(paymentAttemptId: string): Promise<HotPaymentState | null> {
  const key = `payment_attempt:${paymentAttemptId}`;
  if (redisConnected && redisInstance) {
    try {
      const data = await redisInstance.hgetall(key);
      if (data && Object.keys(data).length > 0) {
        return {
          paymentAttemptId: data.paymentAttemptId,
          merchantId: data.merchantId,
          merchantOrderId: data.merchantOrderId,
          razorpayOrderId: data.razorpayOrderId || undefined,
          razorpayPaymentId: data.razorpayPaymentId || undefined,
          providerState: data.providerState,
          businessState: data.businessState,
          revenueObligationResolved: data.revenueObligationResolved === 'true',
          lastEvent: data.lastEvent || undefined,
          lastEventAt: data.lastEventAt || undefined,
          expiresAt: data.expiresAt,
          version: parseInt(data.version || '1', 10),
        };
      }
    } catch (e) {
      // Fall through to memory
    }
  }
  return inMemoryFallback.get(paymentAttemptId) || null;
}

export async function setHotPaymentState(state: HotPaymentState, ttlSeconds: number = config.defaultSessionTtlSeconds): Promise<void> {
  const key = `payment_attempt:${state.paymentAttemptId}`;
  inMemoryFallback.set(state.paymentAttemptId, { ...state });

  if (redisConnected && redisInstance) {
    try {
      const payload: Record<string, string> = {
        paymentAttemptId: state.paymentAttemptId,
        merchantId: state.merchantId,
        merchantOrderId: state.merchantOrderId,
        providerState: state.providerState,
        businessState: state.businessState,
        revenueObligationResolved: String(state.revenueObligationResolved),
        expiresAt: state.expiresAt,
        version: String(state.version),
      };
      if (state.razorpayOrderId) payload.razorpayOrderId = state.razorpayOrderId;
      if (state.razorpayPaymentId) payload.razorpayPaymentId = state.razorpayPaymentId;
      if (state.lastEvent) payload.lastEvent = state.lastEvent;
      if (state.lastEventAt) payload.lastEventAt = state.lastEventAt;

      await redisInstance.hset(key, payload);
      await redisInstance.expire(key, ttlSeconds);
    } catch (e) {
      // Memory fallback updated already
    }
  }
}

export async function updateHotPaymentState(
  paymentAttemptId: string,
  updates: Partial<HotPaymentState>
): Promise<HotPaymentState | null> {
  const current = await getHotPaymentState(paymentAttemptId);
  if (!current) return null;

  const updated: HotPaymentState = {
    ...current,
    ...updates,
    version: current.version + 1,
  };

  await setHotPaymentState(updated);
  return updated;
}
