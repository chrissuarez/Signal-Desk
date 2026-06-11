/**
 * Recommended Action routing seam — pure (issue #11 commit 9; ADR-0005 decision #13).
 *
 * Decides the system's routing from scored signals. Pure: signals in, decision out.
 *
 * `legacyRoute` is #11's placeholder: today's status/alert ternaries, verbatim. It is
 * still wired into the orchestrator until #13 commits 5–7 migrate the call sites, after
 * which it is removed.
 *
 * `decideRecommendedAction` is the real ADR-0005 decision (#13 commit 3): a pure map
 * from target-shaped `RecommendedActionSignals` to a `RecommendedAction`. Its interface
 * is final from day one — every arm (including the category arms) is implemented and
 * tested now, but the category/risk arms stay DORMANT until the real category adapter
 * lands (#7b). The only arm that fires live in #13 is the null-category fallback, fed by
 * the legacy fitScore adapter.
 */

import type { RoutingDecision, RecommendedAction } from '../services/ingestion/types.js';
import type { StrategicCategory, RiskLevel } from './strategicVocabulary.js';

export interface RoutingSignals {
  fitScore: number;
}

export interface RecommendedActionRouting {
  (signals: RoutingSignals): RoutingDecision;
}

/** Legacy routing: today's status/alert ternaries, verbatim. Removed in #13 commits 5–7. */
export const legacyRoute: RecommendedActionRouting = (signals) => ({
  status: signals.fitScore < 40 ? 'DISMISSED' : 'NEW',
  shouldAlert: signals.fitScore >= 80,
});

/**
 * The target-shaped routing input. The legacy fitScore adapter (#13 commit 4) supplies a
 * degenerate shape (`category: null`, risks `LOW`, `strategicScore = fitScore`); the real
 * category+risk adapter (#7b) lights up the dormant category arms with zero change here.
 */
export interface RecommendedActionSignals {
  /** How good the role is. Today's adapter passes `fitScore`; #4 swaps in the Strategic Score. */
  strategicScore: number;
  /** What kind of role it is — `null` until the category adapter lands (#7b). */
  category: StrategicCategory | null;
  seoComfortZoneRisk: RiskLevel;
  resourceAdminTrapRisk: RiskLevel;
}

/** At/above this score a top-of-funnel role alerts; below it (null category) it is stored. */
const ALERT_SCORE = 80;
/** Below this score a role is stored (visible, bottom-ranked) regardless of category. */
const LOW_SCORE = 40;

/**
 * The full ADR-0005 mapping. Deterministic precedence:
 *   1. Null category (legacy/live arm): score ≥ 80 → ALERT, else STORE.
 *   2. Confirmed-bad categories (RESOURCE_ADMIN_TRAP, REJECT) → SUPPRESS (hidden, not deleted).
 *   3. SEO comfort zone, or a HIGH trap-risk *flag* (not the confirmed category) → STORE.
 *   4. Low score → STORE, even for an otherwise-promising category.
 *   5. STRATEGIC_FIT, or a high-scoring USEFUL_BRIDGE, with no HIGH risk flag → ALERT.
 *   6. Weaker USEFUL_BRIDGE / ambiguous GENERIC_OPS_UNCLEAR → DIGEST.
 *   7. Anything left → STORE.
 */
export const decideRecommendedAction = (signals: RecommendedActionSignals): RecommendedAction => {
  const { strategicScore, category, seoComfortZoneRisk, resourceAdminTrapRisk } = signals;

  // 1. Null-category fallback — the only arm that fires live in #13.
  if (category === null) {
    return strategicScore >= ALERT_SCORE ? 'ALERT' : 'STORE';
  }

  // 2. Confirmed-bad categories are hidden (SUPPRESS persists but excludes from default views).
  if (category === 'RESOURCE_ADMIN_TRAP' || category === 'REJECT') {
    return 'SUPPRESS';
  }

  // 3. SEO comfort zone, or a high trap-risk flag, is stored (visible, bottom-ranked) — not hidden.
  if (category === 'SEO_COMFORT_ZONE' || resourceAdminTrapRisk === 'HIGH') {
    return 'STORE';
  }

  // 4. Low score is stored regardless of an otherwise-promising category.
  if (strategicScore < LOW_SCORE) {
    return 'STORE';
  }

  // 5. Top of funnel alerts — unless a risk flag is HIGH. (Trap-risk HIGH already STORE'd above.)
  const noHighRisk = seoComfortZoneRisk !== 'HIGH';
  if (noHighRisk && (category === 'STRATEGIC_FIT' || (category === 'USEFUL_BRIDGE' && strategicScore >= ALERT_SCORE))) {
    return 'ALERT';
  }

  // 6. Weaker bridges and ambiguous ops go to the digest.
  if (category === 'USEFUL_BRIDGE' || category === 'GENERIC_OPS_UNCLEAR') {
    return 'DIGEST';
  }

  // 7. Fallback.
  return 'STORE';
};
