import { Worker } from 'bullmq';
import { bullmqRedisClient } from '../src/infrastructure/redis/bullmq-client.js';
import { prisma } from '../src/infrastructure/db/prisma-client.js';
import { loadValidationData } from '../src/infrastructure/db/context-repository.js';
import { runDiagnosis } from '../src/domain/diagnosis-engine.js';
import { determineActionability } from '../src/domain/actionability-engine.js';
import { determinePriority } from '../src/domain/priority-engine.js';
import { calculateEconomics } from '../src/domain/economic-engine.js';

const w = new Worker('risk-validation-test', async (job) => {
  console.log(`[LOCAL WORKER] Processing job ${job.id}`);
  const { riskEventId, paymentAttemptId, merchantId, merchantOrderId } = job.data;
  
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + 60000);
  
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

  console.log(`claimedEvent.count = ${claimedEvent.count}`);
  
  if (claimedEvent.count === 0) {
    console.log(`Already claimed or not found`);
    return;
  }
  
  console.log(`Successfully claimed! Proceeding to load data...`);
  const initialObligation = await prisma.revenueObligation.findUnique({
    where: { merchantId_merchantOrderId: { merchantId, merchantOrderId } },
    select: { status: true }
  });
  
  if (initialObligation?.status === 'RESOLVED') return;
  
  const context = await loadValidationData(riskEventId);
  const diagnosis = runDiagnosis(context);
  const actionability = determineActionability(context, diagnosis);
  const priority = determinePriority(context, diagnosis, actionability);
  const economics = calculateEconomics(context);
  
  const decision = actionability.actionabilityStatus === 'ACTIONABLE' && economics.netExpectedRecovery > 0 ? 'PROCEED' : 'STOP';
  
  const res = await prisma.validationResult.create({
    data: {
      riskEventId,
      paymentAttemptId,
      merchantId,
      diagnosedCause: diagnosis.cause,
      diagnosisConfidence: diagnosis.confidence,
      actionabilityScore: actionability.actionabilityScore,
      actionabilityStatus: actionability.actionabilityStatus,
      priority: priority.priorityLevel,
      revenueAtRisk: economics.revenueAtRisk,
      economicFactor: economics.economicFactor,
      recoveryProbability: economics.recoveryProbability,
      recoveryCost: economics.recoveryCost,
      expectedRecoveryValue: economics.expectedRecoveryValue,
      netExpectedRecovery: economics.netExpectedRecovery,
      decision,
      stopReason: decision === 'STOP' ? 'Low economics or unactionable' : null,
      evidence: diagnosis.evidence as any,
      correlationId: `corr_val_${riskEventId}`
    }
  });
  
  console.log(`CREATED VALIDATION RESULT:`, res.id);
  
}, { connection: bullmqRedisClient });

console.log('Local test worker started on risk-validation-test');
