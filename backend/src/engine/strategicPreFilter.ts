/**
 * Strategic Pre-filter seam — pure (issue #11, plan commit 7).
 *
 * The relevance gate that decides whether an extracted opportunity proceeds into the
 * expensive Pass 2 deep step. Pure: signals in, pass/fail out — no I/O.
 *
 * The first adapter is LEGACY: it preserves today's *effective* gate into the deep
 * pass (fitScore > 60). It is deliberately not a pass-through — a pass-through would
 * send everything to Pass 2 and spike scraping/AI cost. Marked for replacement by the
 * Strategic Pre-filter slice (ADR-0004), which swaps this for keyword/role-family logic
 * behind the same seam.
 */

export interface PreFilterSignals {
  /** Today's relevance proxy: the computed Fit Score. */
  fitScore: number;
}

export interface StrategicPreFilter {
  (signals: PreFilterSignals): boolean;
}

/** Legacy Strategic Pre-filter: today's effective gate into Pass 2 (fitScore > 60). */
export const legacyPreFilter: StrategicPreFilter = (signals) => signals.fitScore > 60;
