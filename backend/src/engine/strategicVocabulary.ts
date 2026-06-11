/**
 * Strategic vocabulary — shared type-only declarations (issue #13, plan commit 2).
 *
 * The domain enums that the Strategic Score / category work (#2–#5) and the
 * Recommended Action decision (#13 / ADR-0005) both speak. Forward-declared here with
 * no runtime and nothing wired yet: `decideRecommendedAction` takes its target shape
 * from day one (#13 commit 3) even though the category/risk signals stay degenerate
 * until the real category adapter lands (#7b).
 *
 * Shared type: whichever of #13 / #2 lands first defines these; the other reuses them.
 */

/**
 * What *kind* of role an Opportunity is — the six CONTEXT.md Strategic Category labels.
 * (Category encodes the kind; the Strategic Score encodes how good.)
 */
export type StrategicCategory =
  | 'STRATEGIC_FIT'
  | 'USEFUL_BRIDGE'
  | 'SEO_COMFORT_ZONE'
  | 'RESOURCE_ADMIN_TRAP'
  | 'GENERIC_OPS_UNCLEAR'
  | 'REJECT';

/** Risk-flag / confidence level. */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
