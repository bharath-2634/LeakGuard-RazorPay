import { prisma, inMemoryStore } from './prisma-client.js';

export const Repository = {
  // MERCHANTS
  async createMerchant(data: any) {
    if (process.env.DATABASE_URL) {
      const result = await prisma.merchant.create({
        data,
        include: { economics: true },
      });
      console.log('🐘 [NEON DB SUCCESS] Created Merchant in Neon PostgreSQL:', result.id);
      return result;
    }

    const record = {
      id: data.id,
      name: data.name,
      domain: data.domain,
      environment: data.environment || 'production',
      defaultCurrency: data.defaultCurrency || 'INR',
      timezone: data.timezone || 'UTC',
      razorpayKeyId: data.razorpayKeyId,
      razorpaySecretRef: data.razorpaySecretRef,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      economics: data.economics?.create
        ? {
            merchantId: data.id,
            defaultMarginRate: data.economics.create.defaultMarginRate,
            categoryEconomics: data.economics.create.categoryEconomics || {},
          }
        : null,
    };
    inMemoryStore.merchants.set(data.id, record);
    if (record.economics) {
      inMemoryStore.merchantEconomics.set(data.id, record.economics);
    }
    return record;
  },

  async updateMerchant(id: string, updates: any) {
    if (process.env.DATABASE_URL) {
      return await prisma.merchant.update({
        where: { id },
        data: updates,
        include: { economics: true },
      });
    }
    const current = inMemoryStore.merchants.get(id);
    if (!current) return null;
    const updated = { ...current, ...updates, updatedAt: new Date() };
    inMemoryStore.merchants.set(id, updated);
    return updated;
  },

  async findMerchantById(id: string) {
    if (process.env.DATABASE_URL) {
      const m = await prisma.merchant.findUnique({
        where: { id },
        include: { economics: true },
      });
      if (m) return m;
    }
    return inMemoryStore.merchants.get(id) || null;
  },

  // PAYMENT ATTEMPTS
  async createPaymentAttempt(data: any) {
    if (process.env.DATABASE_URL) {
      const result = await prisma.paymentAttempt.create({ data });
      console.log('🐘 [NEON DB SUCCESS] Created PaymentAttempt in Neon PostgreSQL:', result.id);
      return result;
    }
    const record = {
      ...data,
      startedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    inMemoryStore.paymentAttempts.set(data.id, record);
    return record;
  },

  async updatePaymentAttempt(id: string, updates: any) {
    if (process.env.DATABASE_URL) {
      return await prisma.paymentAttempt.update({
        where: { id },
        data: updates,
      });
    }
    const current = inMemoryStore.paymentAttempts.get(id);
    if (!current) return null;
    const updated = { ...current, ...updates, updatedAt: new Date() };
    inMemoryStore.paymentAttempts.set(id, updated);
    return updated;
  },

  async updateAllAttemptsForMerchantOrder(merchantId: string, merchantOrderId: string, updates: any) {
    if (process.env.DATABASE_URL) {
      return await prisma.paymentAttempt.updateMany({
        where: { merchantId, merchantOrderId },
        data: updates,
      });
    }
    const attempts = await this.findPaymentAttemptsByMerchantOrder(merchantId, merchantOrderId);
    for (const pa of attempts) {
      await this.updatePaymentAttempt(pa.id, updates);
    }
    return { count: attempts.length };
  },

  async findPaymentAttemptById(id: string) {
    if (process.env.DATABASE_URL) {
      const pa = await prisma.paymentAttempt.findUnique({
        where: { id },
        include: { paymentEvents: true },
      });
      if (pa) return pa;
    }
    return inMemoryStore.paymentAttempts.get(id) || null;
  },

  async findPaymentAttemptsByMerchantOrder(merchantId: string, merchantOrderId: string) {
    if (process.env.DATABASE_URL) {
      return await prisma.paymentAttempt.findMany({
        where: { merchantId, merchantOrderId },
        orderBy: { createdAt: 'desc' },
      });
    }
    return Array.from(inMemoryStore.paymentAttempts.values())
      .filter((pa) => pa.merchantId === merchantId && pa.merchantOrderId === merchantOrderId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async findPaymentAttemptByRazorpayOrderId(merchantId: string, razorpayOrderId: string) {
    if (process.env.DATABASE_URL) {
      return await prisma.paymentAttempt.findFirst({
        where: { merchantId, razorpayOrderId },
      });
    }
    return Array.from(inMemoryStore.paymentAttempts.values()).find(
      (pa) => pa.merchantId === merchantId && pa.razorpayOrderId === razorpayOrderId
    ) || null;
  },

  async findPaymentAttemptByOrderOrPayment(merchantId: string, orderId?: string, paymentId?: string) {
    if (process.env.DATABASE_URL) {
      if (orderId) {
        const byOrder = await prisma.paymentAttempt.findFirst({
          where: { merchantId, razorpayOrderId: orderId },
        });
        if (byOrder) return byOrder;
      }
      if (paymentId) {
        const byPaymentId = await prisma.paymentAttempt.findFirst({
          where: { merchantId, razorpayPaymentId: paymentId },
        });
        if (byPaymentId) return byPaymentId;
      }
      if (orderId) {
        const byMerchantOrder = await prisma.paymentAttempt.findFirst({
          where: { merchantId, merchantOrderId: orderId },
        });
        if (byMerchantOrder) return byMerchantOrder;
      }
      return null;
    }

    const all = Array.from(inMemoryStore.paymentAttempts.values()).filter((pa) => pa.merchantId === merchantId);
    return (
      all.find(
        (pa) =>
          (orderId && pa.razorpayOrderId === orderId) ||
          (paymentId && pa.razorpayPaymentId === paymentId) ||
          (orderId && pa.merchantOrderId === orderId)
      ) || null
    );
  },

  // PAYMENT EVENTS
  async createPaymentEvent(data: any) {
    if (process.env.DATABASE_URL) {
      return await prisma.paymentEvent.create({ data });
    }
    const record = { id: `pe_${Date.now()}_${Math.random()}`, ...data, receivedAt: new Date() };
    inMemoryStore.paymentEvents.push(record);
    return record;
  },

  async createPaymentEvents(events: any[]) {
    const results = [];
    for (const evt of events) {
      const res = await this.createPaymentEvent(evt);
      results.push(res);
    }
    return results;
  },

  // WEBHOOK DEDUPLICATION
  async createWebhookEvent(data: any) {
    if (process.env.DATABASE_URL) {
      return await prisma.razorpayWebhookEvent.create({ data });
    }
    const record = { id: `whe_${Date.now()}`, ...data, receivedAt: new Date() };
    inMemoryStore.razorpayWebhookEvents.set(data.razorpayEventId, record);
    return record;
  },

  async findWebhookEventById(razorpayEventId: string) {
    if (process.env.DATABASE_URL) {
      const result = await prisma.razorpayWebhookEvent.findUnique({
        where: { razorpayEventId },
      });
      if (result) return result;
    }
    return inMemoryStore.razorpayWebhookEvents.get(razorpayEventId) || null;
  },

  async findWebhookEvent(razorpayEventId: string) {
    return await this.findWebhookEventById(razorpayEventId);
  },

  // RISK EVENTS WITH TRANSACTIONAL OUTBOX PATTERN & FAT PAYLOAD
  async createRiskEvent(data: any) {
    // 1. Enrich payload with full Merchant details to form the FAT EVENT PAYLOAD (zero DB queries needed by BullMQ workers)
    let merchantContext = null;
    try {
      merchantContext = await this.findMerchantById(data.merchantId);
    } catch (e: any) {
      console.warn('⚠️ Could not fetch merchant context for fat payload:', e.message);
    }

    const rawPayload = typeof data.payload === 'object' ? data.payload : {};

    const fatPayload = {
      ...rawPayload,
      event_type: data.eventType || 'PAYMENT_FAILURE_RISK',
      payment_attempt_id: data.paymentAttemptId,
      merchant_id: data.merchantId,
      merchant_info: merchantContext
        ? {
            name: merchantContext.name,
            domain: merchantContext.domain,
            environment: merchantContext.environment,
            defaultCurrency: merchantContext.defaultCurrency,
            razorpayKeyId: merchantContext.razorpayKeyId,
            categoryEconomics: merchantContext.economics?.categoryEconomics || {},
            defaultMarginRate: merchantContext.economics?.defaultMarginRate || 0.2,
          }
        : null,
      emitted_at: new Date().toISOString(),
    };

    if (process.env.DATABASE_URL) {
      // 2. ATOMIC TRANSACTION: Write risk_events + outbox_events in single Neon DB transaction
      const [riskResult, outboxResult] = await prisma.$transaction([
        prisma.riskEvent.create({
          data: {
            paymentAttemptId: data.paymentAttemptId,
            merchantId: data.merchantId,
            eventType: data.eventType || 'PAYMENT_FAILURE_RISK',
            payload: fatPayload as any,
          },
        }),
        prisma.outboxEvent.create({
          data: {
            eventType: data.eventType || 'PAYMENT_FAILURE_RISK',
            aggregateId: data.paymentAttemptId,
            payload: fatPayload as any,
            status: 'PENDING',
          },
        }),
      ]);

      console.log('🐘 [NEON DB TRANSACTION COMMIT] Inserted risk_events (#', riskResult.id, ') AND outbox_events (#', outboxResult.id, ')');

      // 3. Trigger Outbox Relay to publish event to Upstash Redis BullMQ
      try {
        const { OutboxPublisher } = await import('../queue/bullmq-client.js');
        await OutboxPublisher.relayPendingEvents();
      } catch (relayErr: any) {
        console.error('⚠️ [OUTBOX RELAY TRIGGER ERROR]:', relayErr.message);
      }

      return riskResult;
    }

    // In-memory fallback mode
    const record = { id: `re_${Date.now()}`, ...data, payload: fatPayload, emittedAt: new Date() };
    inMemoryStore.riskEvents.push(record);

    try {
      const { OutboxPublisher } = await import('../queue/bullmq-client.js');
      await OutboxPublisher.relayPendingEvents();
    } catch (e: any) {}

    return record;
  },
};
