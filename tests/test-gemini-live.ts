import { GeminiInterventionSelector } from '../src/recovery/intervention/selection/gemini-selector.js';
import { getEligibleInterventionsForContext } from '../src/recovery/intervention/catalog/intervention-catalog.js';

async function testLiveGemini() {
  console.log('Testing Live Gemini API Call...');
  const selector = new GeminiInterventionSelector();

  const candidates = getEligibleInterventionsForContext({
    cause: '3DS_OTP_ABANDONMENT',
    customerData: { email: 'test@example.com', phone: '+919876543210' },
    merchantConfig: { emailEnabled: true, smsEnabled: true, whatsappEnabled: true, humanReviewEnabled: true }
  });

  const res = await selector.select(
    {
      diagnosis: { cause: '3DS_OTP_ABANDONMENT', confidence: 0.95, actionabilityScore: 94, priority: 'HIGH' },
      economics: { revenueAtRisk: 8500, expectedRecoveryValue: 807.5, netExpectedRecovery: 757.5 },
      customer: { email: 'test@example.com', phone: '+919876543210' },
      merchant: { recoveryConfig: { emailEnabled: true, smsEnabled: true, whatsappEnabled: true, humanReviewEnabled: true } }
    },
    candidates
  );

  console.log('\n--- LIVE SELECTION RESULT ---');
  console.log('Selector:', res.selector);
  console.log('Model:', res.model);
  console.log('Fallback Used:', res.fallbackUsed);
  console.log('Reasoning Summary:', res.reasoningSummary);
  console.log('Ranked Candidates:');
  res.rankedCandidates.forEach((c) => {
    console.log(`  #${c.rank} [Score ${c.score}] ${c.interventionType} - ${c.rationale}`);
  });
}

testLiveGemini().catch(console.error);
