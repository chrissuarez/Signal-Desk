/**
 * Recommended Action routing seam — pure (issue #11, plan commit 9).
 *
 * Decides routing from the scored signals. Pure: signals in, RoutingDecision out.
 *
 * The first adapter is LEGACY: it reproduces today's status/alert ternaries verbatim —
 * status = DISMISSED below 40 else NEW, and an immediate alert at 80+. Marked for
 * replacement by architecture candidate #2 / ADR-0005, which switches persistence to
 * write `recommendedAction` (gaining SUPPRESS) instead of `status` behind this seam.
 */

import type { RoutingDecision } from '../services/ingestion/types.js';

export interface RoutingSignals {
  fitScore: number;
}

export interface RecommendedActionRouting {
  (signals: RoutingSignals): RoutingDecision;
}

/** Legacy routing: today's status/alert ternaries, verbatim. */
export const legacyRoute: RecommendedActionRouting = (signals) => ({
  status: signals.fitScore < 40 ? 'DISMISSED' : 'NEW',
  shouldAlert: signals.fitScore >= 80,
});
