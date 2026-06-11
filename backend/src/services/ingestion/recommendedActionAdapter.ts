/**
 * Legacy fitScore → routing-signals adapter (issue #13, plan commit 4).
 *
 * The first (legacy) adapter behind the Recommended Action routing seam: it maps today's
 * only real signal — `fitScore` — onto the target-shaped `RecommendedActionSignals` in a
 * degenerate form (`category: null`, both risks `LOW`, `strategicScore = fitScore`). With
 * a null category only the decision module's null-category fallback fires, so live
 * behaviour stays score-driven. #7b replaces this with the real category+risk adapter and
 * the dormant category arms light up — zero change to `decideRecommendedAction`.
 */

import type { RecommendedActionSignals } from '../../engine/recommendedActionRouting.js';

/** Map a legacy fitScore onto degenerate routing signals. */
export const fitScoreToSignals = (fitScore: number): RecommendedActionSignals => ({
  strategicScore: fitScore,
  category: null,
  seoComfortZoneRisk: 'LOW',
  resourceAdminTrapRisk: 'LOW',
});
