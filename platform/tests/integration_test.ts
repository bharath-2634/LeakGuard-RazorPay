import { prisma } from '../src/infrastructure/db/prisma-client.js';
import { OutboxPublisher } from '../src/infrastructure/queue/bullmq-client.js';
import { correlationEngine } from '../src/domain/payment/correlation-engine.js';

async function runE2EIntegration() {
  console.log('--- STARTING E2E SDK -> VALIDATION INTEGRATION TEST ---');

  const merchantId = 'm_test_e2e_01';
  const merchantOrderId = 'order_e2e_01';
  const paymentAttemptId = 'pa_e2e_01';
  
  // Cleanup
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { startsWith: 'risk_' } } });
  await prisma.riskEvent.deleteMany({ where: { merchantId } });
  await prisma.paymentEvent.deleteMany({ where: { paymentAttemptId } });
  await prisma.revenueObligation.deleteMany({ where: { merchantId } });
  await prisma.paymentAttempt.deleteMany({ where: { merchantId } });
  await prisma.merchantEconomics.deleteMany({ where: { merchantId } });
  await prisma.merchant.deleteMany({ where: { id: merchantId } });

  console.log('[1] Setting up Merchant and Economics in DB...');
  await prisma.merchant.create({
    data: { id: merchantId, name: 'E2E Test Merchant', domain: 'e2e.com', razorpayKeyId: 'rzp_e2e', razorpaySecretRef: 'encrypted_e2e' }
  });

  await prisma.merchantEconomics.create({
    data: { merchantId, defaultMarginRate: 0.3, minimumRecoveryThreshold: 10, baseRecoveryCost: 5 }
  });

  await prisma.paymentAttempt.create({
    data: { id: paymentAttemptId, merchantId, merchantOrderId, amount: 1500, currency: 'INR', providerState: 'failed', startedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) }
  });
  await prisma.revenueObligation.create({
    data: { merchantId, merchantOrderId, amount: 1500, currency: 'INR', status: 'UNRESOLVED' }
  });

  console.log('[2] Processing Razorpay Webhook through Correlation Engine...');
  
  const webhookResult = await correlationEngine.processRazorpayWebhook({
    merchantId,
    eventType: 'payment.failed',
    payload: {
      payload: {
        payment: {
          entity: {
            id: paymentAttemptId,
            order_id: merchantOrderId,
            error_code: 'BAD_REQUEST_ERROR',
            error_description: 'Insufficient funds in account',
            error_source: 'issuer',
            error_step: 'payment_authorization',
            error_reason: 'insufficient_funds'
          }
        }
      }
    }
  });

  console.log('Webhook Processed:', webhookResult);

  console.log('[3] Starting Outbox Relay...');
  const relayed = await OutboxPublisher.relayPendingEvents();
  console.log(`Relayed ${relayed} events to BullMQ (risk-validation queue)`);
  
  console.log('✅ SDK side complete. Check the terminal where ValidationWorker is running.');
  setTimeout(() => process.exit(0), 3000);
}

runE2EIntegration().catch(console.error);
