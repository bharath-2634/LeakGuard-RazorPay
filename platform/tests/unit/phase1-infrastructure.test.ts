import { encryptSecret, decryptSecret } from '../../src/infrastructure/crypto/secret-manager.js';
import { setHotPaymentState, getHotPaymentState, updateHotPaymentState } from '../../src/infrastructure/redis/redis-client.js';

describe('Phase 1 Infrastructure Unit Tests', () => {
  describe('AES-256-GCM Secret Manager', () => {
    it('should encrypt and decrypt Razorpay Key Secret correctly', () => {
      const originalSecret = 'rzp_live_secret_key_123456789';
      const encryptedRef = encryptSecret(originalSecret);

      expect(encryptedRef).not.toEqual(originalSecret);
      expect(encryptedRef.split(':').length).toBe(3);

      const decryptedSecret = decryptSecret(encryptedRef);
      expect(decryptedSecret).toEqual(originalSecret);
    });

    it('should fail cleanly on corrupted secret format', () => {
      expect(() => decryptSecret('invalid_format')).toThrow('Invalid secret reference format');
    });
  });

  describe('Hot Payment State Manager', () => {
    it('should store and retrieve payment attempt hot state', async () => {
      const mockState = {
        paymentAttemptId: 'pa_test_1001',
        merchantId: 'm_123',
        merchantOrderId: 'order_999',
        razorpayOrderId: 'order_rzp_111',
        providerState: 'CREATED',
        businessState: 'UNRESOLVED',
        revenueObligationResolved: false,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        version: 1,
      };

      await setHotPaymentState(mockState);
      const retrieved = await getHotPaymentState('pa_test_1001');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.paymentAttemptId).toBe('pa_test_1001');
      expect(retrieved?.providerState).toBe('CREATED');
      expect(retrieved?.revenueObligationResolved).toBe(false);
    });

    it('should update hot payment state and increment version', async () => {
      const updated = await updateHotPaymentState('pa_test_1001', {
        providerState: 'CAPTURED',
        businessState: 'RESOLVED',
        revenueObligationResolved: true,
      });

      expect(updated).not.toBeNull();
      expect(updated?.providerState).toBe('CAPTURED');
      expect(updated?.businessState).toBe('RESOLVED');
      expect(updated?.revenueObligationResolved).toBe(true);
      expect(updated?.version).toBe(2);
    });
  });
});
