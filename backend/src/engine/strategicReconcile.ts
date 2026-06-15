/**
 * Strategic Category reconciliation — pure (issue #5, ADR-0002).
 *
 * The LLM *proposes* a Strategic Category; this enforces coherence with the Strategic Score
 * by a fixed precedence (CONTEXT.md "Strategic Category"), so a category can never contradict
 * the number or an unambiguous risk flag:
 *
 *   1. `resourceAdminTrapRisk === 'HIGH'` forces RESOURCE_ADMIN_TRAP — an unambiguous
 *      resource-admin signal overrides whatever the LLM labelled it.
 *   2. `seoComfortZoneRisk === 'HIGH'` *without strong ops signals* forces SEO_COMFORT_ZONE.
 *      "Strong ops signals" = a strong deliveryVisibility or commercialProximity component
 *      (the consultancy-relevant axes): a genuinely ops-strong role keeps its LLM category
 *      even under a HIGH SEO-comfort flag.
 *   3. Otherwise the LLM's category stands, but is *clamped to the score*: STRATEGIC_FIT
 *      requires `strategicScore >= strategicFitMinScore` (70), else it is demoted (it is not
 *      a strategic fit if the number doesn't back it up). A null score fails the gate — an
 *      un-scored role never reads as a strategic fit (mirrors #4's "null routes as 0").
 *
 * Demotion target and both thresholds are configurable (Chris's call, tunable in settings):
 * a sub-70 STRATEGIC_FIT demotes to USEFUL_BRIDGE (the next-best "kind"), not to a reject.
 *
 * Pure: no I/O, no persistence. Guardrails that *cap the score* run before this (so the
 * clamp here sees the capped score); this owns only the category arithmetic.
 */

import type { RiskLevel, StrategicCategory } from './strategicVocabulary.js';

/** Inputs reconciliation needs: the LLM category, the (guardrail-capped) score, the two risk flags, and the ops-signal components. */
export interface ReconcileInput {
  /** The category the LLM proposed (#2), or null when uncategorised. */
  llmCategory: StrategicCategory | null;
  /** The computed Strategic Score (#4) after any score Guardrails, or null when un-scored. */
  strategicScore: number | null;
  resourceAdminTrapRisk: RiskLevel | null;
  seoComfortZoneRisk: RiskLevel | null;
  /** Consultancy-relevant Component Scores that count as "ops signals" for the SEO clause. */
  deliveryVisibility: number | null;
  commercialProximity: number | null;
}

export interface ReconcileConfig {
  /** Minimum Strategic Score for an LLM STRATEGIC_FIT to stand (else demoted). */
  strategicFitMinScore: number;
  /** A deliveryVisibility/commercialProximity at or above this counts as a strong ops signal. */
  strongOpsSignalMin: number;
  /** Where a sub-threshold STRATEGIC_FIT is demoted to. */
  demotionTarget: StrategicCategory;
}

/** ADR-0002 defaults: STRATEGIC_FIT needs score ≥ 70; ops-signal floor 60; demote to USEFUL_BRIDGE. */
export const DEFAULT_RECONCILE_CONFIG: ReconcileConfig = {
  strategicFitMinScore: 70,
  strongOpsSignalMin: 60,
  demotionTarget: 'USEFUL_BRIDGE',
};

/**
 * Reconcile the LLM-proposed category against the score + risk flags by fixed precedence.
 * Returns the final Strategic Category (or null if the LLM gave none and no force-rule fires).
 */
export const reconcileStrategicCategory = (
  input: ReconcileInput,
  config: ReconcileConfig = DEFAULT_RECONCILE_CONFIG,
): StrategicCategory | null => {
  // Precedence 1: an unambiguous resource-admin signal forces the trap category.
  if (input.resourceAdminTrapRisk === 'HIGH') return 'RESOURCE_ADMIN_TRAP';

  // Precedence 2: a HIGH SEO-comfort flag forces SEO_COMFORT_ZONE, unless the role carries
  // strong ops signals (a real delivery/commercial component), in which case the LLM stands.
  const strongOps =
    (input.deliveryVisibility ?? 0) >= config.strongOpsSignalMin ||
    (input.commercialProximity ?? 0) >= config.strongOpsSignalMin;
  if (input.seoComfortZoneRisk === 'HIGH' && !strongOps) return 'SEO_COMFORT_ZONE';

  // Precedence 3: the LLM category stands, clamped to the score. A STRATEGIC_FIT the number
  // doesn't back up (score < min, or un-scored) is demoted — not shown as a strategic fit.
  if (
    input.llmCategory === 'STRATEGIC_FIT' &&
    (input.strategicScore === null || input.strategicScore < config.strategicFitMinScore)
  ) {
    return config.demotionTarget;
  }

  return input.llmCategory;
};
