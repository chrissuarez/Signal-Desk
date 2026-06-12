/**
 * Strategic Score aggregator (issue #4) — the headline ranking authority (ADR-0001).
 *
 * ADR-0003 makes the Strategic Score a *computed* number, not an LLM judgement: the code
 * aggregates, the LLM only judges the six Component Scores. This is that aggregator —
 * pure, deterministic, and configurable. It takes the six 0–100 components plus the two
 * risk flags and returns the weighted average minus two risk-driven penalties, clamped to
 * 0–100. No persistence or ranking lives here (that's the ingestion/route wiring); this
 * owns the arithmetic only.
 *
 * Two deliberate semantic choices (Chris's call, 2026-06-12), both flowing from the #3
 * "null means unknown, never fabricate a value" contract:
 *
 *   1. Penalty scaling by severity — ADR-0003 fixes only the *max* penalty (HIGH). A LOW
 *      flag is the model saying "barely a concern", so it costs nothing; MEDIUM costs
 *      half; HIGH costs the full max. null/absent → 0. (SEO max −20, trap max −30.)
 *
 *   2. Missing components renormalize — a null component was *not judged*, not judged
 *      zero. We average only the components that are present (rescaling their weights), so
 *      a partially-judged role is neither helped nor dragged down by the gaps. A role with
 *      no LLM-judged component scores null (un-analysed), mirroring EMPTY_STRATEGIC_ANALYSIS
 *      — practicalFit (Fit-sourced) contributes to the headline but cannot, alone, make an
 *      un-analysed role look scored (else its Fit Score would masquerade as the headline).
 *
 * The weights and penalty maxima are configurable (matching how Chris already tunes
 * industry weights) — pass a StrategicScoreConfig to override the ADR-0003 defaults.
 */

import type { RiskLevel } from './strategicVocabulary.js';

/** The six LLM-judged Component Scores (0–100, or null when un-judged) plus the two risk flags. */
export interface StrategicScoreInput {
  consultancyAlignment: number | null;
  deliveryVisibility: number | null;
  commercialProximity: number | null;
  buyerEnvironmentFit: number | null;
  seniorityScope: number | null;
  practicalFit: number | null;
  resourceAdminTrapRisk: RiskLevel | null;
  seoComfortZoneRisk: RiskLevel | null;
}

/** The relative weight of each Component Score in the headline (need not sum to 100). */
export type StrategicScoreWeights = Record<
  'consultancyAlignment' | 'deliveryVisibility' | 'commercialProximity' | 'buyerEnvironmentFit' | 'seniorityScope' | 'practicalFit',
  number
>;

export interface StrategicScoreConfig {
  weights: StrategicScoreWeights;
  /** Max points subtracted when seoComfortZoneRisk is HIGH. */
  seoPenaltyMax: number;
  /** Max points subtracted when resourceAdminTrapRisk is HIGH. */
  trapPenaltyMax: number;
}

/** ADR-0003 weights: 30/20/15/15/10/10 across the six components (sum 100). */
export const DEFAULT_STRATEGIC_WEIGHTS: StrategicScoreWeights = {
  consultancyAlignment: 30,
  deliveryVisibility: 20,
  commercialProximity: 15,
  buyerEnvironmentFit: 15,
  seniorityScope: 10,
  practicalFit: 10,
};

/** ADR-0003 defaults: 30/20/15/15/10/10 weights, SEO penalty ≤20, trap penalty ≤30. */
export const DEFAULT_STRATEGIC_SCORE_CONFIG: StrategicScoreConfig = {
  weights: DEFAULT_STRATEGIC_WEIGHTS,
  seoPenaltyMax: 20,
  trapPenaltyMax: 30,
};

/** Fraction of the max penalty a risk level incurs: LOW (and null) 0, MEDIUM ½, HIGH full. */
const penaltyFraction = (level: RiskLevel | null): number =>
  level === 'HIGH' ? 1 : level === 'MEDIUM' ? 0.5 : 0;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Compute the headline Strategic Score from a block of components + risk flags.
 * Returns an integer 0–100, or null when no LLM component was judged (so an un-analysed
 * Opportunity reads as "unknown", not as a real lowest score — and a Fit-only fallback
 * never fabricates a headline from the Fit Score alone).
 */
export const computeStrategicScore = (
  input: StrategicScoreInput,
  config: StrategicScoreConfig = DEFAULT_STRATEGIC_SCORE_CONFIG,
): number | null => {
  const { weights } = config;
  const components: Array<[keyof StrategicScoreWeights, number | null]> = [
    ['consultancyAlignment', input.consultancyAlignment],
    ['deliveryVisibility', input.deliveryVisibility],
    ['commercialProximity', input.commercialProximity],
    ['buyerEnvironmentFit', input.buyerEnvironmentFit],
    ['seniorityScope', input.seniorityScope],
    ['practicalFit', input.practicalFit],
  ];

  // The Strategic Score reflects *strategic* analysis. `practicalFit` is the Fit-sourced
  // Practical Fit component, not a standalone score — it contributes to the headline when
  // the role was judged, but it must not, on its own, make an un-analysed role look scored.
  // So if the LLM judged none of its five components (an EMPTY analysis: no key / parse
  // failure), the score is null even though practicalFit is always present from the Fit
  // Score. Otherwise a high-Fit/unanalysed row would fabricate a Strategic Score equal to
  // its Fit Score and could wrongly ALERT — exactly the Fit-driven ranking ADR-0001 retires.
  const hasJudgedComponent =
    input.consultancyAlignment !== null ||
    input.deliveryVisibility !== null ||
    input.commercialProximity !== null ||
    input.buyerEnvironmentFit !== null ||
    input.seniorityScope !== null;
  if (!hasJudgedComponent) return null;

  let weightedSum = 0;
  let weightTotal = 0;
  for (const [key, score] of components) {
    if (score === null) continue;
    const weight = weights[key];
    weightedSum += clamp(score, 0, 100) * weight;
    weightTotal += weight;
  }

  // Defensive: with a judged component above this is unreachable, but never divide by zero.
  if (weightTotal === 0) return null;

  const headline = weightedSum / weightTotal; // weighted average over judged components, 0–100
  const seoPenalty = config.seoPenaltyMax * penaltyFraction(input.seoComfortZoneRisk);
  const trapPenalty = config.trapPenaltyMax * penaltyFraction(input.resourceAdminTrapRisk);

  return clamp(Math.round(headline - seoPenalty - trapPenalty), 0, 100);
};
