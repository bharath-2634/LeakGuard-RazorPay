import { config } from '../../../config/env.js';
import { InterventionDefinition } from '../catalog/intervention.types.js';
import { calculateDeterministicFallback } from './fallback-selector.js';
import { buildInterventionSelectionPrompt } from './prompt-builder.js';
import {
  InterventionSelectionResult,
  InterventionSelector,
  RecoveryContext
} from './selection.types.js';
import { validateGeminiOutput } from './validator.js';

export class GeminiInterventionSelector implements InterventionSelector {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.GEMINI_API_KEY;
  }

  async select(
    context: RecoveryContext,
    candidates: InterventionDefinition[]
  ): Promise<InterventionSelectionResult> {
    const correlationId =
      context.metadata?.correlationId ||
      context.event?.riskEventId ||
      `corr_${Date.now()}`;
    const candidateTypes = candidates.map((c) => c.type);

    if (!candidates || candidates.length === 0) {
      return {
        selector: 'GeminiInterventionSelector',
        selectorVersion: 'v1.0.0',
        rankedCandidates: [],
        reasoningSummary: 'No eligible candidates provided to selection engine.',
        fallbackUsed: false,
        correlationId,
        status: 'NO_ELIGIBLE_INTERVENTIONS'
      };
    }

    const promptText = buildInterventionSelectionPrompt(context, candidates);

    const modelsToTry = ['gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-2.0-flash-exp', 'gemini-2.5-flash'];

    for (const modelName of modelsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': this.apiKey
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 1024
              }
            }),
            signal: controller.signal
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn(`[Gemini Selector] API call to ${modelName} returned HTTP ${response.status}`);
          continue;
        }

        const data: any = await response.json();
        const candidateResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!candidateResponse) {
          console.warn(`[Gemini Selector] ${modelName} returned empty text payload`);
          continue;
        }

        const validation = validateGeminiOutput(candidateResponse, candidateTypes);

        if (!validation.valid || !validation.rankedCandidates) {
          console.warn(
            `[Gemini Selector] Output validation failed for model ${modelName}: ${validation.error}. Invoking fallback.`
          );
          break; // Validation failure -> break and fallback
        }

        return {
          selector: 'GeminiInterventionSelector',
          selectorVersion: 'v1.0.0',
          model: modelName,
          rankedCandidates: validation.rankedCandidates,
          selectedCandidate: validation.rankedCandidates[0],
          reasoningSummary: validation.reasoningSummary || 'Ranked candidates based on recovery fit.',
          fallbackUsed: false,
          correlationId,
          status: 'COMPLETED'
        };
      } catch (err: any) {
        console.warn(`[Gemini Selector] Call failed for ${modelName}: ${err.message}`);
      }
    }

    // Deterministic Fallback if Gemini fails, times out, or output is invalid
    const fallback = calculateDeterministicFallback(context, candidates);
    return {
      selector: 'deterministic-fallback',
      selectorVersion: 'v1.0.0',
      rankedCandidates: fallback.rankedCandidates,
      selectedCandidate: fallback.rankedCandidates[0],
      reasoningSummary: fallback.reasoningSummary,
      fallbackUsed: true,
      correlationId,
      status: 'COMPLETED'
    };
  }
}
