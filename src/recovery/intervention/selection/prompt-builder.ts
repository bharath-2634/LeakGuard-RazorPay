import { InterventionDefinition } from '../catalog/intervention.types.js';
import { RecoveryContext } from './selection.types.js';

export function buildInterventionSelectionPrompt(
  context: RecoveryContext,
  candidates: InterventionDefinition[]
): string {
  const cause = context.diagnosis?.cause || context.diagnosis?.diagnosedCause || 'UNKNOWN';
  const candidateTypes = candidates.map((c) => c.type);

  const sanitizedInput = {
    failure: {
      cause,
      confidence: context.diagnosis?.confidence ?? 0.95,
      actionabilityScore: context.diagnosis?.actionabilityScore ?? 90,
      actionabilityStatus: context.diagnosis?.actionabilityStatus ?? 'ACTIONABLE',
      priority: context.diagnosis?.priority ?? 'HIGH'
    },
    economics: {
      revenueAtRisk: context.economics?.revenueAtRisk ?? context.order?.amount ?? 0,
      economicFactor: context.economics?.economicFactor ?? 0.20,
      expectedRecoveryValue: context.economics?.expectedRecoveryValue ?? 0,
      netExpectedRecovery: context.economics?.netExpectedRecovery ?? 0,
      minimumRecoveryThreshold: context.economics?.minimumRecoveryThreshold ?? 0,
      maxRecoveryCost: context.economics?.maxRecoveryCost ?? 0
    },
    customer: {
      hasEmail: Boolean(context.customer?.email),
      hasPhone: Boolean(context.customer?.phone),
      customerSegment: context.customer?.customerSegment || undefined,
      customerValueSegment: context.customer?.customerValueSegment || undefined
    },
    merchant: {
      availableChannels: [
        context.merchant?.recoveryConfig?.whatsappEnabled && 'whatsapp',
        context.merchant?.recoveryConfig?.smsEnabled && 'sms',
        context.merchant?.recoveryConfig?.emailEnabled && 'email',
        context.merchant?.recoveryConfig?.humanReviewEnabled && 'human_review'
      ].filter(Boolean)
    },
    candidates: candidates.map((c) => ({
      interventionType: c.type,
      name: c.name,
      description: c.description,
      priority: c.priority,
      estimatedCost: c.estimatedCost,
      expectedRecoveryProbability: c.expectedRecoveryProbability,
      cooldownSeconds: c.cooldownSeconds,
      maxAttempts: c.maxAttempts,
      supportedChannels: c.supportedChannels,
      requiresPaymentLink: c.requiresPaymentLink,
      requiresHumanApproval: c.requiresHumanApproval
    })),
    previousAttempts: context.previousAttempts || []
  };

  return `You are the intervention ranking component of LeakGuard, an automated revenue recovery system.

Your job is ONLY to rank the supplied eligible recovery interventions according to expected recovery value and appropriateness for the current payment failure.

You are NOT the policy engine.
You are NOT authorized to approve or reject interventions.

CRITICAL CANDIDATE WHITELIST CONSTRAINTS:
1. You may rank ONLY the supplied candidate intervention types listed below:
   Supplied Candidates Whitelist: [${candidateTypes.map((t) => `"${t}"`).join(', ')}]
2. You MUST NOT invent, rename, modify, or introduce any intervention outside this whitelist.
3. You MUST return EVERY supplied candidate EXACTLY ONCE in your ranked list. Do not omit any candidate.

Input Data:
${JSON.stringify(sanitizedInput, null, 2)}

Required Output Format:
Return a single raw JSON object matching this schema EXACTLY without markdown code blocks, backticks, or extra commentary:
{
  "reasoningSummary": "<Concise evaluation explaining the ranking order>",
  "rankedCandidates": [
    {
      "interventionType": "<Must exactly match one of the supplied candidates>",
      "rank": 1,
      "score": <Integer ranking score between 0 and 100>,
      "rationale": "<Reason why this candidate is ranked here>",
      "expectedOutcome": "<Expected recovery result>",
      "risks": ["<Potential risk or drawback>"]
    }
  ]
}`;
}
