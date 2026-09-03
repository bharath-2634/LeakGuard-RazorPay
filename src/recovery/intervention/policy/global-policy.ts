import { GlobalPolicy } from './policy.types.js';

export const GLOBAL_POLICY_VERSION = 'global-v1';

export const GLOBAL_SAFE_DEFAULTS: GlobalPolicy = Object.freeze({
  RETRY_PAYMENT: { maxAttempts: 2, coolOffSeconds: 300 },
  SEND_SMS: { maxAttempts: 3, coolOffSeconds: 1800 },
  SEND_WHATSAPP: { maxAttempts: 3, coolOffSeconds: 1800 },
  SEND_EMAIL: { maxAttempts: 3, coolOffSeconds: 3600 },
  HUMAN_REVIEW: { maxAttempts: 1, coolOffSeconds: 0 },
  SEND_PAYMENT_LINK: { maxAttempts: 3, coolOffSeconds: 1800 },
  CHANGE_PAYMENT_METHOD_PROMPT: { maxAttempts: 3, coolOffSeconds: 1800 },
});
