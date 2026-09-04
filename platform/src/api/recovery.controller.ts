import { Request, Response } from 'express';
import { OutcomeRepository } from '../../../SelectInterventionPipelineOrchestration/src/outcome/persistence/outcome.repository.js';
import { RecoveryControlService } from '../../../SelectInterventionPipelineOrchestration/src/outcome/control/recovery-control.service.js';
import { RecoveryAuditService } from '../../../SelectInterventionPipelineOrchestration/src/outcome/audit/recovery-audit.service.js';

const repository = new OutcomeRepository();
const controlService = new RecoveryControlService(repository);
const auditService = new RecoveryAuditService(repository);

export async function stopRecoveryHandler(req: Request, res: Response) {
  try {
    const { riskEventId } = req.params;
    const { reason } = req.body || {};
    const merchantId = (req as any).merchantId || req.headers['x-merchant-id'] || req.query.merchantId;

    if (!merchantId) {
      return res.status(400).json({ success: false, error: 'Merchant ID is required (x-merchant-id header or merchantId query)' });
    }

    const control = await controlService.stopRecoveryByMerchant(String(merchantId), riskEventId, reason);
    return res.json({
      success: true,
      message: 'Recovery workflow manually stopped by merchant',
      control,
    });
  } catch (err: any) {
    if (err.message === 'RISK_EVENT_NOT_FOUND_FOR_MERCHANT') {
      return res.status(44).json({ success: false, error: 'Risk event not found for merchant' });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getRecoveriesHandler(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchantId || req.headers['x-merchant-id'] || req.query.merchantId;
    if (!merchantId) {
      return res.status(400).json({ success: false, error: 'Merchant ID is required' });
    }

    const recoveries = await repository.getActiveRecoveries(String(merchantId));
    return res.json({ success: true, count: recoveries.length, recoveries });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getRecoveryDetailHandler(req: Request, res: Response) {
  try {
    const { riskEventId } = req.params;
    const detail = await repository.getRecoveryDetail(riskEventId);
    if (!detail) {
      return res.status(404).json({ success: false, error: 'Recovery event not found' });
    }
    return res.json({ success: true, recovery: detail });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getSingleRecoveryAuditHandler(req: Request, res: Response) {
  try {
    const { riskEventId } = req.params;
    const timeline = await auditService.getTimeline(riskEventId);
    return res.json({ success: true, count: timeline.length, auditTimeline: timeline });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getMerchantAuditsHandler(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchantId || req.headers['x-merchant-id'] || req.query.merchantId;
    if (!merchantId) {
      return res.status(400).json({ success: false, error: 'Merchant ID is required' });
    }

    const audits = await auditService.getMerchantAudits(String(merchantId));
    return res.json({ success: true, count: audits.length, audits });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getRecoveryMetricsHandler(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchantId || req.headers['x-merchant-id'] || req.query.merchantId;
    if (!merchantId) {
      return res.status(400).json({ success: false, error: 'Merchant ID is required' });
    }

    const metricsByCurrency = await repository.getRecoveryMetrics(String(merchantId));
    return res.json({
      success: true,
      metrics: metricsByCurrency.length === 1 ? metricsByCurrency[0] : metricsByCurrency,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
