import { RankedIntervention } from './selection.types.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  rankedCandidates?: RankedIntervention[];
  reasoningSummary?: string;
}

export function validateGeminiOutput(
  rawResponseText: string,
  suppliedCandidateTypes: string[]
): ValidationResult {
  try {
    // 1. Clean potential markdown formatting
    let cleanedText = rawResponseText.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanedText);

    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'Output is not a valid JSON object' };
    }

    if (typeof parsed.reasoningSummary !== 'string' || !parsed.reasoningSummary.trim()) {
      return { valid: false, error: 'Missing or empty reasoningSummary string' };
    }

    if (!Array.isArray(parsed.rankedCandidates)) {
      return { valid: false, error: 'rankedCandidates must be an array' };
    }

    const rankedCandidates: RankedIntervention[] = parsed.rankedCandidates;

    // 2. Length check
    if (rankedCandidates.length !== suppliedCandidateTypes.length) {
      return {
        valid: false,
        error: `Candidate count mismatch. Supplied: ${suppliedCandidateTypes.length}, Returned: ${rankedCandidates.length}`
      };
    }

    const suppliedSet = new Set(suppliedCandidateTypes);
    const seenTypes = new Set<string>();

    for (let i = 0; i < rankedCandidates.length; i++) {
      const item = rankedCandidates[i];

      if (!item || typeof item !== 'object') {
        return { valid: false, error: `Invalid item at index ${i}` };
      }

      if (typeof item.interventionType !== 'string') {
        return { valid: false, error: `Item at index ${i} has invalid interventionType` };
      }

      // 3. Whitelist check
      if (!suppliedSet.has(item.interventionType)) {
        return {
          valid: false,
          error: `Hallucinated intervention "${item.interventionType}" not in candidate whitelist [${suppliedCandidateTypes.join(', ')}]`
        };
      }

      // 4. Uniqueness check
      if (seenTypes.has(item.interventionType)) {
        return {
          valid: false,
          error: `Duplicate intervention "${item.interventionType}" in response`
        };
      }
      seenTypes.add(item.interventionType);

      // 5. Rank check
      const expectedRank = i + 1;
      if (typeof item.rank !== 'number' || item.rank !== expectedRank) {
        return {
          valid: false,
          error: `Invalid rank ${item.rank} at index ${i}, expected ${expectedRank}`
        };
      }

      // 6. Score check
      if (typeof item.score !== 'number' || item.score < 0 || item.score > 100) {
        return {
          valid: false,
          error: `Score ${item.score} out of valid range [0, 100] for candidate "${item.interventionType}"`
        };
      }

      // Optional text fields default fallback if omitted by Gemini
      if (!item.rationale) item.rationale = 'Evaluated candidate for recovery fit';
      if (!item.expectedOutcome) item.expectedOutcome = 'Initiate recovery action';
      if (!Array.isArray(item.risks)) item.risks = [];
    }

    return {
      valid: true,
      rankedCandidates,
      reasoningSummary: parsed.reasoningSummary
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `Failed to parse Gemini output as JSON: ${err.message}`
    };
  }
}
