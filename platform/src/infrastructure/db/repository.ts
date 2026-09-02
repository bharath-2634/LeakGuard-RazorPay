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
  async createPaymentSession(data: any) {
    if (process.env.DATABASE_URL) {
      // Create/find RevenueObligation and create PaymentAttempt
      const result = await prisma.$transaction(async (tx) => {
        // Upsert RevenueObligation securely (do not reset if RESOLVED)
        const existingObligation = await tx.revenueObligation.findUnique({
          where: {
            merchantId_merchantOrderId: {
              merchantId: data.merchantId,
              merchantOrderId: data.merchantOrderId,
            },
          },
        });

        if (!existingObligation) {
          await tx.revenueObligation.create({
            data: {
              merchantId: data.merchantId,
              merchantOrderId: data.merchantOrderId,
              amount: data.amount,
              currency: data.currency,
              status: 'UNRESOLVED',
            },
          });
        }

        const pa = await tx.paymentAttempt.create({ data });
        return pa;
      });
      console.log('🐘 [NEON DB SUCCESS] Created PaymentAttempt & Obligation in Neon PostgreSQL:', result.id);
      return result;
    }
    
    // Fallback
    const record = {
      ...data,
      startedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    inMemoryStore.paymentAttempts.set(data.id, record);
    return record;
  },

  async createPaymentAttempt(data: any) {
    return this.createPaymentSession(data);
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

  // RISK EVENTS WITH TRANSACTIONAL OUTBOX PATTERN & MINIFIED PAYLOAD
  async createRiskEvent(data: any) {
    if (process.env.DATABASE_URL) {
      // ATOMIC TRANSACTION: Write risk_events + outbox_events in single Neon DB transaction
      const [riskResult, outboxResult] = await prisma.$transaction([
        prisma.riskEvent.create({
          data: {
            paymentAttemptId: data.paymentAttemptId,
            merchantId: data.merchantId,
            eventType: data.eventType || 'PAYMENT_FAILURE_RISK',
            payload: data.payload as any,
            processingStatus: 'PENDING',
          },
        }),
        prisma.outboxEvent.create({
          data: {
            eventType: data.eventType || 'PAYMENT_FAILURE_RISK',
            aggregateId: data.paymentAttemptId,
            // MINIFIED PAYLOAD CONTRACT
            payload: {
              riskEventId: undefined, // Filled later using the created ID
              paymentAttemptId: data.paymentAttemptId,
              merchantId: data.merchantId,
              merchantOrderId: data.payload?.merchantOrderId || data.merchantOrderId,
              eventVersion: 1,
            } as any,
            status: 'PENDING',
          },
        }),
      ]);

      // Update outbox event payload with the riskEventId (since it's a UUID generated by DB, we update it post-insert, or we could generate UUID upfront)
      await prisma.outboxEvent.update({
        where: { id: outboxResult.id },
        data: {
          payload: {
            riskEventId: riskResult.id,
            paymentAttemptId: data.paymentAttemptId,
            merchantId: data.merchantId,
            merchantOrderId: data.payload?.merchantOrderId || data.merchantOrderId,
            eventVersion: 1,
          } as any,
        }
      });

      console.log('🐘 [NEON DB TRANSACTION COMMIT] Inserted risk_events (#', riskResult.id, ') AND outbox_events (#', outboxResult.id, ')');

      // Trigger Outbox Relay to publish event to Upstash Redis BullMQ
      try {
        const { OutboxPublisher } = await import('../queue/bullmq-client.js');
        await OutboxPublisher.relayPendingEvents();
      } catch (relayErr: any) {
        console.error('⚠️ [OUTBOX RELAY TRIGGER ERROR]:', relayErr.message);
      }

      return riskResult;
    }

    // In-memory fallback mode
    const record = { id: `re_${Date.now()}`, ...data, emittedAt: new Date(), processingStatus: 'PENDING' };
    inMemoryStore.riskEvents.push(record);

    try {
      const { OutboxPublisher } = await import('../queue/bullmq-client.js');
      await OutboxPublisher.relayPendingEvents();
    } catch (e: any) {}

    return record;
  },

  async resolvePaymentAndObligation(merchantId: string, merchantOrderId: string, paymentAttemptId: string, razorpayPaymentId: string) {
    if (process.env.DATABASE_URL) {
      await prisma.$transaction(async (tx) => {
        await tx.paymentAttempt.updateMany({
          where: { id: paymentAttemptId },
          data: {
            providerState: 'CAPTURED',
            businessState: 'RESOLVED',
            revenueObligationResolved: true,
            resolvedAt: new Date(),
            razorpayPaymentId,
          }
        });

        // Ensure we find it first to avoid unique constraint issues if we did upsert improperly
        const obligation = await tx.revenueObligation.findUnique({
          where: { merchantId_merchantOrderId: { merchantId, merchantOrderId } }
        });
        
        if (obligation && obligation.status !== 'RESOLVED') {
          await tx.revenueObligation.update({
            where: { id: obligation.id },
            data: {
              status: 'RESOLVED',
              successfulPaymentAttemptId: paymentAttemptId,
              successfulRazorpayPaymentId: razorpayPaymentId,
              resolvedAt: new Date(),
            }
          });
        }
      });
    }
  }
};
