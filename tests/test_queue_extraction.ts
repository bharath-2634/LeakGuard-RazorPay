import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../src/config/env.js';
import {
  getInterventionsForCause,
  getEligibleInterventionsForContext
} from '../src/recovery/intervention/catalog/intervention-catalog.js';

async function testQueueCandidateExtraction() {
  console.log('--- TESTING UPSTASH REDIS QUEUE CANDIDATE EXTRACTION ---\n');

  const client = new Redis(config.INTERVENTION_REDIS_URL, {
    maxRetriesPerRequest: null,
    ...(config.INTERVENTION_REDIS_URL.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {})
  });

  const q = new Queue('risk-intervention', { connection: client });

  const jobs = await q.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed']);
  console.log(`Found ${jobs.length} jobs in 'risk-intervention' queue.`);

  if (jobs.length === 0) {
    console.log('⚠️ Queue is empty! Inserting a sample job to test extraction...');
    await q.add('START_INTERVENTION', {
      riskEventId: 'sample_risk_evt_123',
      paymentAttemptId: 'pa_sample_123',
      merchantId: 'merchant_e2e_test',
      merchantOrderId: 'order_sample_123',
      version: 1,
      diagnosis: {
        diagnosedCause: 'INSUFFICIENT_FUNDS',
        confidence: 0.99
      },
      context: {
        event: {
          amount: 5000,
          currency: 'INR',
          providerState: 'FAILED'
        },
        user: {
          email: 'customer@example.com',
          phone: '+919999988888'
        }
      }
    });
  }

  const updatedJobs = await q.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed']);

  let successCount = 0;
  let missingCount = 0;

  for (const job of updatedJobs) {
    const data = job.data;
    const diagnosedCause =
      data.diagnosis?.diagnosedCause ||
      data.payload?.diagnosis?.diagnosedCause ||
      data.diagnosedCause ||
      'UNKNOWN';

    const causeCandidates = getInterventionsForCause(diagnosedCause);

    const eligibleCandidates = getEligibleInterventionsForContext({
      cause: diagnosedCause,
      customerData: {
        email: data.context?.user?.email,
        phone: data.context?.user?.phone,
        customerIdentity: data.context?.user?.customerId || data.context?.event?.merchantOrderId,
        paymentAttemptId: data.paymentAttemptId || data.context?.event?.paymentAttemptId
      },
      merchantConfig: {
        emailEnabled: true,
        smsEnabled: true,
        whatsappEnabled: true,
        humanReviewEnabled: true,
        humanReviewContact: 'support@merchant.com'
      },
      paymentState: {
        isResolved: data.context?.event?.providerState === 'CAPTURED',
        isDefinitivelyFailed: data.context?.event?.providerState === 'FAILED'
      }
    });

    console.log(`========================================`);
    console.log(`Job ID: ${job.id}`);
    console.log(`Raw Diagnosed Cause: ${diagnosedCause}`);
    console.log(`Cause Candidates count: ${causeCandidates.length} (${causeCandidates.map(c => c.type).join(', ')})`);
    console.log(`Eligible Candidates count: ${eligibleCandidates.length} (${eligibleCandidates.map(c => c.type).join(', ')})`);

    if (causeCandidates.length > 0) {
      successCount++;
    } else {
      missingCount++;
      console.error(`❌ FAILED TO EXTRACT CANDIDATES FOR JOB ID ${job.id}`);
    }
  }

  console.log(`\n========================================`);
  console.log(`SUMMARY:`);
  console.log(`Total Queue Jobs Processed: ${updatedJobs.length}`);
  console.log(`Successfully Determined Candidates: ${successCount}`);
  console.log(`Missed / Failed: ${missingCount}`);

  await client.quit();
  process.exit(missingCount === 0 ? 0 : 1);
}

testQueueCandidateExtraction().catch(console.error);
