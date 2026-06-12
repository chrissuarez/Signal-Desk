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
 *
 * The runtime tuple is the single source of truth; the type is derived from it so the
 * two can never drift. #2 makes this runtime (the validator below); #5 reconciles it.
 */
export const STRATEGIC_CATEGORIES = [
  'STRATEGIC_FIT',
  'USEFUL_BRIDGE',
  'SEO_COMFORT_ZONE',
  'RESOURCE_ADMIN_TRAP',
  'GENERIC_OPS_UNCLEAR',
  'REJECT',
] as const;

export type StrategicCategory = (typeof STRATEGIC_CATEGORIES)[number];

/**
 * Coerce an untrusted category string (e.g. from the LLM) to a known StrategicCategory,
 * or null if it is missing/unrecognised. Tolerant of surrounding whitespace and casing;
 * anything else (unknown label, empty, non-string) becomes null rather than throwing —
 * the field is nullable and a bad label must not poison ingestion.
 */
export const coerceStrategicCategory = (raw: unknown): StrategicCategory | null => {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toUpperCase();
  return (STRATEGIC_CATEGORIES as readonly string[]).includes(normalized)
    ? (normalized as StrategicCategory)
    : null;
};

/**
 * Risk-flag severity level. Runtime tuple is the single source of truth; the type is
 * derived from it so the two can never drift — same pattern as STRATEGIC_CATEGORIES.
 * A distinct axis from the existing `confidence` field (AI field-extraction confidence).
 */
export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];
