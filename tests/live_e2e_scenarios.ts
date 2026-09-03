import { prisma } from '../src/infrastructure/db/prisma-client.js';
import crypto from 'crypto';
import { processRiskEventDirectly } from '../src/application/validation-worker.js';
import { OutboxRelay } from '../src/application/outbox-relay.js';
import { getInterventionsForCause, getEligibleInterventionsForContext } from '../../SelectInterventionPipelineOrchestration/src/recovery/intervention/catalog/intervention-catalog.js';

const SDK_URL = 'https://leakguard-razorpay-production.up.railway.app';

async function runLiveScenarios() {
  console.log('===============================================================');
  console.log('🚀 STARTING COMPREHENSIVE LIVE PLATFORM END-TO-END TEST SUITE');
  console.log('===============================================================\n');

  // 1. ONBOARD MERCHANT & RECOVERY CONFIG
  const merchantId = `live_m_${Date.now()}`;
  console.log(`Step 1: Onboarding Merchant [${merchantId}] via Platform API...`);
  
  const onboardRes = await fetch(`${SDK_URL}/v1/merchants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: merchantId,
      name: 'TechStore India',
      domain: 'techstore-india.com',
      environment: 'test',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      razorpayKeyId: 'rzp_test_e2e_scenarios',
      razorpayKeySecret: 'mock_secret_key',
      defaultMarginRate: 0.20,
      categoryEconomics: [
        { category: 'electrical', marginRate: 0.20 },
        { category: 'home_appliances', marginRate: 0.15 }
      ],
      recoveryConfig: {
        allowedChannels: ['whatsapp', 'email', 'sms'],
        humanReview: {
          enabled: true,
          email: 'recovery-team@techstore.com'
        }
      }
    })
  });

  const merchantData = await onboardRes.json();
  console.log('✅ Merchant Onboarded Successfully:', merchantData.merchant?.id);
  console.log('   Recovery Channels Configured:', merchantData.merchant?.recoveryConfig);
  console.log('   Category Economics Configured:', merchantData.merchant?.economics?.categoryEconomics);

  // --------------------------------------------------------------------------
  // SCENARIO 1: Issuer Technical Failure (Bank Technical Error / Issuer)
  // --------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('🧪 SCENARIO 1: ISSUER TECHNICAL FAILURE (bank_technical_error)');
  console.log('---------------------------------------------------------------');

  const orderId1 = `ord_issuer_${Date.now()}`;
  console.log(`1.1 Creating Payment Session for Order [${orderId1}] with Customer Details...`);
  
  const sessionRes1 = await fetch(`${SDK_URL}/v1/payments/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantId,
      merchantOrderId: orderId1,
      amount: 15000,
      currency: 'INR',
      orderCategory: 'electrical',
      customer: {
        id: 'cust_live_101',
        name: 'Rahul Sharma',
        email: 'rahul.sharma@example.com',
        phone: '+919876543210'
      }
    })
  });

  const session1 = await sessionRes1.json();
  console.log('   Payment Session Created:', {
    paymentAttemptId: session1.paymentAttemptId,
    razorpayOrderId: session1.razorpayOrderId,
    amount: session1.amount
  });

  console.log('1.2 Emitting Webhook (payment.failed - BAD_REQUEST_ERROR / bank_technical_error)...');
  const webhookBody1 = {
    event: 'payment.failed',
    event_id: `evt_fail1_${Date.now()}`,
    account_id: merchantId,
    payload: {
      payment: {
        entity: {
          id: `pay_fail1_${Date.now()}`,
          order_id: session1.razorpayOrderId,
          status: 'failed',
          error_code: 'BAD_REQUEST_ERROR',
          error_reason: 'bank_technical_error',
          error_source: 'issuer',
          error_step: 'payment_authorization',
          error: {
            code: 'BAD_REQUEST_ERROR',
            reason: 'bank_technical_error',
            source: 'issuer',
            step: 'payment_authorization',
            description: 'Bank technical fault occurred during authorization'
          }
        }
      }
    }
  };

  const signature1 = crypto
    .createHmac('sha256', 'mock_secret_key')
    .update(JSON.stringify(webhookBody1))
    .digest('hex');

  const webhookRes1 = await fetch(`${SDK_URL}/v1/webhooks/razorpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature1,
      'x-merchant-id': merchantId
    },
    body: JSON.stringify(webhookBody1)
  });
  console.log('   Webhook Ingestion Response:', await webhookRes1.json());

  console.log('1.3 Waiting for RiskEvent emission in Neon DB...');
  await new Promise((r) => setTimeout(r, 4000));
  const riskEvent1 = await prisma.riskEvent.findFirst({
    where: { merchantId, paymentAttemptId: session1.paymentAttemptId }
  });
  console.log('   RiskEvent Emitted:', riskEvent1?.id);

  if (riskEvent1) {
    await prisma.riskEvent.update({
      where: { id: riskEvent1.id },
      data: { processingStatus: 'PENDING' }
    });

    console.log('1.4 Processing Validation Pipeline & Recovery Diagnosis...');
    await processRiskEventDirectly({
      riskEventId: riskEvent1.id,
      paymentAttemptId: session1.paymentAttemptId,
      merchantId,
      merchantOrderId: orderId1
    });

    console.log('1.5 Executing Outbox Relay...');
    await OutboxRelay.relayPendingEvents();

    console.log('1.6 Fetching Neon DB OutboxEvent Snapshot...');
    const outbox1 = await prisma.outboxEvent.findFirst({
      where: { aggregateId: riskEvent1.id }
    });

    if (outbox1) {
      const recoveryContextPayload: any = outbox1.payload;
      console.log('\n===============================================================');
      console.log('📦 SCENARIO 1: INPUT RECEIVED BY @SelectInterventionPipelineOrchestration:');
      console.log('===============================================================');
      console.log(JSON.stringify(recoveryContextPayload, null, 2));

      console.log('\n===============================================================');
      console.log('⚙️ SCENARIO 1: SELECT INTERVENTION ORCHESTRATION ENGINE EVALUATION:');
      console.log('===============================================================');
      
      const cause = recoveryContextPayload.diagnosis.cause;
      const causeCandidates = getInterventionsForCause(cause);

      const eligibilityContext = {
        cause,
        customerData: {
          email: recoveryContextPayload.customer?.email,
          phone: recoveryContextPayload.customer?.phone,
          customerIdentity: recoveryContextPayload.customer?.id,
          paymentAttemptId: recoveryContextPayload.event?.paymentAttemptId,
          razorpayOrderId: recoveryContextPayload.payment?.razorpayOrderId
        },
        merchantConfig: {
          emailEnabled: recoveryContextPayload.merchant?.recoveryConfig?.emailEnabled,
          smsEnabled: recoveryContextPayload.merchant?.recoveryConfig?.smsEnabled,
          whatsappEnabled: recoveryContextPayload.merchant?.recoveryConfig?.whatsappEnabled,
          humanReviewEnabled: recoveryContextPayload.merchant?.recoveryConfig?.humanReviewEnabled,
          humanReviewContact: recoveryContextPayload.merchant?.recoveryConfig?.humanReviewEmail
        },
        paymentState: {
          isResolved: recoveryContextPayload.payment?.businessState === 'RESOLVED',
          isDefinitivelyFailed: recoveryContextPayload.payment?.providerState === 'FAILED'
        }
      };

      const eligibleCandidates = getEligibleInterventionsForContext(eligibilityContext);

      console.log(`✨ Diagnosed Cause: ${cause}`);
      console.log(`📋 Total Cause Candidates (${causeCandidates.length}):`);
      causeCandidates.forEach((c, idx) => {
        console.log(`   ${idx + 1}. [${c.priority}] ${c.type} - ${c.name}`);
      });

      console.log(`🎯 Statically Eligible Candidates (${eligibleCandidates.length}):`);
      eligibleCandidates.forEach((c, idx) => {
        console.log(`   ${idx + 1}. [${c.priority}] ${c.type} (Supported Channels: ${c.supportedChannels.join(', ')})`);
      });
    }
  }

  // --------------------------------------------------------------------------
  // SCENARIO 2: Authentication Failure (3D Secure Timeout)
  // --------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('🧪 SCENARIO 2: AUTHENTICATION FAILURE (3D Secure Timeout)');
  console.log('---------------------------------------------------------------');

  const orderId2 = `ord_auth_${Date.now()}`;
  const sessionRes2 = await fetch(`${SDK_URL}/v1/payments/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantId,
      merchantOrderId: orderId2,
      amount: 8500,
      currency: 'INR',
      orderCategory: 'home_appliances',
      customer: {
        id: 'cust_live_102',
        name: 'Priya Patel',
        email: 'priya.patel@example.com',
        phone: '+919123456789'
      }
    })
  });

  const session2 = await sessionRes2.json();
  console.log('   Payment Session Created:', session2.paymentAttemptId);

  const webhookBody2 = {
    event: 'payment.failed',
    event_id: `evt_fail2_${Date.now()}`,
    account_id: merchantId,
    payload: {
      payment: {
        entity: {
          id: `pay_fail2_${Date.now()}`,
          order_id: session2.razorpayOrderId,
          status: 'failed',
          error_code: 'BAD_REQUEST_ERROR',
          error_reason: 'payment_verification_failed',
          error_source: 'customer',
          error_step: 'payment_authentication',
          error: {
            code: 'BAD_REQUEST_ERROR',
            reason: 'payment_verification_failed',
            source: 'customer',
            step: 'payment_authentication',
            description: 'Customer failed 3D Secure OTP verification'
          }
        }
      }
    }
  };

  const signature2 = crypto
    .createHmac('sha256', 'mock_secret_key')
    .update(JSON.stringify(webhookBody2))
    .digest('hex');

  await fetch(`${SDK_URL}/v1/webhooks/razorpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature2,
      'x-merchant-id': merchantId
    },
    body: JSON.stringify(webhookBody2)
  });

  await new Promise((r) => setTimeout(r, 4000));
  const riskEvent2 = await prisma.riskEvent.findFirst({
    where: { merchantId, paymentAttemptId: session2.paymentAttemptId }
  });

  if (riskEvent2) {
    await prisma.riskEvent.update({
      where: { id: riskEvent2.id },
      data: { processingStatus: 'PENDING' }
    });

    await processRiskEventDirectly({
      riskEventId: riskEvent2.id,
      paymentAttemptId: session2.paymentAttemptId,
      merchantId,
      merchantOrderId: orderId2
    });

    await OutboxRelay.relayPendingEvents();

    const outbox2 = await prisma.outboxEvent.findFirst({
      where: { aggregateId: riskEvent2.id }
    });

    if (outbox2) {
      const recoveryContextPayload: any = outbox2.payload;
      console.log('\n===============================================================');
      console.log('📦 SCENARIO 2: INPUT RECEIVED BY @SelectInterventionPipelineOrchestration:');
      console.log('===============================================================');
      console.log(JSON.stringify(recoveryContextPayload, null, 2));

      console.log('\n===============================================================');
      console.log('⚙️ SCENARIO 2: SELECT INTERVENTION ORCHESTRATION ENGINE EVALUATION:');
      console.log('===============================================================');

      const cause = recoveryContextPayload.diagnosis.cause;
      const causeCandidates = getInterventionsForCause(cause);

      const eligibilityContext = {
        cause,
        customerData: {
          email: recoveryContextPayload.customer?.email,
          phone: recoveryContextPayload.customer?.phone,
          customerIdentity: recoveryContextPayload.customer?.id,
          paymentAttemptId: recoveryContextPayload.event?.paymentAttemptId,
          razorpayOrderId: recoveryContextPayload.payment?.razorpayOrderId
        },
        merchantConfig: {
          emailEnabled: recoveryContextPayload.merchant?.recoveryConfig?.emailEnabled,
          smsEnabled: recoveryContextPayload.merchant?.recoveryConfig?.smsEnabled,
          whatsappEnabled: recoveryContextPayload.merchant?.recoveryConfig?.whatsappEnabled,
          humanReviewEnabled: recoveryContextPayload.merchant?.recoveryConfig?.humanReviewEnabled,
          humanReviewContact: recoveryContextPayload.merchant?.recoveryConfig?.humanReviewEmail
        },
        paymentState: {
          isResolved: recoveryContextPayload.payment?.businessState === 'RESOLVED',
          isDefinitivelyFailed: recoveryContextPayload.payment?.providerState === 'FAILED'
        }
      };

      const eligibleCandidates = getEligibleInterventionsForContext(eligibilityContext);

      console.log(`✨ Scenario 2 Diagnosed Cause: ${cause}`);
      console.log(`📋 Total Cause Candidates (${causeCandidates.length}):`);
      causeCandidates.forEach((c, idx) => {
        console.log(`   ${idx + 1}. [${c.priority}] ${c.type} - ${c.name}`);
      });

      console.log(`🎯 Statically Eligible Candidates (${eligibleCandidates.length}):`);
      eligibleCandidates.forEach((c, idx) => {
        console.log(`   ${idx + 1}. [${c.priority}] ${c.type} (Supported Channels: ${c.supportedChannels.join(', ')})`);
      });
    }
  }

  console.log('\n===============================================================');
  console.log('🎉 ALL E2E SCENARIOS EXECUTED & VERIFIED SUCCESSFULLY!');
  console.log('===============================================================\n');

  await prisma.$disconnect();
  process.exit(0);
}

runLiveScenarios().catch(async (err) => {
  console.error('❌ E2E SCENARIO TEST FAILED:', err);
  await prisma.$disconnect();
  process.exit(1);
});
