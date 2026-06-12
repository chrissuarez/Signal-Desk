/**
 * Score → routing-signals adapter (issue #13 commit 4; Strategic Score fed in by #4).
 *
 * The (still-degenerate) adapter behind the Recommended Action routing seam: it lifts a
 * single 0–100 score onto the target-shaped `RecommendedActionSignals` with `category:
 * null` and both risks `LOW`. With a null category only the decision module's
 * null-category fallback fires, so live routing stays score-driven.
 *
 * #13 fed this the legacy `fitScore` (the only score that existed then); #4 feeds it the
 * computed Strategic Score, so ALERT/top-of-dashboard ranking follows the Strategic Score
 * — the ADR-0001 ranking authority — not the Fit Score. #7b replaces this adapter with the
 * real category+risk adapter and the dormant category arms light up — zero change to
 * `decideRecommendedAction`.
 */

import type { RecommendedActionSignals } from '../../engine/recommendedActionRouting.js';

/** Lift a single 0–100 score (today the Strategic Score) onto degenerate routing signals. */
export const scoreToSignals = (score: number): RecommendedActionSignals => ({
  strategicScore: score,
  category: null,
  seoComfortZoneRisk: 'LOW',
  resourceAdminTrapRisk: 'LOW',
});
