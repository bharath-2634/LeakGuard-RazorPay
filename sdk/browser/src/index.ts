export interface SDKConfig {
  merchantId: string;
  telemetryEndpoint: string;
  environment?: 'production' | 'test';
  batchSize?: number;
  flushIntervalMs?: number;
}

export interface TelemetryEvent {
  event: string;
  timestamp: string;
  source: 'sdk';
  metadata?: Record<string, any>;
}

export class RevenueRecoverySDK {
  private static instance: RevenueRecoverySDK | null = null;
  private config: SDKConfig;
  private buffer: TelemetryEvent[] = [];
  private activePaymentAttemptId: string | null = null;
  private flushTimer: any = null;

  private constructor(config: SDKConfig) {
    this.config = {
      batchSize: 5,
      flushIntervalMs: 3000,
      environment: 'production',
      ...config,
    };
    this.setupGlobalListeners();
  }

  public static init(config: SDKConfig): RevenueRecoverySDK {
    if (!RevenueRecoverySDK.instance) {
      RevenueRecoverySDK.instance = new RevenueRecoverySDK(config);
    }
    return RevenueRecoverySDK.instance;
  }

  public static getInstance(): RevenueRecoverySDK {
    if (!RevenueRecoverySDK.instance) {
      throw new Error('RevenueRecoverySDK is not initialized. Call init() first.');
    }
    return RevenueRecoverySDK.instance;
  }

  public setPaymentAttemptId(paymentAttemptId: string): void {
    this.activePaymentAttemptId = paymentAttemptId;
  }

  /**
   * Fail-Open Checkout Wrapper around Razorpay Checkout modal
   */
  public wrapCheckout(razorpayOptions: any, paymentAttemptId: string): any {
    this.activePaymentAttemptId = paymentAttemptId;
    this.trackEvent('checkout_opened', { razorpayOrderId: razorpayOptions.order_id });

    const originalHandler = razorpayOptions.handler;
    const originalDismiss = razorpayOptions.modal?.ondismiss;

    // Wrap payment success handler
    razorpayOptions.handler = (response: any) => {
      this.trackEvent('payment_authorized_client', {
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature,
      });
      this.flushImmediate();
      if (typeof originalHandler === 'function') {
        originalHandler(response);
      }
    };

    // Wrap modal dismissal handler
    if (!razorpayOptions.modal) razorpayOptions.modal = {};
    razorpayOptions.modal.ondismiss = () => {
      this.trackEvent('checkout_closed', { reason: 'user_dismissed' });
      this.flushImmediate();
      if (typeof originalDismiss === 'function') {
        originalDismiss();
      }
    };

    return razorpayOptions;
  }

  public trackEvent(eventName: string, metadata?: Record<string, any>): void {
    try {
      const eventItem: TelemetryEvent = {
        event: eventName,
        timestamp: new Date().toISOString(),
        source: 'sdk',
        metadata: {
          ...metadata,
          url: typeof window !== 'undefined' ? window.location.href : '',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        },
      };

      this.buffer.push(eventItem);

      if (this.buffer.length >= (this.config.batchSize || 5)) {
        this.flush();
      } else if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush(), this.config.flushIntervalMs || 3000);
      }
    } catch (e) {
      // Fail-open boundary: swallow SDK internal tracking errors completely
    }
  }

  public async flushImmediate(): Promise<void> {
    await this.flush();
  }

  public async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.length === 0 || !this.activePaymentAttemptId) {
      return;
    }

    const eventsToFlush = [...this.buffer];
    this.buffer = [];

    // FAIL-OPEN OPERATIONAL SLA: Asynchronous, bounded 1.5s network call.
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 1500) : null;

      await fetch(this.config.telemetryEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: this.config.merchantId,
          payment_attempt_id: this.activePaymentAttemptId,
          events: eventsToFlush,
        }),
        signal: controller ? controller.signal : undefined,
      }).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });
    } catch (error) {
      // Fail-Open Invariant: Telemetry failures MUST NEVER throw errors or block user flow.
    }
  }

  private setupGlobalListeners(): void {
    if (typeof window === 'undefined') return;

    try {
      window.addEventListener('visibilitychange', () => {
        this.trackEvent(document.hidden ? 'page_hidden' : 'page_visible');
      });

      window.addEventListener('offline', () => {
        this.trackEvent('network_state_changed', { state: 'offline' });
      });

      window.addEventListener('online', () => {
        this.trackEvent('network_state_changed', { state: 'online' });
      });
    } catch (e) {
      // Fail-open
    }
  }
}
