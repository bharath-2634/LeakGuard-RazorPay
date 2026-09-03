import { getEligibleInterventionsForContext } from '../catalog/intervention-catalog.js';
import { GeminiInterventionSelector } from './gemini-selector.js';
import {
  InterventionSelectionResult,
  InterventionSelector,
  RecoveryContext
} from './selection.types.js';
import { evaluateCandidatePolicy } from '../policy/policy-engine.js';
import { InterventionType } from '../catalog/intervention.types.js';
import { persistPolicyDecision } from '../../../infrastructure/db/policy-audit-repository.js';

export class InterventionSelectionService {
  private selector: InterventionSelector;

  constructor(selector?: InterventionSelector) {
    this.selector = selector || new GeminiInterventionSelector();
  }

  async processRecoveryContext(context: RecoveryContext): Promise<InterventionSelectionResult> {
    const correlationId =
      context.metadata?.correlationId ||
      context.event?.riskEventId ||
      `corr_${Date.now()}`;

    // 1. Resolution Guard Check
    const isResolved =
      context.payment?.businessState === 'RESOLVED' ||
      context.payment?.providerState === 'CAPTURED';

    if (isResolved) {
      console.log(`[Intervention Selection Service] Payment already RESOLVED for correlationId ${correlationId}. Stopping intervention selection.`);
      return {
        selector: 'InterventionSelectionService',
        selectorVersion: 'v1.0.0',
        rankedCandidates: [],
        reasoningSummary: 'Revenue obligation is already RESOLVED. Recovery intervention stopped.',
        fallbackUsed: false,
        correlationId,
        status: 'STOPPED_ALREADY_RESOLVED'
      };
    }

    // 2. Static Eligibility Filtering
    const diagnosedCause =
      context.diagnosis?.cause ||
      context.diagnosis?.diagnosedCause ||
      'UNKNOWN';

    const eligibilityContext = {
      cause: diagnosedCause,
      customerData: {
        email: context.customer?.email,
        phone: context.customer?.phone,
        customerIdentity: context.customer?.id || context.customer?.externalCustomerId,
        paymentAttemptId: context.event?.paymentAttemptId,
        razorpayOrderId: context.payment?.razorpayOrderId
      },
      merchantConfig: context.merchant?.recoveryConfig ? {
        emailEnabled: context.merchant.recoveryConfig.emailEnabled,
        smsEnabled: context.merchant.recoveryConfig.smsEnabled,
        whatsappEnabled: context.merchant.recoveryConfig.whatsappEnabled,
        humanReviewEnabled: context.merchant.recoveryConfig.humanReviewEnabled,
        humanReviewContact: context.merchant.recoveryConfig.humanReviewEmail || undefined
      } : undefined,
      paymentState: {
        isResolved,
        isDefinitivelyFailed: context.payment?.providerState === 'FAILED'
      }
    };

    const eligibleCandidates = getEligibleInterventionsForContext(eligibilityContext);

    // 3. Empty Candidate Check
    if (eligibleCandidates.length === 0) {
      console.log(`[Intervention Selection Service] No statically eligible candidates for cause '${diagnosedCause}'.`);
      return {
        selector: 'InterventionSelectionService',
        selectorVersion: 'v1.0.0',
        rankedCandidates: [],
        reasoningSummary: `No eligible interventions matched for cause '${diagnosedCause}' and merchant/customer context.`,
        fallbackUsed: false,
        correlationId,
        status: 'NO_ELIGIBLE_INTERVENTIONS'
      };
    }

    // 4. Rank Candidates via Selector (Gemini / Fallback)
    const rankedResult = await this.selector.select(context, eligibleCandidates);
    const evaluateRankedResult = (result: InterventionSelectionResult) => {
      const evaluations = result.rankedCandidates.map((candidate) =>
        evaluateCandidatePolicy(context, candidate.interventionType as InterventionType)
      );
      const executableIndex = evaluations.findIndex(
        (evaluation) => evaluation.decision === 'ALLOWED' || evaluation.decision === 'APPROVAL_REQUIRED'
      );
      return { result, evaluations, executableIndex };
    };

    let evaluated = evaluateRankedResult(rankedResult);
    let replanUsed = false;
    let allEvaluations = [...evaluated.evaluations];

    if (evaluated.executableIndex === -1) {
      replanUsed = true;
      const rejectionReasons = evaluated.evaluations.flatMap((evaluation) => evaluation.reasons);
      const replannedContext: RecoveryContext = {
        ...context,
        policyRejectionReasons: rejectionReasons,
      };
      const replannedResult = await this.selector.select(replannedContext, eligibleCandidates);
      evaluated = evaluateRankedResult(replannedResult);
      allEvaluations = [...allEvaluations, ...evaluated.evaluations];
    }

    if (evaluated.executableIndex === -1) {
      const persisted = await persistPolicyDecision(context, allEvaluations);
      return {
        ...evaluated.result,
        selectedCandidate: undefined,
        policyEvaluations: evaluated.evaluations,
        policyRejectionReasons: evaluated.evaluations.flatMap((evaluation) => evaluation.reasons),
        actualAttempts: (context.previousAttempts || []) as any,
        replanUsed,
        policyEvaluationIds: persisted.policyEvaluationIds,
        status: 'NO_POLICY_ALLOWED_INTERVENTION',
      };
    }

    const selectedCandidate = evaluated.result.rankedCandidates[evaluated.executableIndex];
    const persisted = await persistPolicyDecision(context, allEvaluations, selectedCandidate);
    return {
      ...evaluated.result,
      selectedCandidate,
      policyEvaluations: evaluated.evaluations,
      actualAttempts: (context.previousAttempts || []) as any,
      replanUsed,
      policyEvaluationIds: persisted.policyEvaluationIds,
      executionOutboxId: persisted.executionOutboxId,
      status: 'COMPLETED',
    };
  }
}
