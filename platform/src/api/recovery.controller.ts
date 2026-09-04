import { Request, Response } from 'express';
import { prisma } from '../infrastructure/db/prisma-client.js';

function getMerchantId(req: Request): string {
  const m = req.headers['x-merchant-id'] || req.query.merchantId || (req as any).merchantId || '';
  return Array.isArray(m) ? m[0] : String(m);
}

export async function stopRecoveryHandler(req: Request, res: Response) {
  try {
    const riskEventId = String(req.params.riskEventId);
    const { reason } = req.body || {};
    const merchantId = getMerchantId(req);

    if (!merchantId) {
      return res.status(400).json({ success: false, error: 'Merchant ID is required (x-merchant-id header or merchantId query)' });
    }

    const risk = await prisma.riskEvent.findFirst({
      where: { id: riskEventId, merchantId: String(merchantId) },
    });

    if (!risk) {
      return res.status(404).json({ success: false, error: 'Risk event not found for merchant' });
    }

    const stopReason = String(reason || 'Merchant manually stopped recovery');

    // 1. Upsert RecoveryControl state to STOPPED
    const control = await prisma.recoveryControl.upsert({
      where: { riskEventId },
      create: {
        id: `rc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        merchantId: String(merchantId),
        paymentAttemptId: risk.paymentAttemptId,
        riskEventId,
        status: 'STOPPED',
        stoppedBy: 'MERCHANT',
        stopReason,
        stoppedAt: new Date(),
        version: 1,
      },
      update: {
        status: 'STOPPED',
        stoppedBy: 'MERCHANT',
        stopReason,
        stoppedAt: new Date(),
      },
    });

    // 2. Insert RecoveryAudit record
    await prisma.recoveryAudit.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        merchantId: String(merchantId),
        paymentAttemptId: risk.paymentAttemptId,
        riskEventId,
        eventType: 'RECOVERY_STOPPED_BY_MERCHANT',
        actor: 'MERCHANT',
        component: 'CONTROL',
        action: 'STOP_RECOVERY',
        status: 'STOPPED',
        reason: stopReason,
        correlationId: `corr_stop_${Date.now()}`,
      },
    });

    // 3. Update RiskEvent processingStatus to STOPPED
    await prisma.riskEvent.update({
      where: { id: riskEventId },
      data: { processingStatus: 'STOPPED' },
    });

    return res.json({
      success: true,
      message: 'Recovery workflow manually stopped by merchant',
      control,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getRecoveriesHandler(req: Request, res: Response) {
  try {
    const merchantId = getMerchantId(req);
    if (!merchantId) {
      return res.status(400).json({ success: false, error: 'Merchant ID is required' });
    }

    const riskEvents = await prisma.riskEvent.findMany({
      where: { merchantId },
      take: 50,
      orderBy: { emittedAt: 'desc' },
    });

    const recoveries = [];
    for (const r of riskEvents) {
      const pa = await prisma.paymentAttempt.findUnique({
        where: { id: r.paymentAttemptId },
        include: { customer: true },
      });
      const vr = await prisma.validationResult.findUnique({
        where: { riskEventId: r.id },
      });
      const rc = await prisma.recoveryControl.findUnique({
        where: { riskEventId: r.id },
      });

      if (pa) {
        recoveries.push({
          riskEventId: r.id,
          paymentAttemptId: r.paymentAttemptId,
          merchantOrderId: pa.merchantOrderId,
          customer: pa.customer
            ? {
                name: pa.customer.name,
                email: pa.customer.email,
                phone: pa.customer.phone,
              }
            : null,
          amount: pa.amount,
          currency: pa.currency,
          diagnosis: vr
            ? {
                cause: vr.diagnosedCause,
                priority: vr.priority,
              }
            : { cause: 'UNKNOWN', priority: 'UNKNOWN' },
          recoveryStatus: rc?.status === 'STOPPED' ? 'STOPPED' : r.processingStatus,
          startedAt: r.emittedAt,
        });
      }
    }

    return res.json({ success: true, count: recoveries.length, recoveries });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getRecoveryDetailHandler(req: Request, res: Response) {
  try {
    const riskEventId = String(req.params.riskEventId);
    const riskEvent = await prisma.riskEvent.findUnique({
      where: { id: riskEventId },
    });

    if (!riskEvent) {
      return res.status(404).json({ success: false, error: 'Recovery event not found' });
    }

    const { paymentAttemptId, merchantId } = riskEvent;
    const paymentAttempt = await prisma.paymentAttempt.findUnique({
      where: { id: paymentAttemptId },
      include: { customer: true },
    });

    if (!paymentAttempt) {
      return res.status(404).json({ success: false, error: 'Associated payment attempt not found' });
    }

    const validationResult = await prisma.validationResult.findUnique({
      where: { riskEventId },
    });

    const recoveryControl = await prisma.recoveryControl.findUnique({
      where: { riskEventId },
    });

    const executions = await prisma.recoveryExecution.findMany({
      where: { paymentAttemptId },
      orderBy: { createdAt: 'asc' },
    });

    const outcomes = await prisma.recoveryOutcome.findMany({
      where: { paymentAttemptId },
      orderBy: { createdAt: 'asc' },
    });

    const auditTimeline = await prisma.recoveryAudit.findMany({
      where: { riskEventId },
      orderBy: { createdAt: 'asc' },
    });

    const obligation = await prisma.revenueObligation.findFirst({
      where: { merchantId, merchantOrderId: paymentAttempt.merchantOrderId },
    });

    const isRecovered = obligation?.status === 'RESOLVED';

    return res.json({
      success: true,
      recovery: {
        riskEventId,
        paymentAttemptId,
        merchantId,
        merchantOrderId: paymentAttempt.merchantOrderId,
        customer: paymentAttempt.customer
          ? {
              id: paymentAttempt.customer.id,
              name: paymentAttempt.customer.name,
              email: paymentAttempt.customer.email,
              phone: paymentAttempt.customer.phone,
            }
          : null,
        payment: {
          amount: paymentAttempt.amount,
          currency: paymentAttempt.currency,
          startedAt: paymentAttempt.startedAt,
          resolvedAt: paymentAttempt.resolvedAt,
        },
        diagnosis: validationResult
          ? {
              cause: validationResult.diagnosedCause,
              confidence: validationResult.diagnosisConfidence,
              priority: validationResult.priority,
              revenueAtRisk: validationResult.revenueAtRisk,
            }
          : null,
        control: recoveryControl
          ? {
              status: recoveryControl.status,
              stoppedBy: recoveryControl.stoppedBy,
              stopReason: recoveryControl.stopReason,
              stoppedAt: recoveryControl.stoppedAt,
            }
          : { status: 'ACTIVE' },
        currentState: {
          riskEventStatus: riskEvent.processingStatus,
          obligationStatus: obligation?.status || 'UNRESOLVED',
          isRecovered,
        },
        attempts: executions,
        outcomes,
        auditTimeline,
        moneyRecovered: isRecovered
          ? { amount: paymentAttempt.amount, currency: paymentAttempt.currency }
          : { amount: 0, currency: paymentAttempt.currency },
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getSingleRecoveryAuditHandler(req: Request, res: Response) {
  try {
    const riskEventId = String(req.params.riskEventId);
    const auditTimeline = await prisma.recoveryAudit.findMany({
      where: { riskEventId },
      orderBy: { createdAt: 'asc' },
    });
    return res.json({ success: true, count: auditTimeline.length, auditTimeline });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getMerchantAuditsHandler(req: Request, res: Response) {
  try {
    const merchantId = getMerchantId(req);
    if (!merchantId) {
      return res.status(400).json({ success: false, error: 'Merchant ID is required' });
    }

    const audits = await prisma.recoveryAudit.findMany({
      where: { merchantId: String(merchantId) },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, count: audits.length, audits });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getRecoveryMetricsHandler(req: Request, res: Response) {
  try {
    const merchantId = getMerchantId(req);
    if (!merchantId) {
      return res.status(400).json({ success: false, error: 'Merchant ID is required' });
    }

    const riskEvents = await prisma.riskEvent.findMany({
      where: { merchantId },
    });

    const outcomes = await prisma.recoveryOutcome.findMany({
      where: { merchantId },
    });

    const controls = await prisma.recoveryControl.findMany({
      where: { merchantId },
    });

    const obligations = await prisma.revenueObligation.findMany({
      where: { merchantId },
    });

    const paymentAttempts = await prisma.paymentAttempt.findMany({
      where: { merchantId },
    });

    const paMap = new Map<string, any>();
    for (const pa of paymentAttempts) {
      paMap.set(pa.id, pa);
    }

    const obligationMap = new Map<string, string>();
    for (const ob of obligations) {
      obligationMap.set(ob.merchantOrderId, ob.status);
    }

    const currencies = Array.from(new Set(paymentAttempts.map((pa) => pa.currency || 'INR')));
    if (currencies.length === 0) currencies.push('INR');

    const metricsList = [];

    for (const curr of currencies) {
      const currPaIds = new Set(paymentAttempts.filter((pa) => (pa.currency || 'INR') === curr).map((pa) => pa.id));
      const currRiskEvents = riskEvents.filter((r) => currPaIds.has(r.paymentAttemptId));
      const currOutcomes = outcomes.filter((o) => currPaIds.has(o.paymentAttemptId));

      const totalRevenueAtRisk = currRiskEvents.reduce((sum, r) => {
        const pa = paMap.get(r.paymentAttemptId);
        return sum + (pa?.amount || 0);
      }, 0);

      const recoveredOutcomes = currOutcomes.filter((o) => {
        const pa = paMap.get(o.paymentAttemptId);
        const obStatus = pa ? obligationMap.get(pa.merchantOrderId) : undefined;
        return obStatus === 'RESOLVED' && o.outcomeStatus === 'RECOVERED';
      });

      const totalRecoveredRevenue = recoveredOutcomes.reduce((sum, o) => {
        const pa = paMap.get(o.paymentAttemptId);
        return sum + (pa?.amount || 0);
      }, 0);

      const unrecoveredRevenue = Math.max(0, totalRevenueAtRisk - totalRecoveredRevenue);
      const recoveryRate = totalRevenueAtRisk > 0 ? Number((totalRecoveredRevenue / totalRevenueAtRisk).toFixed(4)) : 0;

      const riskEventsDetected = currRiskEvents.length;
      const recoveredEventIds = new Set(recoveredOutcomes.map((o) => o.paymentAttemptId));
      const recoveredEvents = recoveredEventIds.size;
      const unrecoveredEvents = Math.max(0, riskEventsDetected - recoveredEvents);

      const stoppedRiskIds = new Set(controls.filter((c) => c.status === 'STOPPED').map((c) => c.riskEventId));
      const stoppedRecoveries = currRiskEvents.filter((r) => stoppedRiskIds.has(r.id)).length;
      const activeRecoveries = Math.max(0, riskEventsDetected - recoveredEvents - stoppedRecoveries);

      const totalInterventionAttempts = currOutcomes.length;

      // Group by intervention
      const interventionMap = new Map<string, { attempts: number; recoveredEvents: Set<string>; recoveredRevenue: number }>();
      for (const out of currOutcomes) {
        const type = out.interventionType;
        if (!interventionMap.has(type)) {
          interventionMap.set(type, { attempts: 0, recoveredEvents: new Set(), recoveredRevenue: 0 });
        }
        const item = interventionMap.get(type)!;
        item.attempts += 1;
        const pa = paMap.get(out.paymentAttemptId);
        const obStatus = pa ? obligationMap.get(pa.merchantOrderId) : undefined;
        if (obStatus === 'RESOLVED' && out.outcomeStatus === 'RECOVERED') {
          item.recoveredEvents.add(out.paymentAttemptId);
          item.recoveredRevenue += pa?.amount || 0;
        }
      }

      const byIntervention = Array.from(interventionMap.entries()).map(([interventionType, data]) => ({
        interventionType,
        attempts: data.attempts,
        recoveredEvents: data.recoveredEvents.size,
        recoveredRevenue: data.recoveredRevenue,
      }));

      // Group by cause
      const causeMap = new Map<string, { events: Set<string>; recoveredEvents: Set<string>; recoveredRevenue: number }>();
      for (const re of currRiskEvents) {
        const vr = await prisma.validationResult.findUnique({ where: { riskEventId: re.id } });
        const cause = vr?.diagnosedCause || 'UNKNOWN';
        if (!causeMap.has(cause)) {
          causeMap.set(cause, { events: new Set(), recoveredEvents: new Set(), recoveredRevenue: 0 });
        }
        const item = causeMap.get(cause)!;
        item.events.add(re.id);
        const pa = paMap.get(re.paymentAttemptId);
        if (recoveredEventIds.has(re.paymentAttemptId)) {
          item.recoveredEvents.add(re.id);
          item.recoveredRevenue += pa?.amount || 0;
        }
      }

      const byCause = Array.from(causeMap.entries()).map(([cause, data]) => ({
        cause,
        events: data.events.size,
        recoveredEvents: data.recoveredEvents.size,
        recoveredRevenue: data.recoveredRevenue,
      }));

      metricsList.push({
        currency: curr,
        totalRevenueAtRisk,
        totalRecoveredRevenue,
        unrecoveredRevenue,
        recoveryRate,
        riskEventsDetected,
        recoveredEvents,
        unrecoveredEvents,
        activeRecoveries,
        stoppedRecoveries,
        totalInterventionAttempts,
        byIntervention,
        byCause,
      });
    }

    return res.json({
      success: true,
      metrics: metricsList.length === 1 ? metricsList[0] : metricsList,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
