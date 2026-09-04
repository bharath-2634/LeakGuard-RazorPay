import assert from 'node:assert/strict';
import { createStrategies } from '../src/execution/strategy/strategies.js';
import { MockPaymentLinkAdapter } from '../src/execution/providers/mock.adapter.js';
import { generateRecoveryContent } from '../src/execution/content/recovery-content-generator.js';

const context = {
  executionRequestId: 'request-link-test',
  merchant: {
    id: 'merchant-link-test', name: 'Test Store', timezone: 'UTC', defaultCurrency: 'INR', recoveryEnabled: true,
    recoveryConfig: { emailEnabled: true, smsEnabled: true, whatsappEnabled: true, humanReviewEnabled: false },
  },
  customer: { id: 'customer-link-test', externalCustomerId: null, name: 'Bharath', email: 'bharath@example.com', phone: '+917845425982' },
  payment: { paymentAttemptId: 'payment-link-test', merchantOrderId: 'order-link-test', razorpayOrderId: null, amount: 100, currency: 'INR', providerState: 'FAILED', businessState: 'UNRESOLVED', revenueObligationStatus: 'UNRESOLVED' },
  intervention: { type: 'SEND_SMS', rank: 1 },
  policy: { evaluationId: 'policy-link-test', decision: 'ALLOWED' as const, policyVersion: 'v1', maxAttempts: 3, attemptsUsed: 0, attemptsRemaining: 3, coolOffSeconds: 0 },
  diagnosis: { cause: 'INSUFFICIENT_FUNDS', confidence: 0.9, actionabilityScore: 90, priority: 'HIGH' },
  economics: {}, evidence: {}, correlationId: 'correlation-link-test',
};

const link = await new MockPaymentLinkAdapter('RAZORPAY', ['PAYMENT_LINK']).createPaymentLink({
  actionType: 'PAYMENT_LINK', interventionType: 'SEND_PAYMENT_LINK', provider: 'RAZORPAY', amount: 100, currency: 'INR', merchantOrderId: 'order-link-test',
});
assert.equal(link.success, true);
assert.ok(link.paymentLinkUrl);

const content = generateRecoveryContent(context as any, link.paymentLinkUrl);
assert.match(content.body, new RegExp(link.paymentLinkUrl!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.equal(content.body.includes('{{PAYMENT_LINK}}'), false);

const smsAction = await createStrategies().find((strategy) => strategy.supports('SEND_SMS'))!.execute(context as any);
const finalSms = { ...smsAction, content: smsAction.content!.replaceAll('{{PAYMENT_LINK}}', link.paymentLinkUrl!) };
assert.match(finalSms.content!, /https:\/\/pay\.example\.test\//);
assert.equal(finalSms.content!.includes('{{PAYMENT_LINK}}'), false);

process.env.TWILIO_WHATSAPP_CONTENT_VARIABLES = '{"1":"{{customerName}}","2":"{{amount}}"}';
process.env.TWILIO_WHATSAPP_PAYMENT_LINK_VARIABLE = '3';
const { buildContentVariables } = await import('../src/execution/providers/live.adapters.js');
const templateVariables = buildContentVariables({
  actionType: 'WHATSAPP_MESSAGE',
  interventionType: 'SEND_WHATSAPP',
  provider: 'TWILIO',
  recipient: context.customer.phone!,
  content: content.body,
  metadata: { customerName: 'Bharath', amount: 'INR 100', paymentLinkUrl: link.paymentLinkUrl },
});
assert.equal(JSON.parse(templateVariables)['3'], link.paymentLinkUrl);

console.log('Payment link tests passed');
