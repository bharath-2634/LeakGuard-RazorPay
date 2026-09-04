import { createStrategies } from '../src/execution/strategy/strategies.js';
import { executeRecovery } from '../src/execution/execution.service.js';

const CUSTOMER = {
  id: 'cust_bharath_7845425982',
  name: 'Bharath G',
  email: 'bharath2005goo@gmail.com',
  phone: '+917845425982'
};

const MERCHANT = {
  id: 'm_bharat_store_6615',
  name: 'Bharat Electronics Store',
  timezone: 'Asia/Kolkata',
  defaultCurrency: 'INR',
  recoveryEnabled: true,
  recoveryConfig: {
    emailEnabled: true,
    smsEnabled: true,
    whatsappEnabled: true,
    humanReviewEnabled: true,
    humanReviewEmail: 'bharath2005goo@gmail.com'
  }
};

async function testOutboundChannels() {
  console.log('===================================================================================');
  console.log('📬 LEAKGUARD-RAZORPAY: OUTBOUND CUSTOMER COMMUNICATION CHANNEL TEST');
  console.log('===================================================================================\n');
  console.log(`👤 Target Customer Profile:`);
  console.log(`   - Email: ${CUSTOMER.email}`);
  console.log(`   - Phone / WhatsApp: ${CUSTOMER.phone}\n`);

  const strategies = createStrategies();

  const INTERVENTIONS_TO_TEST = [
    { type: 'SEND_PAYMENT_LINK', name: 'Razorpay Instant Payment Link' },
    { type: 'SEND_WHATSAPP', name: 'WhatsApp Recovery Message' },
    { type: 'SEND_EMAIL', name: 'Email Payment Recovery Notification' },
    { type: 'SEND_SMS', name: 'SMS Recovery Message' },
    { type: 'HUMAN_REVIEW', name: 'Human Escalation Review' }
  ];

  for (const item of INTERVENTIONS_TO_TEST) {
    console.log(`-----------------------------------------------------------------------------------`);
    console.log(`📢 TESTING INTERVENTION TYPE: ${item.type} (${item.name})`);
    console.log(`-----------------------------------------------------------------------------------`);

    const dummyContext: any = {
      executionRequestId: `peval_${Date.now()}_${item.type}`,
      riskEventId: `risk_${Date.now()}`,
      merchant: MERCHANT,
      customer: CUSTOMER,
      payment: {
        paymentAttemptId: `pa_${Date.now()}`,
        merchantOrderId: `ord_${Date.now()}`,
        amount: 12500,
        currency: 'INR',
        providerState: 'FAILED',
        businessState: 'UNRESOLVED'
      },
      intervention: { type: item.type },
      policy: {
        decision: 'ALLOWED',
        attemptsUsed: 0,
        maxAttempts: 2,
        attemptsRemaining: 2,
        coolOffSeconds: 1800,
        reasons: ['POLICY_CHECK_PASSED']
      },
      diagnosis: {
        cause: 'INSUFFICIENT_FUNDS',
        confidence: 0.95,
        actionabilityScore: 90,
        priority: 'HIGH'
      },
      correlationId: `corr_${Date.now()}`
    };

    const strategy = strategies.find((s) => s.supports(item.type));
    if (strategy) {
      const action = await strategy.execute(dummyContext);
      console.log(`  📝 Rendered Action Payload:`);
      console.log(`     - Action Type: ${action.actionType}`);
      console.log(`     - Target Recipient: ${action.recipient || 'N/A'}`);
      if (action.subject) console.log(`     - Email Subject: "${action.subject}"`);
      if (action.content) {
        console.log(`     - Message Content:\n       "${action.content.replace(/\n/g, '\n       ')}"`);
      }

      // Execute via execution service
      const execResult = await executeRecovery({
        policyEvaluationId: dummyContext.executionRequestId,
        paymentAttemptId: dummyContext.payment.paymentAttemptId,
        merchantId: MERCHANT.id,
        riskEventId: dummyContext.riskEventId,
        intervention: { type: item.type },
        policy: dummyContext.policy,
        recoveryContext: {
          merchant: MERCHANT,
          customer: CUSTOMER,
          payment: dummyContext.payment,
          event: { merchantOrderId: dummyContext.payment.merchantOrderId, amount: 12500, currency: 'INR' },
          diagnosis: dummyContext.diagnosis,
          metadata: { correlationId: dummyContext.correlationId }
        }
      } as any);

      console.log(`  ✅ Execution Engine Status: ${execResult.status}`);
      console.log(`     - Provider: ${execResult.provider || 'MOCK/LIVE'}`);
      console.log(`     - Execution ID: ${execResult.executionId}`);
    }
    console.log();
  }

  console.log('===================================================================================');
  console.log('💡 WHY YOU DID NOT RECEIVE ACTUAL EMAIL/SMS ON YOUR PHONE:');
  console.log('===================================================================================');
  console.log('1. Primary Intervention Selected: In the main E2E test, the highest-scoring candidate selected');
  console.log('   was "CHANGE_PAYMENT_METHOD_PROMPT". This is an in-app checkout modal prompt for the user,');
  console.log('   not an external outbound Email/SMS/WhatsApp.');
  console.log('\n2. Execution Mode: EXECUTION_MODE is set to "mock" by default to prevent spending SMS/Email/Twilio credits.');
  console.log('\n3. Real Delivery Setup: To receive actual WhatsApp (+917845425982) and Email (bharath2005goo@gmail.com):');
  console.log('   - Set EXECUTION_MODE=live in Railway or environment variables.');
  console.log('   - Provide live provider API keys:');
  console.log('     * RESEND_API_KEY & RESEND_FROM_EMAIL for Email delivery');
  console.log('     * TWILIO_ACCOUNT_SID & TWILIO_AUTH_TOKEN & TWILIO_WHATSAPP_FROM for WhatsApp/SMS');
  console.log('===================================================================================\n');
}

testOutboundChannels().catch(console.error);
