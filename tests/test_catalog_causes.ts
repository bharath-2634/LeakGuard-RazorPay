import { getInterventionCandidates } from '../src/domain/catalog/intervention-catalog.js';

const testCauses = [
  'INSUFFICIENT_FUNDS',
  'CREDIT_LIMIT_EXCEEDED',
  'MANUAL_3DS_OTP_ABANDONMENT',
  '3DS_OTP_ABANDONMENT',
  'ACQUIRER_PAYMENT_GATEWAY_TIMEOUT',
  'GATEWAY_TIMEOUT',
  'ISSUING_BANK_OUTAGE',
  'ISSUER_TECHNICAL_FAILURE',
  'TECHNICAL_FAILURE',
  'MERCHANT_TECHNICAL_FAILURE',
  'PAYMENT_INSTRUMENT_EXPIRED_INVALID',
  'EXPIRED_CARD',
  'TRANSACTION_LIMIT_EXCEEDED'
];

console.log('--- TESTING INTERVENTION CATALOG MAPPINGS FOR ALL CAUSES ---\n');

let allMatched = true;

for (const cause of testCauses) {
  const result = getInterventionCandidates({
    diagnosedCause: cause,
    currentState: cause.includes('GATEWAY') ? 'STILL_FAILED' : undefined,
    hasPersistentFailure: cause === 'TECHNICAL_FAILURE'
  });

  console.log(`========================================`);
  console.log(`Cause: ${cause}`);
  console.log(`Normalized: ${result.normalizedCause}`);
  console.log(`Candidates (${result.candidates.length}):`);
  result.candidates.forEach((c, idx) => {
    console.log(`  ${idx + 1}. [Priority: ${c.priority}] ${c.type} ${c.bestWhen ? `(Best when: ${c.bestWhen})` : ''} ${c.notes ? `(${c.notes})` : ''}`);
  });

  if (result.rejectedInterventions.length > 0) {
    console.log(`Rejected Interventions (${result.rejectedInterventions.length}):`);
    result.rejectedInterventions.forEach(r => {
      console.log(`  - ${r.type}: ${r.reason}`);
    });
  }

  if (result.candidates.length === 0) {
    console.error(`❌ NO CANDIDATES FOUND FOR CAUSE: ${cause}`);
    allMatched = false;
  }
}

if (allMatched) {
  console.log(`\n✅ ALL ${testCauses.length} CAUSES SUCCESSFULLY MATCHED CATALOG CANDIDATES!`);
} else {
  console.error(`\n❌ SOME CAUSES MISSED CANDIDATE MATCHES!`);
}
