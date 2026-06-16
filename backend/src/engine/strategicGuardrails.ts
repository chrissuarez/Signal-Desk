/**
 * Deterministic score Guardrails — pure (issue #5, ADR-0002 / CONTEXT.md "Guardrail").
 *
 * Guardrails *veto*, they do not score: a non-negotiable deterministic rule that can override
 * the LLM's number/category. This owns the rules that bound the *score* (the category force-
 * rules driven by risk flags live in strategicReconcile); it runs BEFORE reconciliation so the
 * category clamp there sees the capped score.
 *
 *   - Excluded industry → hard veto: force REJECT + cap the score to 0 (a null/un-scored row
 *     stays null — we force the category but never fabricate a number) + a concern.
 *   - Penalty keyword (in title/description) → cap the score (a comfort-zone/trap signal must
 *     not read as high) + a concern.
 *   - Tier-1 boost keyword → raise a floor (a clearly-strategic signal isn't buried).
 *
 * When a penalty and a Tier-1 keyword both hit, the penalty wins the conflict (cap applied
 * last) — Guardrails stay conservative. Inputs (the keyword/industry lists) are configurable
 * `settings` seeded from the brief; the numeric cap/floor are config with ADR defaults.
 */

import type { StrategicCategory } from './strategicVocabulary.js';

/** The configurable Guardrail *inputs*, persisted under settings key `strategic_guardrails`. */
export interface GuardrailSettings {
  /** Industries that veto an Opportunity outright (substring match on the industry field). */
  excludedIndustries: string[];
  /** Keywords (in title/description) that cap the score — comfort-zone / resource-admin tells. */
  penaltyKeywords: string[];
  /** Tier-1 strategic keywords that raise a score floor. */
  tier1Keywords: string[];
}

/**
 * Brief-seeded Guardrail defaults (CONTEXT.md: the goal is a delivery-visibility / resourcing
 * consultancy, NOT more SEO). Starting values, fully tunable in settings without a redeploy:
 *   - excluded: reputationally off-strategy industries that veto outright;
 *   - penalty: comfort-zone / resource-admin tells that cap the score;
 *   - tier-1: delivery/resourcing/consultancy signals that floor the score.
 */
export const DEFAULT_GUARDRAILS: GuardrailSettings = {
  excludedIndustries: ['Gambling', 'Adult Entertainment', 'MLM'],
  penaltyKeywords: ['link building', 'data entry', 'cold calling', 'keyword stuffing'],
  tier1Keywords: [
    'delivery lead',
    'head of delivery',
    'delivery director',
    'resource management',
    'capacity planning',
    'consultancy',
    'practice lead',
    'engagement manager',
  ],
};

/** The numeric bounds a Guardrail applies (configurable; ADR defaults below). */
export interface GuardrailConfig {
  /** Upper bound imposed when a penalty keyword hits. */
  penaltyCap: number;
  /** Lower bound imposed when a Tier-1 keyword hits. */
  tier1Floor: number;
}

export const DEFAULT_GUARDRAIL_CONFIG: GuardrailConfig = {
  penaltyCap: 40,
  tier1Floor: 60,
};

/** What the Guardrails inspect: the computed score plus the role's industry/title/description. */
export interface GuardrailTarget {
  /** The computed Strategic Score (#4), or null when un-scored. */
  score: number | null;
  industry?: string;
  title: string;
  description: string;
}

export interface GuardrailResult {
  /** The score after Guardrails (0 on an industry veto; capped/floored; null stays null). */
  score: number | null;
  /** A category a Guardrail forces (only REJECT, on an industry veto); else absent. */
  forcedCategory?: StrategicCategory;
  /** Human-readable concerns explaining any veto/cap, to merge into the row's concerns. */
  concerns: string[];
}

/** A needle matches a text when it is non-blank and appears (case-insensitively) as a substring.
 *  A blank/whitespace-only needle never matches — else it would match every text. */
const matches = (text: string, needle: string): boolean => {
  const n = needle.trim().toLowerCase();
  return n.length > 0 && text.includes(n);
};

const includesAny = (haystack: string, needles: string[]): string | undefined =>
  needles.find((n) => matches(haystack, n));

/**
 * Apply the deterministic score Guardrails to a computed score. Pure: returns the bounded
 * score, any forced category, and concerns — it never mutates its inputs or does I/O.
 */
export const applyScoreGuardrails = (
  target: GuardrailTarget,
  settings: GuardrailSettings,
  config: GuardrailConfig = DEFAULT_GUARDRAIL_CONFIG,
): GuardrailResult => {
  const concerns: string[] = [];
  const haystack = `${target.title} ${target.description}`.toLowerCase();
  const industry = (target.industry ?? '').toLowerCase();

  // Hard veto: an excluded industry forces REJECT and caps any real score to 0. A null score
  // stays null — we force the category but must not fabricate a number (the #3/#4 null contract).
  // The AI extractor only emits broad industry labels (the Gemini prompt: "Marketing, Creative & Digital",
  // "Other", …), so the granular veto list ("Gambling", "Adult Entertainment", "MLM") would never
  // match the industry field alone — scan the title/description too, the way penalties/tier-1 do.
  const excluded = settings.excludedIndustries.find(
    (ind) => matches(industry, ind) || matches(haystack, ind),
  );
  if (excluded) {
    concerns.push(`Excluded industry (Guardrail): ${excluded}`);
    return { score: target.score === null ? null : 0, forcedCategory: 'REJECT', concerns };
  }

  let score = target.score;
  if (score !== null) {
    const tier1 = includesAny(haystack, settings.tier1Keywords);
    const penalty = includesAny(haystack, settings.penaltyKeywords);
    // Tier-1 floor first, penalty cap last → a penalty wins a direct floor/cap conflict.
    if (tier1) score = Math.max(score, config.tier1Floor);
    if (penalty) {
      const capped = Math.min(score, config.penaltyCap);
      if (capped < score) concerns.push(`Penalty keyword (Guardrail): ${penalty}`);
      score = capped;
    }
  }

  return { score, concerns };
};
