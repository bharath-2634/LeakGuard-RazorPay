import { prisma } from '../src/infrastructure/db/prisma-client.js';
import { OutboxRelay, riskInterventionQueue, interventionRedisClient } from '../src/application/outbox-relay.js';

async function runHandoffTest() {
  console.log('--- STARTING RECOVERY HANDOFF TEST ---');

  // Seed a pending outbox event with a mock fat payload
  const mockPayload = {
    validationResultId: 'vr_test_handoff_01',
    riskEventId: 're_test_handoff_01',
    paymentAttemptId: 'pa_test_handoff_01',
    merchantId: 'm_test_handoff_01',
    merchantOrderId: 'mo_test_handoff_01',
    version: 1,
    diagnosis: { diagnosedCause: 'INSUFFICIENT_FUNDS', confidence: 0.99 },
    actionability: { score: 95, status: 'HIGHLY_ACTIONABLE' },
    priority: 'LOW',
    economics: { netExpectedRecovery: 45, decision: 'PROCEED' },
    context: {
      merchant: { id: 'm_test_handoff_01', name: 'Handoff Test Merchant' }
    }
  };

  const event = await prisma.outboxEvent.create({
    data: {
      eventType: 'VALIDATION_COMPLETED',
      aggregateId: 're_test_handoff_01',
      payload: mockPayload,
      status: 'PENDING'
    }
  });

  console.log(`✅ Seeded OutboxEvent #${event.id} in Postgres.`);

  console.log('🚀 Running Outbox Relay...');
  const processed = await OutboxRelay.relayPendingEvents();
  console.log(`Relayed ${processed} events to Upstash Redis (risk-intervention queue).`);

  // Verify the job exists in BullMQ (Upstash Redis)
  const jobs = await riskInterventionQueue.getJobs(['waiting', 'active', 'delayed', 'completed', 'failed']);
  const ourJob = jobs.find(j => j.id === event.id);

  if (ourJob) {
    console.log(`✅ VERIFIED: Job #${ourJob.id} found in 'risk-intervention' queue!`);
    console.log('Job Payload snippet:', JSON.stringify(ourJob.data).substring(0, 100) + '...');
  } else {
    console.error('❌ ERROR: Job not found in queue!');
  }

  process.exit(0);
}

runHandoffTest().catch(console.error);
