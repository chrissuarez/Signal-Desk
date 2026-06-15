/**
 * Opportunity list filter parser — pure (issue #8).
 *
 * The dashboard's strategic filter tabs (Strategic Fit / Useful Bridge / Needs Review /
 * Traps-Rejects) drive `GET /opportunities` via `?category=`/`?action=` query params.
 * This module turns the untrusted raw query strings into a validated, normalized filter
 * shape — no Express, no Drizzle, no I/O — so the route stays thin and the parsing is
 * unit-testable in isolation (matching the engine's pure-function discipline).
 *
 * Both params are comma-separated lists of enum values; unknown tokens are dropped (a
 * stray value must never widen or error the query). `category` and `action` combine with
 * OR at the route: a row matches if its category is requested OR its action is requested.
 * That OR is what lets "Needs Review" gather GENERIC_OPS_UNCLEAR *and* DIGEST rows in one
 * tab. When any filter is present the route also bypasses the default SUPPRESS-hide, so
 * the Traps-Rejects tab can reveal the hidden RESOURCE_ADMIN_TRAP / REJECT rows for audit.
 */

import { STRATEGIC_CATEGORIES, type StrategicCategory } from '../engine/strategicVocabulary.js';
import type { RecommendedAction } from '../services/ingestion/types.js';

/** Runtime tuple mirror of the RecommendedAction union (the type alias has no runtime). */
export const RECOMMENDED_ACTIONS = ['ALERT', 'DIGEST', 'STORE', 'SUPPRESS'] as const;

export interface OpportunityFilter {
  /** Requested strategic categories (validated, de-duplicated). */
  categories: StrategicCategory[];
  /** Requested recommended actions (validated, de-duplicated). */
  actions: RecommendedAction[];
  /**
   * Whether the caller asked for any filter at all. When false the route applies its
   * default view (hide SUPPRESS); when true the explicit selection takes over, including
   * any otherwise-hidden suppressed rows.
   */
  hasFilter: boolean;
}

/** Validate one comma-separated list against an allowed tuple, dropping unknowns + dupes. */
const parseList = <T extends string>(raw: unknown, allowed: readonly T[]): T[] => {
  if (typeof raw !== 'string') return [];
  const allow = allowed as readonly string[];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const token of raw.split(',')) {
    const normalized = token.trim().toUpperCase();
    if (allow.includes(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized as T);
    }
  }
  return out;
};

/**
 * Parse the raw `category` / `action` query values into a validated filter. Tolerant of
 * missing, mis-cased, or junk input — anything unrecognised is simply dropped.
 */
export const parseOpportunityFilter = (
  rawCategory: unknown,
  rawAction: unknown,
): OpportunityFilter => {
  const categories = parseList(rawCategory, STRATEGIC_CATEGORIES);
  const actions = parseList(rawAction, RECOMMENDED_ACTIONS);
  return { categories, actions, hasFilter: categories.length > 0 || actions.length > 0 };
};
