import { Worker, Job } from 'bullmq';
import { bullmqRedisClient, QUEUE_NAME } from '../infrastructure/redis/bullmq-client.js';
import { prisma } from '../infrastructure/db/prisma-client.js';
import { loadValidationData } from '../infrastructure/db/context-repository.js';
import { runDiagnosis } from '../domain/diagnosis-engine.js';
import { determineActionability } from '../domain/actionability-engine.js';
import { determinePriority } from '../domain/priority-engine.js';
import { calculateEconomics } from '../domain/economic-engine.js';
import { config } from '../config/env.js';

export const validationWorker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    const { riskEventId, paymentAttemptId, merchantId, merchantOrderId } = job.data;
    
    if (!riskEventId || !paymentAttemptId || !merchantId || !merchantOrderId) {
      throw new Error(`Invalid job payload for job ${job.id}`);
    }

    // --- PHASE 3: Processing Guard (Atomic Claim) ---
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + config.VALIDATION_PROCESSING_LEASE_MS);
    
    const claimedEvent = await prisma.riskEvent.updateMany({
      where: {
        id: riskEventId,
        OR: [
          { processingStatus: 'PENDING' },
          { processingStatus: 'PROCESSING', processingLeaseUntil: { lt: now } }
        ]
      },
      data: {
        processingStatus: 'PROCESSING',
        processingLeaseUntil: leaseUntil,
        attemptCount: { increment: 1 },
        validationStartedAt: now
      }
    });

    if (claimedEvent.count === 0) {
      console.log(`[Validation Worker] Job ${job.id}: Event ${riskEventId} already processed or lease active. Stopping.`);
      return; // Business STOP or another worker is processing.
    }

    // --- PHASE 3: Initial Resolution Guard ---
    const initialObligation = await prisma.revenueObligation.findUnique({
      where: {
        merchantId_merchantOrderId: { merchantId, merchantOrderId }
      },
      select: { status: true }
    });

    if (initialObligation?.status === 'RESOLVED') {
      await prisma.riskEvent.update({
        where: { id: riskEventId },
        data: { processingStatus: 'STOPPED', validationCompletedAt: new Date() }
      });
      console.log(`[Validation Worker] Job ${job.id}: Event ${riskEventId} already RESOLVED before processing.`);
      return; 
    }

    // --- PHASE 2: Load Context ---
    const context = await loadValidationData({ riskEventId, paymentAttemptId, merchantId, merchantOrderId });

    // --- PHASE 4: Core Domain Engines ---
    const diagnosis = runDiagnosis(context.event);
    const actionability = determineActionability(diagnosis, context.event);
    const priority = determinePriority(diagnosis);
    
    let decision: 'PROCEED' | 'STOP' = 'PROCEED';
    let stopReason: string | undefined;

    if (actionability.status === 'INSUFFICIENT' || actionability.status === 'UNCERTAIN') {
      decision = 'STOP';
      stopReason = 'ACTIONABILITY_INSUFFICIENT';
    }

    let economics;
    if (decision === 'PROCEED') {
      economics = calculateEconomics(context.event, context.merchant, diagnosis);
      if (economics.decision === 'STOP') {
        decision = 'STOP';
        stopReason = economics.stopReason;
      }
    } else {
      economics = calculateEconomics(context.event, context.merchant, diagnosis);
    }

    await executeFinalTransaction({
      riskEventId,
      paymentAttemptId,
      merchantId,
      merchantOrderId,
      decision,
      stopReason,
      diagnosis,
      actionability,
      priority,
      economics,
      context
    });
  },
  { connection: bullmqRedisClient }
);

