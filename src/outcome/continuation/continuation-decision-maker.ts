import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../../config/env.js';
import { OutcomeRepository } from '../persistence/outcome.repository.js';
import { ContinuationContext, ContinuationDecisionResult } from '../types/outcome.types.js';

export class ContinuationDecisionMaker {
  private genAI = config.GEMINI_API_KEY ? new GoogleGenerativeAI(config.GEMINI_API_KEY) : null;

  constructor(private repository: OutcomeRepository = new OutcomeRepository()) {}

  async decideContinuation(ctx: ContinuationContext): Promise<ContinuationDecisionResult> {
    // 1. HARD DETERMINISTIC STOP RULES (Check BEFORE Gemini)
    if (ctx.riskEventId) {
      const control = await this.repository.getRecoveryControl(ctx.riskEventId);
      if (control && control.status === 'STOPPED') {
        return {
          continue: false,
          reason: `Recovery manually stopped by ${control.stoppedBy || 'MERCHANT'}: ${control.stopReason || 'No reason provided'}`,
          evaluator: 'DETERMINISTIC_STOP',
        };
      }
    }

    const obligation = await this.repository.getRevenueObligation(ctx.merchantId, ctx.merchantOrderId);
    if (obligation && obligation.status === 'RESOLVED') {
      return {
        continue: false,
        reason: 'Revenue obligation has already been resolved by customer payment',
        evaluator: 'DETERMINISTIC_STOP',
      };
    }

    if (ctx.attemptsUsed >= ctx.maxAttempts) {
      return {
        continue: false,
        reason: `Maximum allowed recovery attempts (${ctx.maxAttempts}) exhausted`,
        evaluator: 'DETERMINISTIC_STOP',
      };
    }

    if (!ctx.remainingEligibleInterventions || ctx.remainingEligibleInterventions.length === 0) {
      return {
        continue: false,
        reason: 'No remaining statically eligible interventions in catalog',
        evaluator: 'DETERMINISTIC_STOP',
      };
    }

    // 2. GEMINI CONTINUATION REASONING (Sanitized PII-free context)
    if (this.genAI) {
      try {
        const result = await this.callGeminiContinuationReasoning(ctx);
        if (result) {
          // 3. DETERMINISTIC GUARDRAIL VALIDATION ON GEMINI OUTPUT
          if (result.continue && result.preferredNextIntervention) {
            if (!ctx.remainingEligibleInterventions.includes(result.preferredNextIntervention)) {
              // Override invalid recommendation with top valid candidate
              result.preferredNextIntervention = ctx.remainingEligibleInterventions[0];
            }
          }
          return { ...result, evaluator: 'GEMINI_REASONING' };
        }
      } catch (err) {
        console.warn('[ContinuationDecisionMaker] Gemini call failed, resorting to deterministic fallback:', (err as Error).message);
      }
    }

    // 4. DETERMINISTIC FALLBACK IF GEMINI IS UNAVAILABLE
    const fallbackNext = ctx.remainingEligibleInterventions[0];
    return {
      continue: true,
      reason: `Eligible intervention candidate '${fallbackNext}' available within boundary limits`,
      preferredNextIntervention: fallbackNext,
      confidence: 80,
      evaluator: 'DETERMINISTIC_GUARDRAIL',
    };
  }

  private async callGeminiContinuationReasoning(ctx: ContinuationContext): Promise<ContinuationDecisionResult | null> {
    const models = ['gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'];
    const sanitizedPrompt = {
      event: {
        cause: ctx.diagnosedCause,
        priority: ctx.priority,
        amount: ctx.amount,
        currency: ctx.currency,
      },
      customer: {
        segment: ctx.customerSegment || 'REGULAR',
        historicalLtv: ctx.historicalLtv || 0,
      },
      attemptProgress: {
        attemptsUsed: ctx.attemptsUsed,
        maxAttempts: ctx.maxAttempts,
      },
      previousAttempts: ctx.previousAttempts,
      previousOutcomes: ctx.previousOutcomes,
      remainingEligibleInterventions: ctx.remainingEligibleInterventions,
    };

    for (const modelName of models) {
      try {
        const model = this.genAI!.getGenerativeModel({ model: modelName });
        const res = await model.generateContent({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `You are an expert revenue recovery continuation reasoner for LeakGuard.
Evaluate whether to spend another recovery attempt based on the following context.
Return ONLY valid JSON matching this schema:
{
  "continue": boolean,
  "reason": "explanation string",
  "preferredNextIntervention": "type from remainingEligibleInterventions or null",
  "confidence": number
}

Context:
${JSON.stringify(sanitizedPrompt, null, 2)}`,
                },
              ],
            },
          ],
        });

        const text = res.response.text().trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            continue: Boolean(parsed.continue),
            reason: String(parsed.reason || 'Gemini continuation decision'),
            preferredNextIntervention: parsed.preferredNextIntervention || undefined,
            confidence: Number(parsed.confidence || 75),
            evaluator: 'GEMINI_REASONING',
          };
        }
      } catch {
        continue;
      }
    }
    return null;
  }
}
