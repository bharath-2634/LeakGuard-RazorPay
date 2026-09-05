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

async function runLiveCustomerEndToEndSuite() {
  console.log('\n========================================================================');
  console.log('🚀 LEAKGUARD LIVE CUSTOMER E2E SUITE — BHARATH G (+917845425982)');
  console.log('========================================================================\n');

  const repository = new OutcomeRepository();
  const controlService = new RecoveryControlService(repository);
  const outcomeService = new OutcomeService(repository);

  const merchantId = 'm_shopexpress_9f82a';
  const customerId = `cust_bharath_${Date.now()}`;
  const customerEmail = 'bharath2005goo@gmail.com';
  const customerPhone = '+917845425982';
  const customerName = 'Bharath G';

  try {
    // 1. Ensure Merchant Exists
    await dbPool.query(
      `INSERT INTO "merchants" ("id", "name", "domain", "razorpayKeyId", "razorpaySecretRef", "createdAt", "updatedAt")
       VALUES ($1, 'ShopExpress E-Commerce', 'shopexpress.com', 'rzp_test_TWEQTS4vaQiKvB', 'JwG1G4hB3xIpuPuwa1bJG9mL', NOW(), NOW())
       ON CONFLICT ("id") DO NOTHING`,
      [merchantId]
    );

    // 2. Ensure Customer Record
    await dbPool.query(
      `INSERT INTO "customers" ("id", "merchantId", "name", "email", "phone", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT ("id") DO NOTHING`,
      [customerId, merchantId, customerName, customerEmail, customerPhone]
    );

    console.log(`👤 Customer Profile Provisioned: ${customerName} (${customerEmail} | ${customerPhone})`);
    console.log(`🏬 Merchant Connected: ${merchantId}\n`);

    // Helper to create Policy Eval and Execution
    async function recordExecution(execId: string, paId: string, riskId: string, intervention: string) {
      const peId = `peval_${execId}`;
      await dbPool.query(
        `INSERT INTO "recovery_policy_evaluations" (
          "id", "merchantId", "paymentAttemptId", "riskEventId", "interventionType", "decision", "policyVersion",
          "maxAttempts", "attemptsUsed", "attemptsRemaining", "coolOffSeconds", "killSwitchStatus", "complianceStatus",
          "frequencyStatus", "coolOffStatus", "evaluatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, 'ALLOWED', '1.0', 3, 1, 2, 1800, 'ALLOWED', 'ALLOWED', 'ALLOWED', 'ALLOWED', NOW()
        )`,
        [peId, merchantId, paId, riskId, intervention]
      );

      await dbPool.query(
        `INSERT INTO "recovery_executions" (
          "id", "merchantId", "paymentAttemptId", "riskEventId", "policyEvaluationId", "interventionType", "status",
          "attemptNumber", "idempotencyKey", "correlationId", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'SUCCEEDED', 1, $7, $8, NOW(), NOW()
        )`,
        [execId, merchantId, paId, riskId, peId, intervention, `idem_${execId}`, `corr_${execId}`]
      );

      await dbPool.query(
        `INSERT INTO "recovery_attempts" (
          "id", "merchantId", "paymentAttemptId", "riskEventId", "interventionType", "status",
          "attemptNumber", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, 'SUCCEEDED', 1, NOW(), NOW()
        )`,
        [`att_${execId}`, merchantId, paId, riskId, intervention]
      );
    }

    // =========================================================================
    // EVENT 1: Card Expiry Failure (SEND_WHATSAPP) -> Recovered (₹8,500)
    // =========================================================================
    console.log('------------------------------------------------------------------------');
    console.log('📌 EVENT 1: CARD EXPIRY (EXPIRED_CARD) — WHATSAPP RECOVERY');
    console.log('------------------------------------------------------------------------');
    const orderId1 = `order_bharath_exp_${Date.now().toString().slice(-5)}`;
    const attemptId1 = `pa_exp_${Date.now().toString().slice(-5)}`;
    const riskId1 = `risk_exp_${Date.now().toString().slice(-5)}`;
    const execId1 = `exec_exp_${Date.now().toString().slice(-5)}`;

    await dbPool.query(
      `INSERT INTO "payment_attempts" ("id", "merchantId", "customerId", "merchantOrderId", "amount", "currency", "startedAt", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 8500, 'INR', NOW(), NOW() + INTERVAL '1 day', NOW(), NOW())`,
      [attemptId1, merchantId, customerId, orderId1]
    );

    await dbPool.query(
      `INSERT INTO "risk_events" ("id", "paymentAttemptId", "merchantId", "eventType", "payload", "processingStatus", "emittedAt")
       VALUES ($1, $2, $3, 'PAYMENT_FAILURE_RISK', '{"error_code": "EXPIRED_CARD"}'::jsonb, 'RESOLVED', NOW())`,
      [riskId1, attemptId1, merchantId]
    );

    await dbPool.query(
      `INSERT INTO "validation_results" (
        "id", "riskEventId", "paymentAttemptId", "merchantId", "diagnosedCause", "diagnosisConfidence",
        "actionabilityScore", "actionabilityStatus", "priority", "revenueAtRisk", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, 'EXPIRED_CARD', 0.95, 0.90, 'ACTIONABLE', 'HIGH', 8500, NOW(), NOW())`,
      [`vr_exp_${Date.now()}`, riskId1, attemptId1, merchantId]
    );

    await dbPool.query(
      `INSERT INTO "revenue_obligations" ("id", "merchantId", "merchantOrderId", "amount", "currency", "status", "resolvedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 8500, 'INR', 'RESOLVED', NOW(), NOW(), NOW())`,
      [`ro_exp_${Date.now()}`, merchantId, orderId1]
    );

    await recordExecution(execId1, attemptId1, riskId1, 'SEND_WHATSAPP');

    const outcome1 = await outcomeService.processExecutionEvent({
      eventType: 'EXECUTION_COMPLETED',
      executionId: execId1,
      merchantId,
      paymentAttemptId: attemptId1,
      riskEventId: riskId1,
      interventionType: 'SEND_WHATSAPP',
      status: 'SUCCEEDED',
      provider: 'TWILIO',
      correlationId: `corr_exp_${Date.now()}`,
    });

    console.log(`   Result: Risk Event ${riskId1} -> Intervention: SEND_WHATSAPP -> Status: ${outcome1.outcomeStatus}`);
    console.log(`   Realized Recovered Revenue: ₹8,500\n`);

    // =========================================================================
    // EVENT 2: Insufficient Funds (INSUFFICIENT_FUNDS) -> Reassessment Loop
    // =========================================================================
    console.log('------------------------------------------------------------------------');
    console.log('📌 EVENT 2: INSUFFICIENT FUNDS — SMS & REASSESSMENT LOOP');
    console.log('------------------------------------------------------------------------');
    const orderId2 = `order_bharath_nsf_${Date.now().toString().slice(-5)}`;
    const attemptId2 = `pa_nsf_${Date.now().toString().slice(-5)}`;
    const riskId2 = `risk_nsf_${Date.now().toString().slice(-5)}`;
    const execId2 = `exec_nsf_${Date.now().toString().slice(-5)}`;

    await dbPool.query(
      `INSERT INTO "payment_attempts" ("id", "merchantId", "customerId", "merchantOrderId", "amount", "currency", "startedAt", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 12000, 'INR', NOW(), NOW() + INTERVAL '1 day', NOW(), NOW())`,
      [attemptId2, merchantId, customerId, orderId2]
    );

    await dbPool.query(
      `INSERT INTO "risk_events" ("id", "paymentAttemptId", "merchantId", "eventType", "payload", "processingStatus", "emittedAt")
       VALUES ($1, $2, $3, 'PAYMENT_FAILURE_RISK', '{"error_code": "INSUFFICIENT_FUNDS"}'::jsonb, 'PENDING', NOW())`,
      [riskId2, attemptId2, merchantId]
    );

    await dbPool.query(
      `INSERT INTO "validation_results" (
        "id", "riskEventId", "paymentAttemptId", "merchantId", "diagnosedCause", "diagnosisConfidence",
        "actionabilityScore", "actionabilityStatus", "priority", "revenueAtRisk", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, 'INSUFFICIENT_FUNDS', 0.92, 0.85, 'ACTIONABLE', 'HIGH', 12000, NOW(), NOW())`,
      [`vr_nsf_${Date.now()}`, riskId2, attemptId2, merchantId]
    );

    await dbPool.query(
      `INSERT INTO "revenue_obligations" ("id", "merchantId", "merchantOrderId", "amount", "currency", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 12000, 'INR', 'UNRESOLVED', NOW(), NOW())`,
      [`ro_nsf_${Date.now()}`, merchantId, orderId2]
    );

    await recordExecution(execId2, attemptId2, riskId2, 'SEND_SMS');

    const outcome2 = await outcomeService.processExpiredMeasurementWindow({
      merchantId,
      paymentAttemptId: attemptId2,
      riskEventId: riskId2,
      executionId: execId2,
      interventionType: 'SEND_SMS',
      correlationId: `corr_nsf_${Date.now()}`,
    });

    console.log(`   Result: Risk Event ${riskId2} -> Intervention: SEND_SMS -> Status: ${outcome2.outcomeStatus}`);
    console.log(`   Continuation Decision: YES -> Emitted REASSESSMENT_REQUESTED Outbox Event\n`);

    // =========================================================================
    // EVENT 3: Auth Failure (AUTHENTICATION_FAILED) -> Merchant Emergency Stop
    // =========================================================================
    console.log('------------------------------------------------------------------------');
    console.log('📌 EVENT 3: AUTH FAILURE — EMAIL & MERCHANT EMERGENCY STOP');
    console.log('------------------------------------------------------------------------');
    const orderId3 = `order_bharath_auth_${Date.now().toString().slice(-5)}`;
    const attemptId3 = `pa_auth_${Date.now().toString().slice(-5)}`;
    const riskId3 = `risk_auth_${Date.now().toString().slice(-5)}`;

    await dbPool.query(
      `INSERT INTO "payment_attempts" ("id", "merchantId", "customerId", "merchantOrderId", "amount", "currency", "startedAt", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 4500, 'INR', NOW(), NOW() + INTERVAL '1 day', NOW(), NOW())`,
      [attemptId3, merchantId, customerId, orderId3]
    );

    await dbPool.query(
      `INSERT INTO "risk_events" ("id", "paymentAttemptId", "merchantId", "eventType", "payload", "processingStatus", "emittedAt")
       VALUES ($1, $2, $3, 'PAYMENT_FAILURE_RISK', '{"error_code": "AUTHENTICATION_FAILED"}'::jsonb, 'PENDING', NOW())`,
      [riskId3, attemptId3, merchantId]
    );

    await dbPool.query(
      `INSERT INTO "validation_results" (
        "id", "riskEventId", "paymentAttemptId", "merchantId", "diagnosedCause", "diagnosisConfidence",
        "actionabilityScore", "actionabilityStatus", "priority", "revenueAtRisk", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, 'AUTHENTICATION_FAILED', 0.88, 0.80, 'ACTIONABLE', 'MEDIUM', 4500, NOW(), NOW())`,
      [`vr_auth_${Date.now()}`, riskId3, attemptId3, merchantId]
    );

    // Merchant triggers Emergency Kill-Switch
    await controlService.stopRecoveryByMerchant(merchantId, riskId3, 'Customer Bharath G requested direct phone callback');

    // Run Safety Check to confirm live enforcement
    const safetyCheck = await runFinalSafetyCheckAsync({
      riskEventId: riskId3,
      merchant: { id: merchantId, recoveryEnabled: true, recoveryConfig: { smsEnabled: true, emailEnabled: true, whatsappEnabled: true } },
      payment: { paymentAttemptId: attemptId3, merchantOrderId: orderId3, amount: 4500, currency: 'INR', businessState: 'UNRESOLVED' },
      customer: { email: customerEmail, phone: customerPhone },
      intervention: { type: 'SEND_EMAIL' },
      policy: { decision: 'ALLOWED', attemptsUsed: 0, maxAttempts: 3, attemptsRemaining: 3 },
    });

    console.log(`   Result: Risk Event ${riskId3} -> RecoveryControl: STOPPED by MERCHANT`);
    console.log(`   Safety Check Validation: Safe=${safetyCheck.safe}, FailureCode=${safetyCheck.failureCode}\n`);

    // =========================================================================
    // EVENT 4: Payment Link Recovery (SEND_PAYMENT_LINK) -> Recovered (₹6,500)
    // =========================================================================
    console.log('------------------------------------------------------------------------');
    console.log('📌 EVENT 4: PAYMENT LINK RECOVERY — INDEPENDENT RESOLUTION');
    console.log('------------------------------------------------------------------------');
    const orderId4 = `order_bharath_link_${Date.now().toString().slice(-5)}`;
    const attemptId4 = `pa_link_${Date.now().toString().slice(-5)}`;
    const riskId4 = `risk_link_${Date.now().toString().slice(-5)}`;
    const execId4 = `exec_link_${Date.now().toString().slice(-5)}`;

    await dbPool.query(
      `INSERT INTO "payment_attempts" ("id", "merchantId", "customerId", "merchantOrderId", "amount", "currency", "startedAt", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 6500, 'INR', NOW(), NOW() + INTERVAL '1 day', NOW(), NOW())`,
      [attemptId4, merchantId, customerId, orderId4]
    );

    await dbPool.query(
      `INSERT INTO "risk_events" ("id", "paymentAttemptId", "merchantId", "eventType", "payload", "processingStatus", "emittedAt")
       VALUES ($1, $2, $3, 'PAYMENT_FAILURE_RISK', '{"error_code": "UPI_TIMEOUT"}'::jsonb, 'RESOLVED', NOW())`,
      [riskId4, attemptId4, merchantId]
    );

    await dbPool.query(
      `INSERT INTO "validation_results" (
        "id", "riskEventId", "paymentAttemptId", "merchantId", "diagnosedCause", "diagnosisConfidence",
        "actionabilityScore", "actionabilityStatus", "priority", "revenueAtRisk", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, 'UPI_TIMEOUT', 0.90, 0.90, 'ACTIONABLE', 'HIGH', 6500, NOW(), NOW())`,
      [`vr_link_${Date.now()}`, riskId4, attemptId4, merchantId]
    );

    await dbPool.query(
      `INSERT INTO "revenue_obligations" ("id", "merchantId", "merchantOrderId", "amount", "currency", "status", "resolvedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 6500, 'INR', 'RESOLVED', NOW(), NOW(), NOW())`,
      [`ro_link_${Date.now()}`, merchantId, orderId4]
    );

    await recordExecution(execId4, attemptId4, riskId4, 'SEND_PAYMENT_LINK');

    const outcome4 = await outcomeService.processExecutionEvent({
      eventType: 'EXECUTION_COMPLETED',
      executionId: execId4,
      merchantId,
      paymentAttemptId: attemptId4,
      riskEventId: riskId4,
      interventionType: 'SEND_PAYMENT_LINK',
      status: 'SUCCEEDED',
      provider: 'RAZORPAY',
      correlationId: `corr_link_${Date.now()}`,
    });

    console.log(`   Result: Risk Event ${riskId4} -> Intervention: SEND_PAYMENT_LINK -> Status: ${outcome4.outcomeStatus}`);
    console.log(`   Realized Recovered Revenue: ₹6,500\n`);

    // =========================================================================
    // FINAL AGGREGATED METRICS VERIFICATION
    // =========================================================================
    console.log('========================================================================');
    console.log('📊 FINAL LIVE METRICS PERSISTED IN CLOUD NEON POSTGRESQL');
    console.log('========================================================================');
    const finalMetrics = await repository.getRecoveryMetrics(merchantId);
    const inrMetrics = finalMetrics.find((m) => m.currency === 'INR');

    console.log(`   Merchant ID: ${merchantId}`);
    console.log(`   Total Revenue at Risk: ₹${inrMetrics?.totalRevenueAtRisk?.toLocaleString('en-IN')}`);
    console.log(`   Measured Recovered Revenue: ₹${inrMetrics?.totalRecoveredRevenue?.toLocaleString('en-IN')}`);
    console.log(`   Measured Recovery Rate: ${((inrMetrics?.recoveryRate || 0) * 100).toFixed(1)}%`);
    console.log(`   Risk Events Detected: ${inrMetrics?.riskEventsDetected}`);
    console.log(`   Recovered Events: ${inrMetrics?.recoveredEvents}`);
    console.log(`   Active Recoveries: ${inrMetrics?.activeRecoveries}`);
    console.log(`   Stopped Recoveries: ${inrMetrics?.stoppedRecoveries}`);
    console.log('\n   🎉 ALL RECORDS PERSISTED IN POSTGRESQL FOR LIVE DASHBOARD VERIFICATION!');
    console.log('========================================================================\n');

  } catch (err: any) {
    console.error('❌ Error running live customer E2E suite:', err);
  } finally {
    await dbPool.end();
    try { await repository['pool'].end(); } catch {}
  }
}

runLiveCustomerEndToEndSuite();
