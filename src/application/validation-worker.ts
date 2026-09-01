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

    // --- PHASE 5: Result Persistence & Final Guard ---
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
      economics
    });
  },
  { connection: bullmqRedisClient }
);

async function executeFinalTransaction(data: any) {
  const { riskEventId, paymentAttemptId, merchantId, merchantOrderId, diagnosis, actionability, priority, economics } = data;
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

    // 2. Persist ValidationResult
    const validationResult = await tx.validationResult.create({
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

    // 3. Update RiskEvent Status
    await tx.riskEvent.update({
      where: { id: riskEventId },
      data: {
        processingStatus: decision === 'PROCEED' ? 'COMPLETED' : 'STOPPED',
        validationCompletedAt: new Date()
      }
    });

    // 4. Emmit Outbox Event (if PROCEED)
    if (decision === 'PROCEED') {
      await tx.outboxEvent.create({
        data: {
          eventType: 'VALIDATION_COMPLETED',
          aggregateId: riskEventId,
          payload: {
            validationResultId: validationResult.id,
            riskEventId,
            paymentAttemptId,
            merchantId,
            merchantOrderId,
            version: 1
          },
          status: 'PENDING'
        }
      });
    }
  });
}

validationWorker.on('completed', (job) => {
  console.log(`✅ [Validation Worker] Successfully processed Job #${job.id}`);
});
validationWorker.on('failed', (job, err) => {
  console.error(`❌ [Validation Worker] Job #${job?.id} failed:`, err.message);
});
