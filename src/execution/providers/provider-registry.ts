import { ProviderAdapter } from './provider-adapter.js';
import { MockProviderAdapter } from './mock.adapter.js';
import { RazorpayAdapter, ResendAdapter, TwilioAdapter } from './live.adapters.js';
import { config } from '../../config/env.js';

export function createProviderRegistry(): ProviderAdapter[] {
  if (config.EXECUTION_MODE === 'live') return [new TwilioAdapter(), new ResendAdapter(), new RazorpayAdapter(), new MockProviderAdapter('INTERNAL', ['PAYMENT_METHOD_PROMPT', 'HUMAN_REVIEW'])];
  return [
    new MockProviderAdapter('TWILIO', ['WHATSAPP_MESSAGE', 'SMS_MESSAGE']),
    new MockProviderAdapter('RESEND', ['EMAIL_MESSAGE']),
    new MockProviderAdapter('RAZORPAY', ['PAYMENT_LINK', 'PAYMENT_RETRY']),
    new MockProviderAdapter('INTERNAL', ['PAYMENT_METHOD_PROMPT', 'HUMAN_REVIEW']),
  ];
}