async function executeFinalTransaction(data: any) {
  const { riskEventId, paymentAttemptId, merchantId, merchantOrderId, diagnosis, actionability, priority, economics, context } = data;
  let { decision, stopReason } = data;

  await prisma.$transaction(async (tx) => {
    // 1. Final Resolution Guard with Row Lock
    const obligations = await tx.$queryRaw<any[]>`
      SELECT status FROM revenue_obligations
      WHERE "merchantId" = ${merchantId} AND "merchantOrderId" = ${merchantOrderId}
      FOR UPDATE
    `;
    
    if (obligations.length > 0 && obligations[0].status === 'RESOLVED') {
      decision = 'STOP';
      stopReason = 'ALREADY_RESOLVED';
    }

    // 2. Persist ValidationResult (Idempotent)
    let validationResult = await tx.validationResult.findUnique({
      where: { riskEventId }
    });

    if (!validationResult) {
      validationResult = await tx.validationResult.create({
        data: {
          riskEventId,
          paymentAttemptId,
          merchantId,
          diagnosedCause: diagnosis.diagnosedCause,
          diagnosisConfidence: diagnosis.confidence,
          evidence: diagnosis.evidence,
          actionabilityScore: actionability.score,
          actionabilityStatus: actionability.status,
          priority: priority,
          revenueAtRisk: economics.revenueAtRisk,
          economicFactor: economics.economicFactor,
          recoveryProbability: economics.recoveryProbability,
          recoveryCost: economics.recoveryCost,
          expectedRecoveryValue: economics.expectedRecoveryValue,
          netExpectedRecovery: economics.netExpectedRecovery,
          decision,
          stopReason,
          rulesVersion: 'v1.0.0'
        }
      });
    }

    // 3. Update RiskEvent Status
    await tx.riskEvent.update({
      where: { id: riskEventId },
      data: {
        processingStatus: decision === 'PROCEED' ? 'COMPLETED' : 'STOPPED',
        validationCompletedAt: new Date()
      }
    });

    // 4. Emit Outbox Event (if PROCEED)
    if (decision === 'PROCEED') {
      const recoveryContext = {
        metadata: {
          recoveryContextVersion: 'v1',
          validationResultId: validationResult.id,
          correlationId: riskEventId,
          riskEventVersion: 1,
          validationRulesVersion: 'v1'
        },
        event: {
          riskEventId,
          paymentAttemptId,
          merchantId,
          merchantOrderId,
          amount: context.event.amount,
          currency: context.event.currency
        },
        diagnosis: {
          cause: diagnosis.diagnosedCause,
          confidence: diagnosis.confidence,
          actionabilityScore: actionability.score,
          actionabilityStatus: actionability.status,
          priority: priority
        },
        economics: {
          revenueAtRisk: economics.revenueAtRisk,
          economicFactor: economics.economicFactor,
          recoveryProbability: economics.recoveryProbability,
          recoveryCost: economics.recoveryCost,
          expectedRecoveryValue: economics.expectedRecoveryValue,
          netExpectedRecovery: economics.netExpectedRecovery,
          minimumRecoveryThreshold: context.merchant.minimumRecoveryThreshold,
          maxRecoveryCost: context.merchant.maxRecoveryCost
        },
        customer: {
          id: context.user.customerRecord?.id || context.user.customerId || 'lg_customer_id',
          externalCustomerId: context.user.customerRecord?.externalCustomerId || context.user.customerId || null,
          name: context.user.customerRecord?.name || null,
          email: context.user.customerRecord?.email || null,
          phone: context.user.customerRecord?.phone || null
        },
        merchant: {
          id: context.merchant.merchantId,
          name: context.merchant.name || context.merchant.merchantId,
          timezone: context.merchant.timezone,
          defaultCurrency: context.merchant.currency,
          recoveryConfig: {
            emailEnabled: context.merchant.recoveryConfig?.emailEnabled ?? true,
            smsEnabled: context.merchant.recoveryConfig?.smsEnabled ?? false,
            whatsappEnabled: context.merchant.recoveryConfig?.whatsappEnabled ?? true,
            inAppNotificationEnabled: context.merchant.recoveryConfig?.inAppNotificationEnabled ?? false,
            humanReviewEnabled: context.merchant.recoveryConfig?.humanReviewEnabled ?? false,
            humanReviewEmail: context.merchant.recoveryConfig?.humanReviewEmail || null,
            version: context.merchant.recoveryConfig?.version ?? 1
          }
        },
        payment: {
          razorpayOrderId: context.event.razorpayOrderId || null,
          razorpayPaymentId: context.event.razorpayPaymentId || null,
          providerState: context.event.providerState,
          businessState: 'UNRESOLVED'
        },
        order: {
          merchantOrderId,
          amount: context.event.amount,
          currency: context.event.currency,
          category: context.merchant.orderCategory || null
        },
        evidence: diagnosis.evidence || {}
      };

      await tx.outboxEvent.create({
        data: {
          eventType: 'VALIDATION_COMPLETED',
          aggregateId: riskEventId,
          payload: recoveryContext as any,
          status: 'PENDING'
        }
      });
    }
  }, { timeout: 20000 });
}

validationWorker.on('completed', (job) => {
  console.log(`✅ [Validation Worker] Successfully processed Job #${job.id}`);
});
validationWorker.on('failed', (job, err) => {
  console.error(`❌ [Validation Worker] Job #${job?.id} failed:`, err.message);
});

export async function processRiskEventDirectly(params: {
  riskEventId: string;
  paymentAttemptId: string;
  merchantId: string;
  merchantOrderId: string;
}) {
  const { riskEventId, paymentAttemptId, merchantId, merchantOrderId } = params;
  const context = await loadValidationData({ riskEventId, paymentAttemptId, merchantId, merchantOrderId });
  const diagnosis = runDiagnosis(context.event);
  const actionability = determineActionability(diagnosis, context.event);
  const priority = determinePriority(diagnosis);
  
  let decision: 'PROCEED' | 'STOP' = 'PROCEED';
  let stopReason: string | undefined;

  if (actionability.status === 'INSUFFICIENT' || actionability.status === 'UNCERTAIN') {
    decision = 'STOP';
    stopReason = 'ACTIONABILITY_INSUFFICIENT';
  }

  let economics = calculateEconomics(context.event, context.merchant, diagnosis);
  if (decision === 'PROCEED' && economics.decision === 'STOP') {
    decision = 'STOP';
    stopReason = economics.stopReason;
  }

  await executeFinalTransaction({
    riskEventId,
    paymentAttemptId,
    merchantId,
    merchantOrderId,
    decision,
    stopReason,
    diagnosis,
    actionability,
    priority,
    economics,
    context
  });
}
