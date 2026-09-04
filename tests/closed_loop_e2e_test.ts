import { OutcomeRepository } from '../src/outcome/persistence/outcome.repository.js';
import { RecoveryControlService } from '../src/outcome/control/recovery-control.service.js';
import { OutcomeService } from '../src/outcome/outcome.service.js';
import { runFinalSafetyCheckAsync } from '../src/execution/safety/final-safety-check.js';
import { Pool } from 'pg';
import { config } from '../src/config/env.js';

const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL || config.DATABASE_URL,
  ssl: (process.env.DATABASE_URL || config.DATABASE_URL).includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
});

async function runClosedLoopE2ETestSuite() {
  console.log('========================================================================');
  console.log('🚀 LEAKGUARD CLOSED-LOOP E2E TEST SUITE — SCENARIOS A THROUGH F');
  console.log('========================================================================\n');

  const repository = new OutcomeRepository();
  const controlService = new RecoveryControlService(repository);
  const outcomeService = new OutcomeService(repository);

  const testMerchantId = `merch_e2e_${Date.now()}`;
  const testCustomerId = `cust_e2e_${Date.now()}`;
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASSED: ${testName}`);
      passedCount++;
    } else {
      console.error(`  ❌ FAILED: ${testName} ${detail ? `(${detail})` : ''}`);
      failedCount++;
    }
  }

  async function createMockExecution(execId: string, merchantId: string, paymentAttemptId: string, riskEventId: string, interventionType: string, status = 'SUCCEEDED') {
    const policyEvalId = `peval_${execId}`;
    await dbPool.query(
      `INSERT INTO "recovery_policy_evaluations" (
        "id", "merchantId", "paymentAttemptId", "riskEventId", "interventionType", "decision", "policyVersion",
        "maxAttempts", "attemptsUsed", "attemptsRemaining", "coolOffSeconds", "killSwitchStatus", "complianceStatus",
        "frequencyStatus", "coolOffStatus", "evaluatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, 'ALLOWED', '1.0', 3, 1, 2, 1800, 'ALLOWED', 'ALLOWED', 'ALLOWED', 'ALLOWED', NOW()
      )`,
      [policyEvalId, merchantId, paymentAttemptId, riskEventId, interventionType]
    );

    await dbPool.query(
      `INSERT INTO "recovery_executions" (
        "id", "merchantId", "paymentAttemptId", "riskEventId", "policyEvaluationId", "interventionType", "status",
        "attemptNumber", "idempotencyKey", "correlationId", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 1, $8, $9, NOW(), NOW()
      )`,
      [execId, merchantId, paymentAttemptId, riskEventId, policyEvalId, interventionType, status, `idem_${execId}`, `corr_${execId}`]
    );
  }

  try {
    // Setup Test Merchant & Customer
    await dbPool.query(
      `INSERT INTO "merchants" ("id", "name", "domain", "razorpayKeyId", "razorpaySecretRef", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [testMerchantId, 'LeakGuard E2E Test Merchant', 'example.com', 'rzp_test_dummy', 'encrypted_dummy_secret']
    );

    await dbPool.query(
      `INSERT INTO "customers" ("id", "merchantId", "name", "email", "phone", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [testCustomerId, testMerchantId, 'Bharath Customer', 'bharath2005goo@gmail.com', '+917845425982']
    );

    // =========================================================================
    // SCENARIO A: Measured Recovery Success (₹8,500 Failure -> Recovery -> RESOLVED)
    // =========================================================================
    console.log('📌 Running SCENARIO A: Measured Recovery Success...');
    const orderIdA = `order_scen_a_${Date.now()}`;
    const attemptIdA = `pa_scen_a_${Date.now()}`;
    const riskIdA = `risk_scen_a_${Date.now()}`;
    const execIdA = `exec_scen_a_${Date.now()}`;

    await dbPool.query(
      `INSERT INTO "payment_attempts" ("id", "merchantId", "customerId", "merchantOrderId", "amount", "currency", "startedAt", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 8500, 'INR', NOW(), NOW() + INTERVAL '1 day', NOW(), NOW())`,
      [attemptIdA, testMerchantId, testCustomerId, orderIdA]
    );

    await dbPool.query(
      `INSERT INTO "risk_events" ("id", "paymentAttemptId", "merchantId", "eventType", "payload", "processingStatus", "emittedAt")
       VALUES ($1, $2, $3, 'PAYMENT_FAILURE', '{"test": true}'::jsonb, 'PENDING', NOW())`,
      [riskIdA, attemptIdA, testMerchantId]
    );

    await dbPool.query(
      `INSERT INTO "revenue_obligations" ("id", "merchantId", "merchantOrderId", "amount", "currency", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 8500, 'INR', 'UNRESOLVED', NOW(), NOW())`,
      [`ro_a_${Date.now()}`, testMerchantId, orderIdA]
    );

    await createMockExecution(execIdA, testMerchantId, attemptIdA, riskIdA, 'SEND_WHATSAPP');

    // 1. Initial execution completed, payment unresolved -> PENDING
    const resultA1 = await outcomeService.processExecutionEvent({
      eventType: 'EXECUTION_COMPLETED',
      executionId: execIdA,
      merchantId: testMerchantId,
      paymentAttemptId: attemptIdA,
      riskEventId: riskIdA,
      interventionType: 'SEND_WHATSAPP',
      status: 'SUCCEEDED',
      provider: 'TWILIO',
      correlationId: `corr_a_${Date.now()}`,
    });

    assert(resultA1.outcomeStatus === 'PENDING', 'Scenario A: Initial outcome status is PENDING');

    // 2. Customer pays -> RevenueObligation resolved -> OutcomeService re-evaluates
    await dbPool.query(
      `UPDATE "revenue_obligations" SET "status" = 'RESOLVED', "resolvedAt" = NOW() WHERE "merchantOrderId" = $1`,
      [orderIdA]
    );

    const resultA2 = await outcomeService.processExecutionEvent({
      eventType: 'EXECUTION_COMPLETED',
      executionId: execIdA,
      merchantId: testMerchantId,
      paymentAttemptId: attemptIdA,
      riskEventId: riskIdA,
      interventionType: 'SEND_WHATSAPP',
      status: 'SUCCEEDED',
      provider: 'TWILIO',
      correlationId: `corr_a_${Date.now()}`,
    });

    assert(resultA2.outcomeStatus === 'RECOVERED', 'Scenario A: Outcome status transitioned to RECOVERED');

    const controlA = await repository.getRecoveryControl(riskIdA);
    assert(controlA?.status === 'STOPPED' && controlA?.stopReason === 'CUSTOMER_RECOVERED', 'Scenario A: RecoveryControl stopped by SYSTEM due to CUSTOMER_RECOVERED');

    // =========================================================================
    // SCENARIO B: Merchant Emergency Stop & Safety Check Enforcement
    // =========================================================================
    console.log('\n📌 Running SCENARIO B: Merchant Emergency Stop...');
    const orderIdB = `order_scen_b_${Date.now()}`;
    const attemptIdB = `pa_scen_b_${Date.now()}`;
    const riskIdB = `risk_scen_b_${Date.now()}`;

    await dbPool.query(
      `INSERT INTO "payment_attempts" ("id", "merchantId", "customerId", "merchantOrderId", "amount", "currency", "startedAt", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 5000, 'INR', NOW(), NOW() + INTERVAL '1 day', NOW(), NOW())`,
      [attemptIdB, testMerchantId, testCustomerId, orderIdB]
    );

    await dbPool.query(
      `INSERT INTO "risk_events" ("id", "paymentAttemptId", "merchantId", "eventType", "payload", "processingStatus", "emittedAt")
       VALUES ($1, $2, $3, 'PAYMENT_FAILURE', '{"test": true}'::jsonb, 'PENDING', NOW())`,
      [riskIdB, attemptIdB, testMerchantId]
    );

    // Merchant clicks STOP
    await controlService.stopRecoveryByMerchant(testMerchantId, riskIdB, 'Customer contacted support directly');

    const controlB = await repository.getRecoveryControl(riskIdB);
    assert(controlB?.status === 'STOPPED' && controlB?.stoppedBy === 'MERCHANT', 'Scenario B: Control status is STOPPED by MERCHANT');

    // Execution safety check test
    const mockContextB: any = {
      riskEventId: riskIdB,
      merchant: { id: testMerchantId, recoveryEnabled: true, recoveryConfig: { smsEnabled: true, emailEnabled: true, whatsappEnabled: true } },
      payment: { paymentAttemptId: attemptIdB, merchantOrderId: orderIdB, amount: 5000, currency: 'INR', businessState: 'UNRESOLVED' },
      customer: { email: 'test@example.com', phone: '+919999999999' },
      intervention: { type: 'SEND_SMS' },
      policy: { decision: 'ALLOWED', attemptsUsed: 0, maxAttempts: 3, attemptsRemaining: 3 },
    };

    const safetyCheckB = await runFinalSafetyCheckAsync(mockContextB);
    assert(!safetyCheckB.safe && safetyCheckB.failureCode === 'MERCHANT_STOPPED_RECOVERY', 'Scenario B: Safety check aborted execution with MERCHANT_STOPPED_RECOVERY');

    // =========================================================================
    // SCENARIO C: Multi-Attempt Reassessment Loop
    // =========================================================================
    console.log('\n📌 Running SCENARIO C: Multi-Attempt Reassessment Loop...');
    const orderIdC = `order_scen_c_${Date.now()}`;
    const attemptIdC = `pa_scen_c_${Date.now()}`;
    const riskIdC = `risk_scen_c_${Date.now()}`;
    const execIdC1 = `exec_scen_c1_${Date.now()}`;

    await dbPool.query(
      `INSERT INTO "payment_attempts" ("id", "merchantId", "customerId", "merchantOrderId", "amount", "currency", "startedAt", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 12000, 'INR', NOW(), NOW() + INTERVAL '1 day', NOW(), NOW())`,
      [attemptIdC, testMerchantId, testCustomerId, orderIdC]
    );

    await dbPool.query(
      `INSERT INTO "risk_events" ("id", "paymentAttemptId", "merchantId", "eventType", "payload", "processingStatus", "emittedAt")
       VALUES ($1, $2, $3, 'PAYMENT_FAILURE', '{"test": true}'::jsonb, 'PENDING', NOW())`,
      [riskIdC, attemptIdC, testMerchantId]
    );

    await dbPool.query(
      `INSERT INTO "revenue_obligations" ("id", "merchantId", "merchantOrderId", "amount", "currency", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 12000, 'INR', 'UNRESOLVED', NOW(), NOW())`,
      [`ro_c_${Date.now()}`, testMerchantId, orderIdC]
    );

    await dbPool.query(
      `INSERT INTO "recovery_attempts" ("id", "merchantId", "paymentAttemptId", "riskEventId", "interventionType", "status", "attemptNumber", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'SEND_WHATSAPP', 'SUCCEEDED', 1, NOW(), NOW())`,
      [`att_c1_${Date.now()}`, testMerchantId, attemptIdC, riskIdC]
    );

    await createMockExecution(execIdC1, testMerchantId, attemptIdC, riskIdC, 'SEND_WHATSAPP');

    // Expired measurement window -> NOT_RECOVERED -> Continuation YES -> Reassessment outbox event
    const resultC = await outcomeService.processExpiredMeasurementWindow({
      merchantId: testMerchantId,
      paymentAttemptId: attemptIdC,
      riskEventId: riskIdC,
      executionId: execIdC1,
      interventionType: 'SEND_WHATSAPP',
      correlationId: `corr_c_${Date.now()}`,
    });

    assert(resultC.outcomeStatus === 'NOT_RECOVERED', 'Scenario C: Window expired yields NOT_RECOVERED');
    assert(resultC.continuation?.continue === true, 'Scenario C: Continuation decision is YES');

    const outboxResC = await dbPool.query(
      `SELECT * FROM "outbox_events" WHERE "event_type" = 'REASSESSMENT_REQUESTED' AND "aggregate_id" = $1 LIMIT 1`,
      [riskIdC]
    );
    assert(outboxResC.rows.length > 0, 'Scenario C: REASSESSMENT_REQUESTED outbox event persisted');

    // =========================================================================
    // SCENARIO D: Provider Success Without Payment (₹0 Recovered Revenue)
    // =========================================================================
    console.log('\n📌 Running SCENARIO D: Provider Success Without Payment...');
    const orderIdD = `order_scen_d_${Date.now()}`;
    const attemptIdD = `pa_scen_d_${Date.now()}`;
    const riskIdD = `risk_scen_d_${Date.now()}`;
    const execIdD = `exec_scen_d_${Date.now()}`;

    await dbPool.query(
      `INSERT INTO "payment_attempts" ("id", "merchantId", "customerId", "merchantOrderId", "amount", "currency", "startedAt", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 3500, 'INR', NOW(), NOW() + INTERVAL '1 day', NOW(), NOW())`,
      [attemptIdD, testMerchantId, testCustomerId, orderIdD]
    );

    await dbPool.query(
      `INSERT INTO "risk_events" ("id", "paymentAttemptId", "merchantId", "eventType", "payload", "processingStatus", "emittedAt")
       VALUES ($1, $2, $3, 'PAYMENT_FAILURE', '{"test": true}'::jsonb, 'PENDING', NOW())`,
      [riskIdD, attemptIdD, testMerchantId]
    );

    await createMockExecution(execIdD, testMerchantId, attemptIdD, riskIdD, 'SEND_SMS');

    // Provider succeeded, but payment remains UNRESOLVED
    await outcomeService.processExecutionEvent({
      eventType: 'EXECUTION_COMPLETED',
      executionId: execIdD,
      merchantId: testMerchantId,
      paymentAttemptId: attemptIdD,
      riskEventId: riskIdD,
      interventionType: 'SEND_SMS',
      status: 'SUCCEEDED',
      provider: 'TWILIO',
      correlationId: `corr_d_${Date.now()}`,
    });

    const metricsD = await repository.getRecoveryMetrics(testMerchantId);
    const inrMetricsD = metricsD.find((m) => m.currency === 'INR');
    // Money recovered for Scenario D must be 0 because RevenueObligation is not resolved
    const scenDOutcome = (await dbPool.query(`SELECT * FROM "recovery_outcomes" WHERE "executionId" = $1`, [execIdD])).rows[0];
    assert(scenDOutcome.outcomeStatus === 'PENDING', 'Scenario D: Provider success alone leaves outcome as PENDING');

    // =========================================================================
    // SCENARIO E: Independent Payment Resolution
    // =========================================================================
    console.log('\n📌 Running SCENARIO E: Independent Payment Resolution...');
    const orderIdE = `order_scen_e_${Date.now()}`;
    const attemptIdE = `pa_scen_e_${Date.now()}`;
    const riskIdE = `risk_scen_e_${Date.now()}`;
    const execIdE = `exec_scen_e_${Date.now()}`;

    await dbPool.query(
      `INSERT INTO "payment_attempts" ("id", "merchantId", "customerId", "merchantOrderId", "amount", "currency", "startedAt", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 6500, 'INR', NOW(), NOW() + INTERVAL '1 day', NOW(), NOW())`,
      [attemptIdE, testMerchantId, testCustomerId, orderIdE]
    );

    await dbPool.query(
      `INSERT INTO "risk_events" ("id", "paymentAttemptId", "merchantId", "eventType", "payload", "processingStatus", "emittedAt")
       VALUES ($1, $2, $3, 'PAYMENT_FAILURE', '{"test": true}'::jsonb, 'PENDING', NOW())`,
      [riskIdE, attemptIdE, testMerchantId]
    );

    await dbPool.query(
      `INSERT INTO "revenue_obligations" ("id", "merchantId", "merchantOrderId", "amount", "currency", "status", "resolvedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 6500, 'INR', 'RESOLVED', NOW(), NOW(), NOW())`,
      [`ro_e_${Date.now()}`, testMerchantId, orderIdE]
    );

    await createMockExecution(execIdE, testMerchantId, attemptIdE, riskIdE, 'SEND_PAYMENT_LINK');

    const resultE = await outcomeService.processExecutionEvent({
      eventType: 'EXECUTION_COMPLETED',
      executionId: execIdE,
      merchantId: testMerchantId,
      paymentAttemptId: attemptIdE,
      riskEventId: riskIdE,
      interventionType: 'SEND_PAYMENT_LINK',
      status: 'SUCCEEDED',
      provider: 'RAZORPAY',
      correlationId: `corr_e_${Date.now()}`,
    });

    assert(resultE.outcomeStatus === 'RECOVERED', 'Scenario E: Independent payment resolution detected immediately as RECOVERED');

    // =========================================================================
    // SCENARIO F: Read APIs, Audit Timeline & Revenue Metrics Validation
    // =========================================================================
    console.log('\n📌 Running SCENARIO F: Audit Timeline & Metrics Aggregation...');
    const auditTimelineA = await repository.getAuditTimeline(riskIdA);
    assert(auditTimelineA.length > 0, 'Scenario F: Chronological audit timeline retrieved for Risk Event A');

    const detailA = await repository.getRecoveryDetail(riskIdA);
    assert(detailA !== null && detailA.currentState.isRecovered === true, 'Scenario F: Recovery detail view constructed correctly for Risk Event A');

    const finalMetrics = await repository.getRecoveryMetrics(testMerchantId);
    const inrMetrics = finalMetrics.find((m) => m.currency === 'INR');
    assert(
      inrMetrics !== undefined && inrMetrics.totalRecoveredRevenue === 15000, // Scenario A (8500) + Scenario E (6500) = 15000
      `Scenario F: Total measured recovered revenue is ₹15,000 (Actual: ₹${inrMetrics?.totalRecoveredRevenue})`
    );

  } catch (err: any) {
    console.error('\n❌ Unexpected error during closed-loop test suite execution:', err);
    failedCount++;
  } finally {
    // Cleanup Test Data
    await dbPool.query(`DELETE FROM "recovery_audits" WHERE "merchantId" = $1`, [testMerchantId]);
    await dbPool.query(`DELETE FROM "recovery_outcomes" WHERE "merchantId" = $1`, [testMerchantId]);
    await dbPool.query(`DELETE FROM "recovery_controls" WHERE "merchantId" = $1`, [testMerchantId]);
    await dbPool.query(`DELETE FROM "recovery_executions" WHERE "merchantId" = $1`, [testMerchantId]);
    await dbPool.query(`DELETE FROM "recovery_policy_evaluations" WHERE "merchantId" = $1`, [testMerchantId]);
    await dbPool.query(`DELETE FROM "recovery_attempts" WHERE "merchantId" = $1`, [testMerchantId]);
    await dbPool.query(`DELETE FROM "revenue_obligations" WHERE "merchantId" = $1`, [testMerchantId]);
    await dbPool.query(`DELETE FROM "risk_events" WHERE "merchantId" = $1`, [testMerchantId]);
    await dbPool.query(`DELETE FROM "payment_attempts" WHERE "merchantId" = $1`, [testMerchantId]);
    await dbPool.query(`DELETE FROM "customers" WHERE "merchantId" = $1`, [testMerchantId]);
    await dbPool.query(`DELETE FROM "merchants" WHERE "id" = $1`, [testMerchantId]);
    await dbPool.query(`DELETE FROM "outbox_events" WHERE "event_type" = 'REASSESSMENT_REQUESTED'`);

    await dbPool.end();
    try { await repository['pool'].end(); } catch {}

    console.log('\n========================================================================');
    console.log(`📊 TEST SUITE SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('========================================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    }
  }
}

runClosedLoopE2ETestSuite();
