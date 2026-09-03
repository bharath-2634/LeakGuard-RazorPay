import {
  getInterventionsForCause,
  getIntervention,
  getEligibleInterventionsForContext,
  INTERVENTION_CATALOG_VERSION
} from '../src/recovery/intervention/catalog/intervention-catalog.js';

console.log('--- EXECUTING SPECIFICATION UNIT TESTS (12 CHECKS) ---\n');

let failedTests = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`✅ PASSED: ${testName}`);
  } else {
    console.error(`❌ FAILED: ${testName}`);
    failedTests++;
  }
}

// 1. Every supported cause returns the expected interventions
const causesToTest = [
  'INSUFFICIENT_FUNDS',
  'CREDIT_LIMIT_EXCEEDED',
  'MANUAL_3DS_OTP_ABANDONMENT',
  'ACQUIRER_PAYMENT_GATEWAY_TIMEOUT',
  'ISSUING_BANK_OUTAGE',
  'TECHNICAL_FAILURE',
  'PAYMENT_INSTRUMENT_EXPIRED_INVALID',
  'TRANSACTION_LIMIT_EXCEEDED'
];

causesToTest.forEach(cause => {
  const interventions = getInterventionsForCause(cause);
  assert(interventions.length > 0, `Cause '${cause}' returns expected candidate interventions`);
});

// 2. INSUFFICIENT_FUNDS does not return RETRY_PAYMENT
const insufficientFunds = getInterventionsForCause('INSUFFICIENT_FUNDS');
assert(!insufficientFunds.some(i => i.type === 'RETRY_PAYMENT'), 'INSUFFICIENT_FUNDS does not return RETRY_PAYMENT');

// 3. PAYMENT_INSTRUMENT_INVALID does not return RETRY_PAYMENT
const invalidInstrument = getInterventionsForCause('PAYMENT_INSTRUMENT_INVALID');
assert(!invalidInstrument.some(i => i.type === 'RETRY_PAYMENT'), 'PAYMENT_INSTRUMENT_INVALID does not return RETRY_PAYMENT');

// 4. TRANSACTION_LIMIT_EXCEEDED does not return RETRY_PAYMENT
const limitExceeded = getInterventionsForCause('TRANSACTION_LIMIT_EXCEEDED');
assert(!limitExceeded.some(i => i.type === 'RETRY_PAYMENT'), 'TRANSACTION_LIMIT_EXCEEDED does not return RETRY_PAYMENT');

// 5. MANUAL_3DS_OTP_ABANDONMENT includes RETRY_PAYMENT
const otpAbandonment = getInterventionsForCause('MANUAL_3DS_OTP_ABANDONMENT');
assert(otpAbandonment.some(i => i.type === 'RETRY_PAYMENT'), 'MANUAL_3DS_OTP_ABANDONMENT includes RETRY_PAYMENT');

// 6. TECHNICAL_FAILURE includes HUMAN_REVIEW
const techFailure = getInterventionsForCause('TECHNICAL_FAILURE');
assert(techFailure.some(i => i.type === 'HUMAN_REVIEW'), 'TECHNICAL_FAILURE includes HUMAN_REVIEW');

// 7. Missing customer email makes SEND_EMAIL statically ineligible
const noEmailEligible = getEligibleInterventionsForContext({
  cause: 'INSUFFICIENT_FUNDS',
  customerData: { phone: '9999999999' },
  merchantConfig: { emailEnabled: true }
});
assert(!noEmailEligible.some(i => i.type === 'SEND_EMAIL'), 'Missing customer email makes SEND_EMAIL statically ineligible');

// 8. Missing phone makes SEND_SMS statically ineligible
const noPhoneSmsEligible = getEligibleInterventionsForContext({
  cause: 'INSUFFICIENT_FUNDS',
  customerData: { email: 'test@example.com' },
  merchantConfig: { smsEnabled: true }
});
assert(!noPhoneSmsEligible.some(i => i.type === 'SEND_SMS'), 'Missing phone makes SEND_SMS statically ineligible');

// 9. Missing phone makes SEND_WHATSAPP statically ineligible
const noPhoneWaEligible = getEligibleInterventionsForContext({
  cause: 'INSUFFICIENT_FUNDS',
  customerData: { email: 'test@example.com' },
  merchantConfig: { whatsappEnabled: true }
});
assert(!noPhoneWaEligible.some(i => i.type === 'SEND_WHATSAPP'), 'Missing phone makes SEND_WHATSAPP statically ineligible');

// 10. Disabled merchant channel makes that intervention statically ineligible
const disabledChannelEligible = getEligibleInterventionsForContext({
  cause: 'INSUFFICIENT_FUNDS',
  customerData: { email: 'test@example.com', phone: '9999999999' },
  merchantConfig: { emailEnabled: false, smsEnabled: false, whatsappEnabled: false }
});
assert(!disabledChannelEligible.some(i => ['SEND_EMAIL', 'SEND_SMS', 'SEND_WHATSAPP'].includes(i.type)), 'Disabled merchant channel makes intervention statically ineligible');

// 11. Unknown intervention type cannot be returned by the catalog
const invalidIntervention = getIntervention('NON_EXISTENT_INTERVENTION' as any);
assert(invalidIntervention === null, 'Unknown intervention type cannot be returned by the catalog');

// 12. Catalog version is exposed
assert(INTERVENTION_CATALOG_VERSION === 'v1', 'Catalog version is exposed as v1');

console.log(`\n========================================`);
if (failedTests === 0) {
  console.log('🎉 ALL 12 CATALOG SPECIFICATION UNIT TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
} else {
  console.error(`❌ ${failedTests} UNIT TESTS FAILED`);
  process.exit(1);
}
