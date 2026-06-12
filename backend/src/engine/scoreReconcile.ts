/**
 * Score + Category reconcile seam — pure (issue #11, plan commit 8).
 *
 * The stage that turns a scoring input into the persisted score signals. Pure: input
 * in, ScoreResult out — no I/O.
 *
 * The first adapter is LEGACY: it delegates to the existing calculateFitScore and maps
 * its result onto the pipeline ScoreResult DTO. Marked for replacement by the Strategic
 * Score slice (ADR-0001/0003), which computes the six Component Scores, the derived
 * Strategic Score, and Category reconciliation behind this same seam.
 */

import { calculateFitScore, type ScoringInput } from './scoring.js';
import type { ScoreResult } from '../services/ingestion/types.js';

export interface ScoreReconcile {
  (input: ScoringInput): ScoreResult;
}

/** Legacy Score + Category reconcile: delegates to calculateFitScore. */
export const legacyScoreReconcile: ScoreReconcile = (input) => {
  const fit = calculateFitScore(input);
  return { fitScore: fit.score, reasons: fit.reasons, concerns: fit.concerns };
};
