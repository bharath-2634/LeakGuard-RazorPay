import { InterventionDefinition } from '../catalog/intervention.types.js';
import { RankedIntervention, RecoveryContext } from './selection.types.js';

export function calculateDeterministicFallback(
  context: RecoveryContext,
  candidates: InterventionDefinition[]
): {
  rankedCandidates: RankedIntervention[];
  reasoningSummary: string;
} {
  const scored = candidates.map((c) => {
    let priorityScore = 50;
    if (c.priority === 'HIGH') priorityScore = 100;
    else if (c.priority === 'MEDIUM') priorityScore = 60;
    else if (c.priority === 'LOW') priorityScore = 20;

    const probScore = Math.min(100, Math.max(0, (c.expectedRecoveryProbability ?? 0.5) * 100));
    const costEfficiency = Math.max(0, 100 - Math.min(100, c.estimatedCost ?? 5));

    const fallbackScore = Math.round(
      priorityScore * 0.40 + probScore * 0.40 + costEfficiency * 0.20
    );

    return {
      candidate: c,
      score: fallbackScore
    };
  });

  // Sort descending by score, tie-break deterministically by interventionType
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.candidate.type.localeCompare(b.candidate.type);
  });

  const cause = context.diagnosis?.cause || context.diagnosis?.diagnosedCause || 'UNKNOWN';

  const rankedCandidates: RankedIntervention[] = scored.map((item, idx) => ({
    interventionType: item.candidate.type,
    rank: idx + 1,
    score: item.score,
    rationale: `Deterministic fallback ranking based on priority (${item.candidate.priority}), recovery probability (${item.candidate.expectedRecoveryProbability}), and cost efficiency.`,
    expectedOutcome: `Execute ${item.candidate.name} as candidate rank #${idx + 1}`,
    risks: item.candidate.requiresHumanApproval
      ? ['Requires human approval before execution']
      : ['Candidate execution may be ignored by customer']
  }));

  const reasoningSummary = `Deterministic fallback ranking calculated for ${candidates.length} eligible candidates for failure cause '${cause}' using rule-based priority, recovery probability, and cost efficiency.`;

  return {
    rankedCandidates,
    reasoningSummary
  };
}
