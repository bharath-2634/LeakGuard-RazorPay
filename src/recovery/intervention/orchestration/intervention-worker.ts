import { Worker, Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../../../config/env.js';
import { InterventionSelectionService } from '../selection/selection-service.js';
import { relayExecutionOutbox } from '../../../infrastructure/queue/execution-outbox-relay.js';

export const INTERVENTION_QUEUE_NAME = 'risk-intervention';

export const interventionRedisClient = new (Redis as any)(config.INTERVENTION_REDIS_URL, {
  maxRetriesPerRequest: null,
  ...(config.INTERVENTION_REDIS_URL.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {})
});

export const riskInterventionQueue = new Queue(INTERVENTION_QUEUE_NAME, {
  connection: interventionRedisClient
});

const selectionService = new InterventionSelectionService();

export async function startInterventionWorker(queueName = INTERVENTION_QUEUE_NAME) {
  console.log(`🚀 [Intervention Orchestration Worker] Listening on queue '${queueName}'...`);

  const worker = new Worker(
    queueName,
    async (job: Job) => {
      console.log(`\n📥 [Intervention Worker] Received Job #${job.id} (Name: ${job.name})`);
      const data = job.data;
      const recoveryContext = data.payload || data;

      const diagnosedCause =
        recoveryContext.diagnosis?.cause ||
        recoveryContext.diagnosis?.diagnosedCause ||
        'UNKNOWN';

      console.log(`✨ [Intervention Selection Engine] Processing Cause: ${diagnosedCause}`);

      const selectionResult = await selectionService.processRecoveryContext(recoveryContext);

      console.log(`📊 [Selection Result] Status: ${selectionResult.status || 'COMPLETED'} | Selector: ${selectionResult.selector} (${selectionResult.model || 'rule-based'}) | Fallback: ${selectionResult.fallbackUsed}`);
      console.log(`📝 [Reasoning Summary] ${selectionResult.reasoningSummary}`);
      
      if (selectionResult.selectedCandidate) {
        console.log(`⭐ [Selected Preferred Candidate] ${selectionResult.selectedCandidate.interventionType} (Rank #${selectionResult.selectedCandidate.rank}, Score: ${selectionResult.selectedCandidate.score})`);
      }

      console.log(`📋 [Ranked Candidates Count]: ${selectionResult.rankedCandidates.length}`);
      selectionResult.rankedCandidates.forEach((cand) => {
        console.log(`   #${cand.rank} ${cand.interventionType} (Score: ${cand.score}) - ${cand.rationale}`);
      });

      console.log(`🛡️ [Policy Boundary] Evaluations: ${selectionResult.policyEvaluations?.length || 0} | Re-plan used: ${selectionResult.replanUsed ? 'YES' : 'NO'} | Loops: ${(selectionResult.policyEvaluations?.length || 0) + (selectionResult.replanUsed ? 1 : 0)}`);
      if (selectionResult.executionOutboxId) {
        console.log(`📤 [Execution Handoff] Created outbox event ${selectionResult.executionOutboxId} for queue 'risk-execution'.`);
      }
      selectionResult.policyEvaluations?.forEach((evaluation, index) => {
        console.log(`   Policy #${index + 1} ${evaluation.interventionType}: ${evaluation.decision} | attempts ${evaluation.effectiveBoundary.attemptsUsed}/${evaluation.effectiveBoundary.maxAttempts} | cool-off ${evaluation.effectiveBoundary.coolOffSeconds}s | ${evaluation.reasons.join('; ') || 'all checks passed'}`);
      });
      if (selectionResult.policyRejectionReasons?.length) {
        console.log(`   Policy rejection reasons: ${selectionResult.policyRejectionReasons.join(' | ')}`);
      }

      return {
        jobId: job.id,
        diagnosedCause,
        selectionResult
      };
    },
    { connection: interventionRedisClient }
  );

  worker.on('completed', (job) => {
    console.log(`✅ [Intervention Worker] Job #${job.id} successfully processed intervention selection.\n`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ [Intervention Worker] Job #${job?.id} failed:`, err.message);
  });

  if (process.env.DATABASE_URL) {
    const relayInterval = setInterval(() => {
      relayExecutionOutbox().catch((error) => console.error('[Execution Outbox Relay]', error));
    }, 5000);
    worker.on('closed', () => clearInterval(relayInterval));
    await relayExecutionOutbox();
  }

  return worker;
}
