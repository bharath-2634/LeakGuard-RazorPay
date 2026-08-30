import { prisma, inMemoryStore } from './prisma-client.js';

export const Repository = {
  // MERCHANTS
  async createMerchant(data: any) {
    if (inMemoryStore.isDbConnected) {
      try {
        return await prisma.merchant.create({
          data,
          include: { economics: true },
        });
      } catch (e) {
        // Fall through to memory
      }
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

  async findMerchantById(id: string) {
    if (inMemoryStore.isDbConnected) {
      try {
        const m = await prisma.merchant.findUnique({
          where: { id },
          include: { economics: true },
        });
        if (m) return m;
      } catch (e) {
        // Fall through
      }
    }
    return inMemoryStore.merchants.get(id) || null;
  },

  async updateMerchant(id: string, data: any) {
    if (inMemoryStore.isDbConnected) {
      try {
        return await prisma.merchant.update({ where: { id }, data });
      } catch (e) {
        // Fall through
      }
    }
    const current = inMemoryStore.merchants.get(id);
    if (!current) throw new Error('Merchant not found');
    const updated = { ...current, ...data, updatedAt: new Date() };
    inMemoryStore.merchants.set(id, updated);
    return updated;
  },

  // PAYMENT ATTEMPTS
  async createPaymentAttempt(data: any) {
    if (inMemoryStore.isDbConnected) {
      try {
        return await prisma.paymentAttempt.create({ data });
      } catch (e) {
        // Fall through
      }
    }
    const record = {
      id: data.id,
      merchantId: data.merchantId,
      customerId: data.customerId || null,
      sessionId: data.sessionId || null,
      merchantOrderId: data.merchantOrderId,
      razorpayOrderId: data.razorpayOrderId || null,
      razorpayPaymentId: data.razorpayPaymentId || null,
      amount: data.amount,
      currency: data.currency || 'INR',
      providerState: data.providerState || 'CREATED',
      businessState: data.businessState || 'UNRESOLVED',
      revenueObligationResolved: data.revenueObligationResolved || false,
      startedAt: new Date(),
      expiresAt: data.expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      paymentEvents: [],
    };
    inMemoryStore.paymentAttempts.set(data.id, record);
    return record;
  },

  async findPaymentAttemptById(id: string) {
    if (inMemoryStore.isDbConnected) {
      try {
        const pa = await prisma.paymentAttempt.findUnique({
          where: { id },
          include: { paymentEvents: true },
        });
        if (pa) return pa;
      } catch (e) {
        // Fall through
      }
    }
    return inMemoryStore.paymentAttempts.get(id) || null;
  },

  async findPaymentAttemptByOrderOrPayment(merchantId: string, orderId?: string, paymentId?: string) {
    if (inMemoryStore.isDbConnected) {
      try {
        const pa = await prisma.paymentAttempt.findFirst({
          where: {
            merchantId,
            OR: [
              ...(orderId ? [{ razorpayOrderId: orderId }] : []),
              ...(paymentId ? [{ razorpayPaymentId: paymentId }] : []),
            ],
          },
          include: { paymentEvents: true },
        });
        if (pa) return pa;
      } catch (e) {
        // Fall through
      }
    }
    for (const pa of inMemoryStore.paymentAttempts.values()) {
      if (pa.merchantId === merchantId) {
        if ((orderId && pa.razorpayOrderId === orderId) || (paymentId && pa.razorpayPaymentId === paymentId)) {
          return pa;
        }
      }
    }
    return null;
  },

  async updatePaymentAttempt(id: string, data: any) {
    if (inMemoryStore.isDbConnected) {
      try {
        return await prisma.paymentAttempt.update({ where: { id }, data });
      } catch (e) {
        // Fall through
      }
    }
    const current = inMemoryStore.paymentAttempts.get(id);
    if (!current) throw new Error('Payment attempt not found');
    const updated = { ...current, ...data, updatedAt: new Date() };
    inMemoryStore.paymentAttempts.set(id, updated);
    return updated;
  },

  async updateAllAttemptsForMerchantOrder(merchantId: string, merchantOrderId: string, data: any) {
    if (inMemoryStore.isDbConnected) {
      try {
        await prisma.paymentAttempt.updateMany({
          where: { merchantId, merchantOrderId },
          data,
        });
      } catch (e) {
        // Fall through
      }
    }
    for (const [id, pa] of inMemoryStore.paymentAttempts.entries()) {
      if (pa.merchantId === merchantId && pa.merchantOrderId === merchantOrderId) {
        inMemoryStore.paymentAttempts.set(id, { ...pa, ...data, updatedAt: new Date() });
      }
    }
  },

  // PAYMENT EVENTS
  async createPaymentEvents(events: any[]) {
    if (inMemoryStore.isDbConnected) {
      try {
        return await prisma.paymentEvent.createMany({ data: events });
      } catch (e) {
        // Fall through
      }
    }
    for (const e of events) {
      const record = { ...e, id: `evt_${Date.now()}_${Math.random()}` };
      inMemoryStore.paymentEvents.push(record);
      const pa = inMemoryStore.paymentAttempts.get(e.paymentAttemptId);
      if (pa) {
        pa.paymentEvents.push(record);
      }
    }
  },

  // WEBHOOK EVENTS
  async findWebhookEvent(razorpayEventId: string) {
    if (inMemoryStore.isDbConnected) {
      try {
        return await prisma.razorpayWebhookEvent.findUnique({ where: { razorpayEventId } });
      } catch (e) {
        // Fall through
      }
    }
    return inMemoryStore.razorpayWebhookEvents.get(razorpayEventId) || null;
  },

  async createWebhookEvent(data: any) {
    if (inMemoryStore.isDbConnected) {
      try {
        return await prisma.razorpayWebhookEvent.create({ data });
      } catch (e) {
        // Fall through
      }
    }
    const record = { ...data, id: `w_evt_${Date.now()}` };
    inMemoryStore.razorpayWebhookEvents.set(data.razorpayEventId, record);
    return record;
  },

  // RISK EVENTS
  async createRiskEvent(data: any) {
    if (inMemoryStore.isDbConnected) {
      try {
        return await prisma.riskEvent.create({ data });
      } catch (e) {
        // Fall through
      }
    }
    const record = { ...data, id: `risk_${Date.now()}` };
    inMemoryStore.riskEvents.push(record);
    return record;
  },
};
