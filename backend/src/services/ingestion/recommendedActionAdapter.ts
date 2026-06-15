/**
 * Reconciled-result → routing-signals adapter (issue #13 commit 4; lit up by #5).
 *
 * The adapter behind the Recommended Action routing seam. Through #13/#4 this was a *degenerate*
 * `scoreToSignals` that hardcoded `category: null` + LOW risks, so only the decision module's
 * null-category fallback fired and routing was purely score-driven. #5 makes the Strategic
 * Category trustworthy (Guardrail veto + reconciliation), so routing now feeds the real
 * reconciled category + risk flags — the dormant category/risk arms in `decideRecommendedAction`
 * light up with zero change to that pure module (a confirmed RESOURCE_ADMIN_TRAP/REJECT now
 * SUPPRESSes, an SEO comfort zone STOREs, instead of slipping through the score-only arm).
 *
 * A null reconciled category (no LLM category, no force-rule) still routes through the
 * score-driven fallback exactly as before.
 */

import type { RecommendedActionSignals } from '../../engine/recommendedActionRouting.js';
import type { StrategicCategory, RiskLevel } from '../../engine/strategicVocabulary.js';

/**
 * Lift the reconciled #5 result onto the target-shaped routing signals. The reconciled category
 * already encodes the risk-forced precedence (trap/SEO HIGH → forced category); the raw risk
 * flags are passed through too (null → LOW, the routing module's neutral) so the SEO/trap arms
 * route correctly. A null score (un-scored) routes as 0 — un-scored never alerts.
 */
export const reconciledToSignals = (args: {
  strategicScore: number | null;
  category: StrategicCategory | null;
  seoComfortZoneRisk: RiskLevel | null;
  resourceAdminTrapRisk: RiskLevel | null;
}): RecommendedActionSignals => ({
  strategicScore: args.strategicScore ?? 0,
  category: args.category,
  seoComfortZoneRisk: args.seoComfortZoneRisk ?? 'LOW',
  resourceAdminTrapRisk: args.resourceAdminTrapRisk ?? 'LOW',
});
