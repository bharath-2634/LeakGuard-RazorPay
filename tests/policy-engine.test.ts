import assert from 'node:assert/strict';
import { GLOBAL_SAFE_DEFAULTS } from '../src/recovery/intervention/policy/global-policy.js';
import { getEffectiveBoundary } from '../src/recovery/intervention/policy/boundary-calculator.js';
import { evaluateIntervention } from '../src/recovery/intervention/policy/policy-evaluator.js';

const merchantPolicy = {
  recoveryEnabled: true,
  version: 'merchant-v1',
  SEND_SMS: { allowed: true, maxAttempts: 2, coolOffSeconds: 3600 },
};

const baseEvent = {
  paymentAttemptId: 'pa_test',
  businessState: 'UNRESOLVED',
  providerState: 'FAILED',
};

const boundary = getEffectiveBoundary(
  GLOBAL_SAFE_DEFAULTS,
  merchantPolicy,
  { previousFailedRecoveryAttempts: 1 },
  baseEvent,
  'SEND_SMS',
  []
);

assert.equal(boundary.maxAttempts, 1);
assert.equal(boundary.coolOffSeconds, 3600);
assert.equal(boundary.attemptsUsed, 0);

const unknownCompliance = evaluateIntervention(
  boundary,
  { attemptsUsed: 0 },
  { status: 'UNKNOWN' },
  { recoveryEnabled: true }
);
assert.equal(unknownCompliance.decision, 'REJECTED');
assert.equal(unknownCompliance.checks.compliance, 'FAIL');

const frequencyRejected = evaluateIntervention(
  boundary,
  { attemptsUsed: 1 },
  { status: 'ALLOWED' },
  { recoveryEnabled: true }
);
assert.equal(frequencyRejected.decision, 'REJECTED');
assert.equal(frequencyRejected.checks.frequency, 'FAIL');

const killSwitchRejected = evaluateIntervention(
  boundary,
  { attemptsUsed: 0 },
  { status: 'ALLOWED' },
  { recoveryEnabled: false }
);
assert.equal(killSwitchRejected.decision, 'REJECTED');
assert.equal(killSwitchRejected.checks.killSwitch, 'FAIL');

const humanBoundary = getEffectiveBoundary(
  GLOBAL_SAFE_DEFAULTS,
  { recoveryEnabled: true, version: 'merchant-v1', HUMAN_REVIEW: { allowed: true } },
  {},
  baseEvent,
  'HUMAN_REVIEW',
  []
);
const approvalRequired = evaluateIntervention(
  humanBoundary,
  { attemptsUsed: 0 },
  { status: 'ALLOWED' },
  { recoveryEnabled: true }
);
assert.equal(approvalRequired.decision, 'APPROVAL_REQUIRED');

console.log('Policy engine tests passed');
