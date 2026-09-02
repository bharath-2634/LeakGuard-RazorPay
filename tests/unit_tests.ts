import { runDiagnosis } from '../src/domain/diagnosis-engine.js';
import { determineActionability } from '../src/domain/actionability-engine.js';
import { calculateEconomics } from '../src/domain/economic-engine.js';
import { EventContext, MerchantContext, DiagnosisResult } from '../src/domain/interfaces.js';
import assert from 'node:assert';

function createDummyEvent(overrides: Partial<EventContext> = {}): EventContext {
  return {
    riskEventId: 'test',
    paymentAttemptId: 'pa_test',
    merchantOrderId: 'mo_test',
    amount: 100,
    currency: 'INR',
    providerState: 'failed',
    journeyEvents: [],
    timestamps: { startedAt: new Date(), emittedAt: new Date() },
    ...overrides
  };
}

async function runTests() {
  console.log('--- LEVEL 1: DIAGNOSIS ENGINE ---');

  // Test 1: Provider evidence wins
  const t1Event = createDummyEvent({
    errorReason: 'insufficient_funds',
    journeyEvents: [{ event: 'checkout_closed', metadata: { reason: 'user_dismissed' } }]
  });
  const t1Res = runDiagnosis(t1Event);
  assert.strictEqual(t1Res.diagnosedCause, 'INSUFFICIENT_FUNDS', 'T1 Failed: Should be INSUFFICIENT_FUNDS');
  assert.strictEqual(t1Res.confidence, 0.99, 'T1 Failed: Confidence should be 0.99');
  console.log('✅ Test 1 Passed: Provider evidence wins');

  // Test 2: Issuer failure
  const t2Event = createDummyEvent({
    errorSource: 'issuer',
    errorReason: 'bank_technical_error'
  });
  const t2Res = runDiagnosis(t2Event);
  assert.strictEqual(t2Res.diagnosedCause, 'ISSUER_TECHNICAL_FAILURE', 'T2 Failed: Should be ISSUER_TECHNICAL_FAILURE');
  console.log('✅ Test 2 Passed: Issuer failure');

  // Test 3: No provider evidence
  const t3Event = createDummyEvent({
    journeyEvents: [
      { event: 'checkout_opened' },
      { event: 'payment_method_selected' },
      { event: 'checkout_closed', metadata: { reason: 'user_dismissed' } }
    ]
  });
  const t3Res = runDiagnosis(t3Event);
  assert.strictEqual(t3Res.diagnosedCause, 'CUSTOMER_ABANDONMENT', 'T3 Failed: Should be CUSTOMER_ABANDONMENT');
  assert.ok(t3Res.confidence < 0.99, 'T3 Failed: Confidence should be lower');
  console.log('✅ Test 3 Passed: No provider evidence');

  // Test 4: Conflicting evidence
  const t4Event = createDummyEvent({
    errorReason: 'insufficient_funds',
    journeyEvents: [
      { event: 'merchant_telemetry', payload: { status: 500 } },
      { event: 'checkout_closed', metadata: { reason: 'user_dismissed' } }
    ]
  });
  const t4Res = runDiagnosis(t4Event);
  assert.strictEqual(t4Res.diagnosedCause, 'INSUFFICIENT_FUNDS', 'T4 Failed: Should be INSUFFICIENT_FUNDS');
  console.log('✅ Test 4 Passed: Conflicting evidence (Provider wins)');


  console.log('\n--- LEVEL 1B: ACTIONABILITY ENGINE BOUNDARIES ---');
  // I will test determineActionability logic, but since it has a hardcoded formula, 
  // I will mock the inputs to produce exactly the scores needed.
  // Wait, better to export a status calculation function in actionability-engine and test it directly.
  // Assuming `classifyActionabilityStatus(score)` is available.
  const { classifyActionabilityStatus } = await import('../src/domain/actionability-engine.js');
  
  assert.strictEqual(classifyActionabilityStatus(100), 'HIGHLY_ACTIONABLE');
  assert.strictEqual(classifyActionabilityStatus(90), 'HIGHLY_ACTIONABLE');
  assert.strictEqual(classifyActionabilityStatus(75), 'ACTIONABLE');
  assert.strictEqual(classifyActionabilityStatus(60), 'UNCERTAIN');
  assert.strictEqual(classifyActionabilityStatus(59.99), 'INSUFFICIENT');
  assert.strictEqual(classifyActionabilityStatus(0), 'INSUFFICIENT');
  console.log('✅ Actionability Boundaries Passed');


  console.log('\n--- LEVEL 1C: ECONOMIC ENGINE BOUNDARIES ---');
  
  const baseMerchant: MerchantContext = {
    merchantId: 'm1',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    defaultMarginRate: 0.30,
    categoryEconomics: {},
    baseRecoveryCost: 5,
    minimumRecoveryThreshold: 10,
    maxRecoveryCost: 0,
    economicsVersion: 1
  };
  
  const baseDiagnosis: DiagnosisResult = {
    diagnosedCause: 'DEFAULT',
    confidence: 1,
    evidence: { sources: [], items: [] }
  };

  // ERV = 20000 * 0.30 * 0.80 = 4800
  // NER = 4800 - 5 = 4795
  const eco1Event = createDummyEvent({ amount: 20000 });
  // We need to force P_recovery = 0.80 for testing or test the existing logic. 
  // Let's test the engine's real math using known inputs.
  // We will patch the engine or pass a known Diagnosis cause that sets P = 0.80.
  // Since we don't have a P=0.8 cause, let's just test NER logic.
  
  const eco1Res = calculateEconomics(
    createDummyEvent({ amount: 100 }), 
    { ...baseMerchant, defaultMarginRate: 1.0, baseRecoveryCost: 10, minimumRecoveryThreshold: 0 }, 
    { ...baseDiagnosis, diagnosedCause: 'INSUFFICIENT_FUNDS' } // P=0.25 -> ERV = 100*1*0.25 = 25. NER = 15
  );
  assert.strictEqual(eco1Res.decision, 'PROCEED');
  
  // Test NER = minimumRecoveryThreshold
  const eco2Res = calculateEconomics(
    createDummyEvent({ amount: 100 }), 
    { ...baseMerchant, defaultMarginRate: 1.0, baseRecoveryCost: 15, minimumRecoveryThreshold: 10 }, 
    { ...baseDiagnosis, diagnosedCause: 'INSUFFICIENT_FUNDS' } // P=0.25 -> ERV = 25, NER = 10
  );
  assert.strictEqual(eco2Res.netExpectedRecovery, 10);
  assert.strictEqual(eco2Res.decision, 'PROCEED', 'Failed: NER = min should PROCEED');

  // Test NER = minimumRecoveryThreshold - 0.01
  const eco3Res = calculateEconomics(
    createDummyEvent({ amount: 100 }), 
    { ...baseMerchant, defaultMarginRate: 1.0, baseRecoveryCost: 15.01, minimumRecoveryThreshold: 10 }, 
    { ...baseDiagnosis, diagnosedCause: 'INSUFFICIENT_FUNDS' } // P=0.25 -> ERV = 25, NER = 9.99
  );
  assert.ok(Math.abs(eco3Res.netExpectedRecovery - 9.99) < 0.001);
  assert.strictEqual(eco3Res.decision, 'STOP', 'Failed: NER < min should STOP');

  // Test RecoveryCost = maxRecoveryCost
  const eco4Res = calculateEconomics(
    createDummyEvent({ amount: 1000 }), 
    { ...baseMerchant, defaultMarginRate: 1.0, baseRecoveryCost: 50, minimumRecoveryThreshold: 0, maxRecoveryCost: 50 }, 
    { ...baseDiagnosis, diagnosedCause: 'INSUFFICIENT_FUNDS' } 
  );
  assert.strictEqual(eco4Res.decision, 'PROCEED', 'Failed: Cost = max should PROCEED');

  // Test RecoveryCost = maxRecoveryCost + 0.01
  const eco5Res = calculateEconomics(
    createDummyEvent({ amount: 1000 }), 
    { ...baseMerchant, defaultMarginRate: 1.0, baseRecoveryCost: 50.01, minimumRecoveryThreshold: 0, maxRecoveryCost: 50 }, 
    { ...baseDiagnosis, diagnosedCause: 'INSUFFICIENT_FUNDS' } 
  );
  assert.strictEqual(eco5Res.decision, 'STOP', 'Failed: Cost > max should STOP');
  
  console.log('✅ Economic Boundaries Passed');
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err.message);
  process.exit(1);
});
