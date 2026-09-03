import { InterventionType } from '../catalog/intervention.types.js';
import {
  ComplianceStatus,
  EffectiveBoundary,
  EventContext,
  PolicyEvaluationResult,
} from './policy.types.js';

export interface CurrentRecoveryState {
  attemptsUsed: number;
  secondsSinceLastAttempt?: number;
}

export interface ComplianceContext {
  status: ComplianceStatus;
  reason?: string;
  source?: string;
}

export interface MerchantState {
  recoveryEnabled: boolean;
}

export function evaluateIntervention(
  effectiveBoundary: EffectiveBoundary,
  currentRecoveryState: CurrentRecoveryState,
  complianceContext: ComplianceContext,
  merchantState: MerchantState,
  _eventContext: EventContext = {}
): PolicyEvaluationResult {
  const reasons: string[] = [];
  const checks = {
    killSwitch: 'PASS' as 'PASS' | 'FAIL',
    compliance: 'PASS' as 'PASS' | 'FAIL',
    frequency: 'PASS' as 'PASS' | 'FAIL',
    coolOff: 'PASS' as 'PASS' | 'FAIL',
  };

  if (!merchantState.recoveryEnabled || !effectiveBoundary.allowed) {
    checks.killSwitch = 'FAIL';
    reasons.push(effectiveBoundary.reason || 'Recovery is disabled by policy');
    return result('REJECTED', effectiveBoundary.interventionType, checks, reasons, effectiveBoundary);
  }

  if (effectiveBoundary.complianceRequired && complianceContext.status !== 'ALLOWED') {
    checks.compliance = 'FAIL';
    reasons.push(complianceContext.reason || `Compliance status ${complianceContext.status} does not allow execution`);
    return result('REJECTED', effectiveBoundary.interventionType, checks, reasons, effectiveBoundary);
  }

  if (currentRecoveryState.attemptsUsed >= effectiveBoundary.maxAttempts || effectiveBoundary.attemptsRemaining <= 0) {
    checks.frequency = 'FAIL';
    reasons.push('Maximum actual recovery attempts reached');
    return result('REJECTED', effectiveBoundary.interventionType, checks, reasons, effectiveBoundary);
  }

  if (
    currentRecoveryState.secondsSinceLastAttempt !== undefined &&
    currentRecoveryState.secondsSinceLastAttempt < effectiveBoundary.coolOffSeconds
  ) {
    checks.coolOff = 'FAIL';
    reasons.push(`Cool-off has not elapsed; wait ${effectiveBoundary.coolOffSeconds - currentRecoveryState.secondsSinceLastAttempt} more seconds`);
    return result('REJECTED', effectiveBoundary.interventionType, checks, reasons, effectiveBoundary);
  }

  if (effectiveBoundary.requiresHumanApproval) {
    reasons.push('Human approval is required before execution');
    return result('APPROVAL_REQUIRED', effectiveBoundary.interventionType, checks, reasons, effectiveBoundary);
  }

  return result('ALLOWED', effectiveBoundary.interventionType, checks, reasons, effectiveBoundary);
}

function result(
  decision: PolicyEvaluationResult['decision'],
  interventionType: InterventionType,
  checks: PolicyEvaluationResult['checks'],
  reasons: string[],
  effectiveBoundary: EffectiveBoundary
): PolicyEvaluationResult {
  return {
    decision,
    interventionType,
    checks,
    reasons,
    effectiveBoundary,
    policyVersion: effectiveBoundary.policyVersion,
  };
}
