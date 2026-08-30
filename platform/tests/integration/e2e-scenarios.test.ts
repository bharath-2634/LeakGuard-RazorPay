import supertest from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app.js';

const request = supertest(app);

describe('E2E & Integration Test Suite: Revenue Risk Detection SDK', () => {
  const merchantId = 'm_test_e2e_100';
  const razorpaySecret = 'rzp_test_secret_998877';
  const razorpayKeyId = 'rzp_test_key_112233';

  describe('Scenario 1: Merchant Onboarding & Encrypted Secret Security', () => {
    it('should onboard merchant and store secret in encrypted form', async () => {
      const res = await request.post('/v1/merchants').send({
        id: merchantId,
        name: 'Test Merchant E2E',
        domain: 'testmerchant.com',
        environment: 'test',
        defaultCurrency: 'INR',
        timezone: 'Asia/Kolkata',
        razorpayKeyId,
        razorpayKeySecret: razorpaySecret,
        defaultMarginRate: 0.25,
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.merchant.id).toBe(merchantId);
      expect(res.body.merchant.razorpayKeyId).toBe(razorpayKeyId);
      // Hard Security Invariant check: Key Secret must NEVER be present in response
      expect(res.body.merchant.razorpayKeySecret).toBeUndefined();
      expect(res.body.merchant.razorpaySecretRef).toBeUndefined();
    });

    it('should fetch merchant details without exposing secret', async () => {
      const res = await request.get(`/v1/merchants/${merchantId}`);
      expect(res.status).toBe(200);
      expect(res.body.merchant.id).toBe(merchantId);
      expect(res.body.merchant.razorpayKeySecret).toBeUndefined();
    });
  });

  describe('Scenario 2: Unified Payment Session Creation', () => {
    it('should create PaymentAttempt and Razorpay Order atomically', async () => {
      const res = await request.post('/v1/payments/session').send({
        merchantId,
        merchantOrderId: 'order_e2e_9001',
        amount: 20000,
        currency: 'INR',
        customerId: 'cust_e2e_404',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.paymentAttemptId).toBeDefined();
      expect(res.body.paymentAttemptId).toMatch(/^pa_/);
      expect(res.body.razorpayOrderId).toBeDefined();
      expect(res.body.razorpayKeyId).toBe(razorpayKeyId);
      expect(res.body.amount).toBe(20000);
      // Hard Security Invariant check
      expect(res.body.razorpayKeySecret).toBeUndefined();
    });
  });

  describe('Scenario 3: Fail-Open Telemetry Ingestion', () => {
    it('should accept SDK telemetry events asynchronously', async () => {
      // First create a session
      const sessionRes = await request.post('/v1/payments/session').send({
        merchantId,
        merchantOrderId: 'order_e2e_9002',
        amount: 15000,
      });
      const paId = sessionRes.body.paymentAttemptId;

      const sdkRes = await request.post('/v1/sdk/events').send({
        merchant_id: merchantId,
        payment_attempt_id: paId,
        events: [
          { event: 'checkout_opened', timestamp: new Date().toISOString(), source: 'sdk' },
          { event: 'payment_method_selected', timestamp: new Date().toISOString(), source: 'sdk' },
        ],
      });

      expect(sdkRes.status).toBe(200);
      expect(sdkRes.body.success).toBe(true);
      expect(sdkRes.body.count).toBe(2);
    });
  });

  describe('Scenario 4: Webhook Signature Verification & Deduplication', () => {
    let paId: string;
    let rzpOrderId: string;

    beforeAll(async () => {
      const sessionRes = await request.post('/v1/payments/session').send({
        merchantId,
        merchantOrderId: 'order_e2e_9003',
        amount: 50000,
      });
      paId = sessionRes.body.paymentAttemptId;
      rzpOrderId = sessionRes.body.razorpayOrderId;
    });

    it('should reject webhook with invalid signature (HTTP 401)', async () => {
      const body = {
        event: 'payment.failed',
        event_id: 'evt_test_invalid_sig',
        account_id: merchantId,
        payload: {
          payment: {
            entity: {
              id: 'pay_fail_001',
              order_id: rzpOrderId,
              status: 'failed',
              error_code: 'BAD_REQUEST_ERROR',
              error_reason: 'insufficient_funds',
            },
          },
        },
      };

      const res = await request
        .post('/v1/webhooks/razorpay')
        .set('x-razorpay-signature', 'invalid_signature_hex')
        .set('x-merchant-id', merchantId)
        .send(body);

      // Rejection Policy test
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should accept valid signed webhook and process payment failure risk', async () => {
      const bodyPayload = {
        event: 'payment.failed',
        event_id: 'evt_test_valid_sig_1',
        account_id: merchantId,
        payload: {
          payment: {
            entity: {
              id: 'pay_fail_001',
              order_id: rzpOrderId,
              status: 'failed',
              error_code: 'BAD_REQUEST_ERROR',
              error_reason: 'insufficient_funds',
              error_description: 'Payment failed due to insufficient funds',
            },
          },
        },
      };

      const rawBody = JSON.stringify(bodyPayload);
      const validSig = crypto.createHmac('sha256', razorpaySecret).update(rawBody).digest('hex');

      const res = await request
        .post('/v1/webhooks/razorpay')
        .set('x-razorpay-signature', validSig)
        .set('x-merchant-id', merchantId)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should deduplicate duplicate webhooks cleanly', async () => {
      const bodyPayload = {
        event: 'payment.failed',
        event_id: 'evt_test_valid_sig_1', // Duplicate event ID
        account_id: merchantId,
        payload: {
          payment: {
            entity: {
              id: 'pay_fail_001',
              order_id: rzpOrderId,
            },
          },
        },
      };

      const rawBody = JSON.stringify(bodyPayload);
      const validSig = crypto.createHmac('sha256', razorpaySecret).update(rawBody).digest('hex');

      const res = await request
        .post('/v1/webhooks/razorpay')
        .set('x-razorpay-signature', validSig)
        .set('x-merchant-id', merchantId)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Event already processed');
    });
  });

  describe('Scenario 5: Multi-Attempt Recovery & Revenue Resolution Engine', () => {
    const merchantOrderId = 'order_multi_attempt_888';
    let attempt1Id: string;
    let attempt1RzpOrder: string;
    let attempt2Id: string;
    let attempt2RzpOrder: string;

    it('Attempt 1 fails -> Business State remains UNRESOLVED', async () => {
      // Create Attempt 1
      const res1 = await request.post('/v1/payments/session').send({
        merchantId,
        merchantOrderId,
        amount: 30000,
      });
      attempt1Id = res1.body.paymentAttemptId;
      attempt1RzpOrder = res1.body.razorpayOrderId;

      // Fail Attempt 1 via webhook
      const webhook1Payload = {
        event: 'payment.failed',
        event_id: 'evt_multi_1',
        account_id: merchantId,
        payload: {
          payment: {
            entity: {
              id: 'pay_multi_001',
              order_id: attempt1RzpOrder,
              status: 'failed',
              error_code: 'BAD_REQUEST_ERROR',
              error_reason: 'insufficient_funds',
            },
          },
        },
      };

      const sig1 = crypto.createHmac('sha256', razorpaySecret).update(JSON.stringify(webhook1Payload)).digest('hex');
      await request
        .post('/v1/webhooks/razorpay')
        .set('x-razorpay-signature', sig1)
        .set('x-merchant-id', merchantId)
        .send(webhook1Payload);

      // Verify Attempt 1 state
      const checkRes = await request.get(`/v1/payment-attempts/${attempt1Id}`);
      expect(checkRes.body.paymentAttempt.providerState).toBe('FAILED');
      expect(checkRes.body.paymentAttempt.businessState).toBe('UNRESOLVED');
      expect(checkRes.body.paymentAttempt.revenueObligationResolved).toBe(false);
    });

    it('Attempt 2 succeeds -> Both Attempt 1 & 2 transition to RESOLVED (STOP)', async () => {
      // Customer retries -> Create Attempt 2 for the SAME merchant_order_id
      const res2 = await request.post('/v1/payments/session').send({
        merchantId,
        merchantOrderId,
        amount: 30000,
      });
      attempt2Id = res2.body.paymentAttemptId;
      attempt2RzpOrder = res2.body.razorpayOrderId;

      // Succeed Attempt 2 via webhook
      const webhook2Payload = {
        event: 'payment.captured',
        event_id: 'evt_multi_2',
        account_id: merchantId,
        payload: {
          payment: {
            entity: {
              id: 'pay_multi_002',
              order_id: attempt2RzpOrder,
              status: 'captured',
            },
          },
        },
      };

      const sig2 = crypto.createHmac('sha256', razorpaySecret).update(JSON.stringify(webhook2Payload)).digest('hex');
      await request
        .post('/v1/webhooks/razorpay')
        .set('x-razorpay-signature', sig2)
        .set('x-merchant-id', merchantId)
        .send(webhook2Payload);

      // Wait a tick for async correlation engine processing
      await new Promise((r) => setTimeout(r, 200));

      // Verify Attempt 2 is RESOLVED
      const checkRes2 = await request.get(`/v1/payment-attempts/${attempt2Id}`);
      expect(checkRes2.body.paymentAttempt.providerState).toBe('CAPTURED');
      expect(checkRes2.body.paymentAttempt.businessState).toBe('RESOLVED');
      expect(checkRes2.body.paymentAttempt.revenueObligationResolved).toBe(true);

      // CRITICAL BUSINESS RULE: Attempt 1 must ALSO now be marked RESOLVED for the merchant_order_id!
      const checkRes1 = await request.get(`/v1/payment-attempts/${attempt1Id}`);
      expect(checkRes1.body.paymentAttempt.businessState).toBe('RESOLVED');
      expect(checkRes1.body.paymentAttempt.revenueObligationResolved).toBe(true);
    });
  });
});
