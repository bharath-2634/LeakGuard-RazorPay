import { prisma, inMemoryStore } from './prisma-client.js';

export const Repository = {
  // MERCHANTS
  async createMerchant(data: any) {
    if (process.env.DATABASE_URL) {
      try {
        const result = await prisma.merchant.create({
          data,
          include: { economics: true },
        });
        console.log('🐘 [NEON DB SUCCESS] Created Merchant in Neon PostgreSQL:', result.id);
        return result;
      } catch (e: any) {
        console.error('⚠️ [NEON DB ERROR] createMerchant failed, falling back to memory:', e.message);
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
    if (process.env.DATABASE_URL) {
      try {
        const m = await prisma.merchant.findUnique({
          where: { id },
          include: { economics: true },
        });
        if (m) return m;
      } catch (e: any) {
        console.error('⚠️ [NEON DB ERROR] findMerchantById failed:', e.message);
      }
    }
    return inMemoryStore.merchants.get(id) || null;
  },

  // PAYMENT ATTEMPTS
  async createPaymentAttempt(data: any) {
    if (process.env.DATABASE_URL) {
      try {
        const result = await prisma.paymentAttempt.create({ data });
        console.log('🐘 [NEON DB SUCCESS] Created PaymentAttempt in Neon PostgreSQL:', result.id);
        return result;
      } catch (e: any) {
        console.error('⚠️ [NEON DB ERROR] createPaymentAttempt failed:', e.message);
      }
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
      try {
        return await prisma.paymentAttempt.update({
          where: { id },
          data: updates,
        });
      } catch (e: any) {
        console.error('⚠️ [NEON DB ERROR] updatePaymentAttempt failed:', e.message);
      }
    }
    const current = inMemoryStore.paymentAttempts.get(id);
    if (!current) return null;
    const updated = { ...current, ...updates, updatedAt: new Date() };
    inMemoryStore.paymentAttempts.set(id, updated);
    return updated;
  },

  async findPaymentAttemptById(id: string) {
    if (process.env.DATABASE_URL) {
      try {
        const pa = await prisma.paymentAttempt.findUnique({
          where: { id },
          include: { paymentEvents: true },
        });
        if (pa) return pa;
      } catch (e: any) {
        console.error('⚠️ [NEON DB ERROR] findPaymentAttemptById failed:', e.message);
      }
    }
    return inMemoryStore.paymentAttempts.get(id) || null;
  },

  async findPaymentAttemptsByMerchantOrder(merchantId: string, merchantOrderId: string) {
    if (process.env.DATABASE_URL) {
      try {
        return await prisma.paymentAttempt.findMany({
          where: { merchantId, merchantOrderId },
          orderBy: { createdAt: 'desc' },
        });
      } catch (e: any) {
        console.error('⚠️ [NEON DB ERROR] findPaymentAttemptsByMerchantOrder failed:', e.message);
      }
    }
    return Array.from(inMemoryStore.paymentAttempts.values())
      .filter((pa) => pa.merchantId === merchantId && pa.merchantOrderId === merchantOrderId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async findPaymentAttemptByRazorpayOrderId(merchantId: string, razorpayOrderId: string) {
    if (process.env.DATABASE_URL) {
      try {
        return await prisma.paymentAttempt.findFirst({
          where: { merchantId, razorpayOrderId },
        });
      } catch (e: any) {
        console.error('⚠️ [NEON DB ERROR] findPaymentAttemptByRazorpayOrderId failed:', e.message);
      }
    }
    return Array.from(inMemoryStore.paymentAttempts.values()).find(
      (pa) => pa.merchantId === merchantId && pa.razorpayOrderId === razorpayOrderId
    ) || null;
  },

  // PAYMENT EVENTS
  async createPaymentEvent(data: any) {
    if (process.env.DATABASE_URL) {
      try {
        return await prisma.paymentEvent.create({ data });
      } catch (e: any) {
        console.error('⚠️ [NEON DB ERROR] createPaymentEvent failed:', e.message);
      }
    }
    const record = { id: `pe_${Date.now()}_${Math.random()}`, ...data, receivedAt: new Date() };
    inMemoryStore.paymentEvents.push(record);
    return record;
  },

  // WEBHOOK DEDUPLICATION
  async createWebhookEvent(data: any) {
    if (process.env.DATABASE_URL) {
      try {
        return await prisma.razorpayWebhookEvent.create({ data });
      } catch (e: any) {
        console.error('⚠️ [NEON DB ERROR] createWebhookEvent failed:', e.message);
      }
    }
    const record = { id: `whe_${Date.now()}`, ...data, receivedAt: new Date() };
    inMemoryStore.razorpayWebhookEvents.set(data.razorpayEventId, record);
    return record;
  },

  async findWebhookEventById(razorpayEventId: string) {
    if (process.env.DATABASE_URL) {
      try {
        return await prisma.razorpayWebhookEvent.findUnique({
          where: { razorpayEventId },
        });
      } catch (e: any) {
        console.error('⚠️ [NEON DB ERROR] findWebhookEventById failed:', e.message);
      }
    }
    return inMemoryStore.razorpayWebhookEvents.get(razorpayEventId) || null;
  },

  // RISK EVENTS
  async createRiskEvent(data: any) {
    if (process.env.DATABASE_URL) {
      try {
        const result = await prisma.riskEvent.create({ data });
        console.log('🐘 [NEON DB SUCCESS] Emitted RiskEvent in Neon PostgreSQL:', result.id);
        return result;
      } catch (e: any) {
        console.error('⚠️ [NEON DB ERROR] createRiskEvent failed:', e.message);
      }
    }
    const record = { id: `re_${Date.now()}`, ...data, emittedAt: new Date() };
    inMemoryStore.riskEvents.push(record);
    return record;
  },
};
