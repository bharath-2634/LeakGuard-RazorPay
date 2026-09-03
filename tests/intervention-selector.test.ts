import { GeminiInterventionSelector } from '../src/recovery/intervention/selection/gemini-selector.js';
import { InterventionSelectionService } from '../src/recovery/intervention/selection/selection-service.js';
import { calculateDeterministicFallback } from '../src/recovery/intervention/selection/fallback-selector.js';
import { validateGeminiOutput } from '../src/recovery/intervention/selection/validator.js';
import { getEligibleInterventionsForContext } from '../src/recovery/intervention/catalog/intervention-catalog.js';
import { InterventionDefinition } from '../src/recovery/intervention/catalog/intervention.types.js';
import { RecoveryContext } from '../src/recovery/intervention/selection/selection.types.js';

class MockGeminiSelector extends GeminiInterventionSelector {
  private mockResponse: string;

  constructor(mockResponse: string) {
    super('mock_api_key');
    this.mockResponse = mockResponse;
  }

  async select(context: RecoveryContext, candidates: InterventionDefinition[]) {
    const candidateTypes = candidates.map((c) => c.type);
    const validation = validateGeminiOutput(this.mockResponse, candidateTypes);

    if (!validation.valid || !validation.rankedCandidates) {
      const fallback = calculateDeterministicFallback(context, candidates);
      return {
        selector: 'deterministic-fallback',
        selectorVersion: 'v1.0.0',
        rankedCandidates: fallback.rankedCandidates,
        selectedCandidate: fallback.rankedCandidates[0],
        reasoningSummary: fallback.reasoningSummary,
        fallbackUsed: true,
        correlationId: 'test_corr',
        status: 'COMPLETED' as const
      };
    }

    return {
      selector: 'GeminiInterventionSelector',
      selectorVersion: 'v1.0.0',
      model: 'mock-gemini',
      rankedCandidates: validation.rankedCandidates,
      selectedCandidate: validation.rankedCandidates[0],
      reasoningSummary: validation.reasoningSummary || 'Mock Gemini ranking',
      fallbackUsed: false,
      correlationId: 'test_corr',
      status: 'COMPLETED' as const
    };
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING INTERVENTION SELECTION ENGINE AUTOMATED TEST SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${details || 'Assertion failed'}`);
      failed++;
    }
  }

  const sampleContext: RecoveryContext = {
    metadata: { correlationId: 'corr_test_101' },
    event: { riskEventId: 'evt_101', paymentAttemptId: 'pa_101', merchantId: 'm_101', merchantOrderId: 'ord_101', amount: 8500, currency: 'INR' },
    diagnosis: { cause: '3DS_OTP_ABANDONMENT', confidence: 0.95, actionabilityScore: 94, actionabilityStatus: 'HIGHLY_ACTIONABLE', priority: 'HIGH' },
    economics: { revenueAtRisk: 8500, economicFactor: 0.15, expectedRecoveryValue: 807.5, netExpectedRecovery: 757.5, minimumRecoveryThreshold: 0, maxRecoveryCost: 0 },
    customer: { id: 'cust_101', name: 'Priya Patel', email: 'priya@example.com', phone: '+919876543210' },
    merchant: {
      id: 'm_101', name: 'TechStore', timezone: 'Asia/Kolkata', defaultCurrency: 'INR',
      recoveryConfig: { emailEnabled: true, smsEnabled: true, whatsappEnabled: true, humanReviewEnabled: true, humanReviewEmail: 'team@techstore.com', version: 1 }
    },
    payment: { paymentAttemptId: 'pa_101', providerState: 'FAILED', businessState: 'UNRESOLVED' },
    order: { merchantOrderId: 'ord_101', amount: 8500, currency: 'INR', category: 'home_appliances' }
  };

  const eligibleCandidates = getEligibleInterventionsForContext({
    cause: '3DS_OTP_ABANDONMENT',
    customerData: { email: 'priya@example.com', phone: '+919876543210' },
    merchantConfig: { emailEnabled: true, smsEnabled: true, whatsappEnabled: true, humanReviewEnabled: true }
  });

  // --------------------------------------------------------------------------
  // TEST 1: Normal Gemini Ranking
  // --------------------------------------------------------------------------
  console.log('Running Test 1: Normal Gemini Ranking...');
  const liveSelector = new GeminiInterventionSelector();
  const res1 = await liveSelector.select(sampleContext, eligibleCandidates);

  assert(
    res1.rankedCandidates.length === eligibleCandidates.length &&
      res1.rankedCandidates.every((rc) => eligibleCandidates.some((ec) => ec.type === rc.interventionType)),
    'Test 1: Normal Gemini Ranking',
    `Ranked ${res1.rankedCandidates.length}/${eligibleCandidates.length} candidates`
  );

  // --------------------------------------------------------------------------
  // TEST 2: Candidate Whitelist Violation (Hallucinated Candidate)
  // --------------------------------------------------------------------------
  console.log('\nRunning Test 2: Candidate Whitelist Violation...');
  const mockHallucinated = JSON.stringify({
    reasoningSummary: 'Hallucinated intervention test',
    rankedCandidates: [
      { interventionType: 'UNKNOWN_HALLUCINATED_INTERVENTION', rank: 1, score: 90, rationale: 'Invalid', expectedOutcome: 'Fail', risks: [] }
    ]
  });
  const selector2 = new MockGeminiSelector(mockHallucinated);
  const service2 = new InterventionSelectionService(selector2);
  const res2 = await service2.processRecoveryContext(sampleContext);

  assert(
    res2.fallbackUsed === true && res2.selector === 'deterministic-fallback',
    'Test 2: Whitelist Violation Triggers Deterministic Fallback',
    `Fallback state: ${res2.fallbackUsed}, selector: ${res2.selector}`
  );

  // --------------------------------------------------------------------------
  // TEST 3: Invalid JSON Output
  // --------------------------------------------------------------------------
  console.log('\nRunning Test 3: Invalid JSON Output...');
  const selector3 = new MockGeminiSelector('This is not JSON text at all!');
  const service3 = new InterventionSelectionService(selector3);
  const res3 = await service3.processRecoveryContext(sampleContext);

  assert(
    res3.fallbackUsed === true && res3.selector === 'deterministic-fallback',
    'Test 3: Malformed JSON Triggers Deterministic Fallback',
    `Fallback state: ${res3.fallbackUsed}`
  );

  // --------------------------------------------------------------------------
  // TEST 4: Missing Candidates in Output
  // --------------------------------------------------------------------------
  console.log('\nRunning Test 4: Missing Candidates in Output...');
  const mockIncomplete = JSON.stringify({
    reasoningSummary: 'Only returned 1 candidate instead of 4',
    rankedCandidates: [
      { interventionType: 'SEND_WHATSAPP', rank: 1, score: 95, rationale: 'Valid candidate', expectedOutcome: 'Pass', risks: [] }
    ]
  });
  const selector4 = new MockGeminiSelector(mockIncomplete);
  const service4 = new InterventionSelectionService(selector4);
  const res4 = await service4.processRecoveryContext(sampleContext);

  assert(
    res4.fallbackUsed === true && res4.selector === 'deterministic-fallback',
    'Test 4: Missing Candidates Triggers Deterministic Fallback',
    `Fallback state: ${res4.fallbackUsed}`
  );

  // --------------------------------------------------------------------------
  // TEST 5: Duplicate Candidates in Output
  // --------------------------------------------------------------------------
  console.log('\nRunning Test 5: Duplicate Candidates in Output...');
  const mockDuplicate = JSON.stringify({
    reasoningSummary: 'Duplicate candidates included',
    rankedCandidates: [
      { interventionType: 'SEND_WHATSAPP', rank: 1, score: 95, rationale: 'WhatsApp', expectedOutcome: 'Pass', risks: [] },
      { interventionType: 'SEND_WHATSAPP', rank: 2, score: 85, rationale: 'Duplicate WhatsApp', expectedOutcome: 'Pass', risks: [] }
    ]
  });
  const selector5 = new MockGeminiSelector(mockDuplicate);
  const service5 = new InterventionSelectionService(selector5);
  const res5 = await service5.processRecoveryContext(sampleContext);

  assert(
    res5.fallbackUsed === true && res5.selector === 'deterministic-fallback',
    'Test 5: Duplicate Candidates Trigger Deterministic Fallback',
    `Fallback state: ${res5.fallbackUsed}`
  );

  // --------------------------------------------------------------------------
  // TEST 6: Invalid Score (Out of range)
  // --------------------------------------------------------------------------
  console.log('\nRunning Test 6: Out-of-Range Score...');
  const mockInvalidScore = JSON.stringify({
    reasoningSummary: 'Invalid score returned',
    rankedCandidates: eligibleCandidates.map((c, idx) => ({
      interventionType: c.type,
      rank: idx + 1,
      score: 500, // Invalid score > 100
      rationale: 'Out of range',
      expectedOutcome: 'Fail',
      risks: []
    }))
  });
  const selector6 = new MockGeminiSelector(mockInvalidScore);
  const service6 = new InterventionSelectionService(selector6);
  const res6 = await service6.processRecoveryContext(sampleContext);

  assert(
    res6.fallbackUsed === true && res6.selector === 'deterministic-fallback',
    'Test 6: Out-of-Range Score Triggers Deterministic Fallback',
    `Fallback state: ${res6.fallbackUsed}`
  );

  // --------------------------------------------------------------------------
  // TEST 7: Empty Candidates Array
  // --------------------------------------------------------------------------
  console.log('\nRunning Test 7: Empty Candidates Array...');
  const emptyContext: RecoveryContext = {
    ...sampleContext,
    diagnosis: { cause: 'UNKNOWN_UNMAPPED_CAUSE' },
    customer: {},
    merchant: {
      id: 'm_101', name: 'NoConfigStore', timezone: 'UTC', defaultCurrency: 'USD',
      recoveryConfig: { emailEnabled: false, smsEnabled: false, whatsappEnabled: false, humanReviewEnabled: false, version: 1 }
    }
  };
  const service7 = new InterventionSelectionService();
  const res7 = await service7.processRecoveryContext(emptyContext);

  assert(
    res7.status === 'NO_ELIGIBLE_INTERVENTIONS' && res7.rankedCandidates.length === 0,
    'Test 7: Empty Candidates Array Returns NO_ELIGIBLE_INTERVENTIONS without Gemini',
    `Status: ${res7.status}, Candidates: ${res7.rankedCandidates.length}`
  );

  // --------------------------------------------------------------------------
  // TEST 8: Already Resolved Payment
  // --------------------------------------------------------------------------
  console.log('\nRunning Test 8: Already Resolved Payment...');
  const resolvedContext: RecoveryContext = {
    ...sampleContext,
    payment: { paymentAttemptId: 'pa_101', providerState: 'CAPTURED', businessState: 'RESOLVED' }
  };
  const service8 = new InterventionSelectionService();
  const res8 = await service8.processRecoveryContext(resolvedContext);

  assert(
    res8.status === 'STOPPED_ALREADY_RESOLVED' && res8.rankedCandidates.length === 0,
    'Test 8: Already Resolved Payment Stops Execution immediately',
    `Status: ${res8.status}`
  );

  // --------------------------------------------------------------------------
  // TEST 9: Merchant Channel Restriction
  // --------------------------------------------------------------------------
  console.log('\nRunning Test 9: Merchant Channel Restriction...');
  const noWhatsappCandidates = getEligibleInterventionsForContext({
    cause: '3DS_OTP_ABANDONMENT',
    customerData: { email: 'priya@example.com', phone: '+919876543210' },
    merchantConfig: { emailEnabled: true, smsEnabled: true, whatsappEnabled: false, humanReviewEnabled: true }
  });

  const hasWhatsapp = noWhatsappCandidates.some((c) => c.type === 'SEND_WHATSAPP');
  assert(
    !hasWhatsapp,
    'Test 9: Disabled WhatsApp in Merchant Config Excludes SEND_WHATSAPP from Candidate Set',
    `Candidates: [${noWhatsappCandidates.map((c) => c.type).join(', ')}]`
  );

  // --------------------------------------------------------------------------
  // TEST 10: Deterministic Fallback Repeatability
  // --------------------------------------------------------------------------
  console.log('\nRunning Test 10: Deterministic Fallback Repeatability...');
  const runA = calculateDeterministicFallback(sampleContext, eligibleCandidates);
  const runB = calculateDeterministicFallback(sampleContext, eligibleCandidates);

  const isIdentical =
    runA.rankedCandidates.length === runB.rankedCandidates.length &&
    runA.rankedCandidates.every((rc, idx) => rc.interventionType === runB.rankedCandidates[idx].interventionType && rc.score === runB.rankedCandidates[idx].score);

  assert(
    isIdentical,
    'Test 10: Deterministic Fallback Produces Identical Ordering across runs',
    `Run A: ${runA.rankedCandidates.map((c) => `${c.interventionType}:${c.score}`).join(', ')}`
  );

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('❌ Test suite runner error:', err);
  process.exit(1);
});
