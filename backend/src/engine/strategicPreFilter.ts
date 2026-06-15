/**
 * Strategic Pre-filter seam — pure (issue #11 plan commit 7; real logic landed by #6, ADR-0004).
 *
 * The relevance gate that decides whether an extracted opportunity proceeds into the
 * expensive Pass 2 (deep scrape + full Strategic Analysis). Pure: text + config in,
 * pass/fail out — no I/O.
 *
 * ADR-0004: the gate is a deliberately HIGH-RECALL strategic filter, NOT the legacy
 * `fitScore > 60`. It passes an opportunity whose title/snippet hits any Tier-1 strategic
 * keyword or a target role-family title, UNLESS a hard-exclude Guardrail (excluded industry)
 * trips. The Fit Score plays no part — gating the strategic funnel on the SEO score actively
 * filtered *for* SEO roles, the opposite of the goal. High recall is intentional: false
 * positives are cheap (the LLM rejects them downstream); a missed strategic role is not.
 */

/** The per-opportunity text the gate inspects (extracted title + snippet/description + industry). */
export interface PreFilterInput {
  title: string;
  description: string;
  /** The extracted industry label, if any — checked by the hard-exclude veto in its own right,
   *  since the AI often classifies the industry without the excluded word appearing in the text. */
  industry?: string;
}

/**
 * The configurable inputs to the gate, sourced from the same `strategic_guardrails` settings
 * the score Guardrails read (single source of truth) — so tuning the strategic vocabulary in
 * settings moves both the gate and the Guardrails together.
 */
export interface StrategicPreFilterConfig {
  /** Tier-1 strategic keywords whose presence passes the gate (guardrail `tier1Keywords`). */
  tier1Keywords: string[];
  /** Industries/terms that hard-veto regardless of any keyword hit (guardrail `excludedIndustries`). */
  excludedIndustries: string[];
}

export interface StrategicPreFilter {
  (input: PreFilterInput, config: StrategicPreFilterConfig): boolean;
}

/**
 * Target role-family titles (CONTEXT.md: "the brief's grouping of target titles"). Domain
 * vocabulary, hardcoded alongside the LLM prompt / category definitions rather than in
 * settings — these are *what we're hunting for*, not a per-user tuning knob. They widen the
 * gate beyond the Tier-1 boost keywords so a clearly-strategic title with no SEO terms (e.g.
 * "Delivery Operations Lead") reaches deep analysis. There is no separate Tier-2 list yet;
 * these titles plus the configurable Tier-1 keywords form the high-recall surface.
 */
export const ROLE_FAMILY_TITLES = [
  'delivery operations lead',
  'delivery operations manager',
  'delivery lead',
  'delivery manager',
  'delivery director',
  'head of delivery',
  'resource planning lead',
  'resource manager',
  'resource management',
  'resourcing lead',
  'capacity planning',
  'capacity planner',
  'workforce planning',
  'programme manager',
  'program manager',
  'pmo lead',
  'portfolio manager',
  'practice lead',
  'engagement manager',
  'consultancy',
] as const;

/** A needle matches a text when it is non-blank and appears (case-insensitively) as a substring.
 *  A blank/whitespace-only needle never matches — else it would pass/veto every opportunity. */
const matches = (text: string, needle: string): boolean => {
  const n = needle.trim().toLowerCase();
  return n.length > 0 && text.includes(n);
};

/**
 * Apply the Strategic Pre-filter. Pure: returns whether the opportunity is worth a Pass-2
 * deep analysis. A hard-exclude industry term (in the title or snippet) vetoes outright; else
 * it passes on any Tier-1 keyword or role-family title hit. High recall by design.
 */
export const strategicPreFilter: StrategicPreFilter = (input, config) => {
  const haystack = `${input.title} ${input.description}`.toLowerCase();
  const industry = (input.industry ?? '').toLowerCase();

  // Hard-exclude veto first: an excluded-industry term blocks Pass 2 regardless of strategic
  // keywords — the same conservative veto the score Guardrails apply, brought forward to the gate
  // so we never pay for a deep analysis of an off-strategy role. Check the structured industry
  // label AND the title/snippet: the AI classifies the industry ("Online Gambling") even when the
  // word never appears in the text, so a text-only scan would let a strategically-titled role at
  // an excluded employer through to an expensive scrape the Guardrail will only REJECT later.
  if (config.excludedIndustries.some((ind) => matches(industry, ind) || matches(haystack, ind))) {
    return false;
  }

  // High-recall pass: any Tier-1 strategic keyword OR target role-family title.
  return [...config.tier1Keywords, ...ROLE_FAMILY_TITLES].some((n) => matches(haystack, n));
};
