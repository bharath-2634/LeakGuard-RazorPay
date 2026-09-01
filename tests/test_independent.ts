import { prisma } from '../src/infrastructure/db/prisma-client.js';
import { loadValidationData } from '../src/infrastructure/db/context-repository.js';
import { runDiagnosis } from '../src/domain/diagnosis-engine.js';
import { determineActionability } from '../src/domain/actionability-engine.js';
import { determinePriority } from '../src/domain/priority-engine.js';
import { calculateEconomics } from '../src/domain/economic-engine.js';
import { config } from '../src/config/env.js';

async function runIndependentTest() {
  console.log('--- STARTING INDEPENDENT LAYER-BY-LAYER TEST ---');

  // 1. Seed Dummy Data
  const merchantId = 'm_test_validation_01';
  const merchantOrderId = 'order_test_val_01';
  const paymentAttemptId = 'pa_test_val_01';
  const riskEventId = 'risk_test_val_01';

  console.log('\n[1] Seeding Dummy Data in PostgreSQL...');
  
  // Clean up previous runs
  await prisma.validationResult.deleteMany({ where: { riskEventId } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: riskEventId } });
  await prisma.riskEvent.deleteMany({ where: { id: riskEventId } });
  await prisma.revenueObligation.deleteMany({ where: { merchantId, merchantOrderId } });
  await prisma.paymentAttempt.deleteMany({ where: { id: paymentAttemptId } });
  await prisma.merchantEconomics.deleteMany({ where: { merchantId } });
  await prisma.merchant.deleteMany({ where: { id: merchantId } });

  await prisma.merchant.create({
    data: {
      id: merchantId,
      name: 'Validation Test Merchant',
      domain: 'test-validation.com',
      razorpayKeyId: 'rzp_test_val',
      razorpaySecretRef: 'encrypted_val'
    }
  });

  await prisma.merchantEconomics.create({
    data: {
      merchantId,
      defaultMarginRate: 0.3,
      minimumRecoveryThreshold: 10,
      baseRecoveryCost: 5
    }
  });

  await prisma.paymentAttempt.create({
    data: {
      id: paymentAttemptId,
      merchantId,
      merchantOrderId,
      amount: 500, // 500 INR
      currency: 'INR',
      providerState: 'FAILED',
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000)
    }
  });

  await prisma.revenueObligation.create({
    data: {
      merchantId,
      merchantOrderId,
      amount: 500,
      currency: 'INR',
      status: 'UNRESOLVED'
    }
  });

  await prisma.riskEvent.create({
    data: {
      id: riskEventId,
      paymentAttemptId,
      merchantId,
      eventType: 'PAYMENT_FAILURE_RISK',
      payload: {},
      processingStatus: 'PENDING'
    }
  });

  // Also simulate a Razorpay Webhook Event for deterministic diagnosis
  await prisma.razorpayWebhookEvent.deleteMany({ where: { merchantId, orderId: merchantOrderId } });
  await prisma.razorpayWebhookEvent.create({
    data: {
      razorpayEventId: 'ev_test_val_01',
      merchantId,
      orderId: merchantOrderId,
      eventType: 'payment.failed',
      payload: {
        payload: {
          payment: {
            entity: {
              error: {
                code: 'BAD_REQUEST_ERROR',
                reason: 'insufficient_funds',
                source: 'issuer',
                step: 'payment_authorization'
              }
            }
          }
        }
      }
    }
  });

  console.log(`✅ Seeded RiskEvent: ${riskEventId}, PaymentAttempt: ${paymentAttemptId}`);

  // 2. Processing Guard
  console.log('\n[2] Executing Processing Guard...');
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + config.VALIDATION_PROCESSING_LEASE_MS);
  
  const claimedEvent = await prisma.riskEvent.updateMany({
    where: { id: riskEventId, processingStatus: 'PENDING' },
    data: { processingStatus: 'PROCESSING', processingLeaseUntil: leaseUntil, attemptCount: { increment: 1 }, validationStartedAt: now }
  });
  console.log(`Guard Result: Claimed = ${claimedEvent.count > 0}`);

  // 3. Initial Resolution Guard
  console.log('\n[3] Executing Initial Resolution Guard...');
  const obligation = await prisma.revenueObligation.findUnique({
    where: { merchantId_merchantOrderId: { merchantId, merchantOrderId } }
  });
  console.log(`Obligation Status: ${obligation?.status}`);
  if (obligation?.status === 'RESOLVED') return console.log('STOP: Already resolved');

  // 4. Load Data & Build Context
  console.log('\n[4] Loading Context...');
  const context = await loadValidationData({ riskEventId, paymentAttemptId, merchantId, merchantOrderId });
  console.log('Event Context:', context.event);
  console.log('Merchant Context:', context.merchant);

  // 5. Diagnosis Engine
  console.log('\n[5] Executing Diagnosis Engine...');
  const diagnosis = runDiagnosis(context.event);
  console.log('Diagnosis Result:', diagnosis);

  // 6. Actionability Engine
  console.log('\n[6] Executing Actionability Engine...');
  const actionability = determineActionability(diagnosis, context.event);
  console.log('Actionability Result:', actionability);

  // 7. Priority Engine
  console.log('\n[7] Executing Priority Engine...');
  const priority = determinePriority(diagnosis);
  console.log('Priority Result:', priority);

  // 8. Economic Engine
  console.log('\n[8] Executing Economic Engine...');
  const economics = calculateEconomics(context.event, context.merchant, diagnosis);
  console.log('Economic Result:', economics);

  // 9. Final Resolution Guard & Persistence
  console.log('\n[9] Executing Final Transaction & Persistence...');
  await prisma.$transaction(async (tx) => {
    const obligations = await tx.$queryRaw<any[]>`
      SELECT status FROM revenue_obligations
      WHERE "merchantId" = ${merchantId} AND "merchantOrderId" = ${merchantOrderId}
      FOR UPDATE
    `;
    
    let decision = economics.decision;
    let stopReason = economics.stopReason;
    
    if (actionability.status === 'INSUFFICIENT' || actionability.status === 'UNCERTAIN') {
      decision = 'STOP';
      stopReason = 'ACTIONABILITY_INSUFFICIENT';
    }

    if (obligations.length > 0 && obligations[0].status === 'RESOLVED') {
      decision = 'STOP';
      stopReason = 'ALREADY_RESOLVED';
    }

    const validationResult = await tx.validationResult.create({
      data: {
        riskEventId, paymentAttemptId, merchantId,
        diagnosedCause: diagnosis.diagnosedCause,
        diagnosisConfidence: diagnosis.confidence,
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

    await tx.riskEvent.update({
      where: { id: riskEventId },
      data: { processingStatus: decision === 'PROCEED' ? 'COMPLETED' : 'STOPPED', validationCompletedAt: new Date() }
    });

    if (decision === 'PROCEED') {
      await tx.outboxEvent.create({
        data: {
          eventType: 'VALIDATION_COMPLETED',
          aggregateId: riskEventId,
          payload: { validationResultId: validationResult.id, riskEventId, paymentAttemptId, merchantId, merchantOrderId, version: 1 }
        }
      });
    }
  });

  const finalRiskEvent = await prisma.riskEvent.findUnique({ where: { id: riskEventId } });
  const finalResult = await prisma.validationResult.findUnique({ where: { riskEventId } });
  const outboxEvent = await prisma.outboxEvent.findFirst({ where: { aggregateId: riskEventId } });

  console.log('\n--- FINAL OUTCOME ---');
  console.log('RiskEvent Status:', finalRiskEvent?.processingStatus);
  console.log('ValidationResult:', finalResult);
  console.log('OutboxEvent Created:', !!outboxEvent);

  console.log('\n✅ INDEPENDENT TEST COMPLETED SUCCESSFULLY');
}

runIndependentTest().catch(console.error).finally(() => prisma.$disconnect());
