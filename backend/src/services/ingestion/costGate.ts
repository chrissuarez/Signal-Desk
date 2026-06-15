/**
 * Cost Gate (issue #11, plan commit 10).
 *
 * One predicate — "has the expensive work already been done for this identity?" —
 * applied at two checkpoints to avoid paying for AI/scrape work twice:
 *   - per-digest, before Extraction (Pass 1)
 *   - per-opportunity, before the deep step (Pass 2)
 *
 * See the Cost Gate term in CONTEXT.md.
 */

import { db } from '../../db/index.js';
import { digestExtractions } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { OpportunityRow } from './persist.js';

export interface CostGate {
  /**
   * Pass-1 checkpoint: has this digest already been fully extracted?
   *
   * Reads a per-digest completion marker (the `digest_extractions` row, #12). That row is
   * written by `markDigestExtracted` only after every opportunity in the digest persisted
   * cleanly — so a digest that crashed partway is reported NOT done and re-extracted on the
   * next run, recovering the opportunities the crash never persisted. This replaced the
   * earlier proxy (presence of opportunity `#0`), which flipped to "done" the instant the
   * first opportunity landed and so skipped a partially-written digest forever.
   */
  digestAlreadyExtracted(messageId: string): Promise<boolean>;

  /**
   * Record that a digest has been fully extracted — the companion writer to
   * `digestAlreadyExtracted`. The orchestrator calls this once, at the end of a digest, only
   * when no opportunity in it errored, so the completion marker is a true "all persisted"
   * signal rather than a "started" one. Idempotent: re-marking an already-marked digest
   * (e.g. on a `force` re-run) is a no-op.
   */
  markDigestExtracted(messageId: string): Promise<void>;

  /**
   * Pass-2 checkpoint: has the deep step already run for this opportunity?
   *
   * The target shape (#6): a row is "deep-done" iff its Analysis Depth is DEEP — it has already
   * been re-analysed on the full scraped description. This replaced the earlier proxy ("row
   * existed before this run"), which downgraded a forced reprocess of a deep row: Pass 1 would
   * overwrite it with a snippet-level read while the deep pass was (correctly) skipped. Keying on
   * the real depth lets a SHALLOW row (whose scrape once failed) retry the deep pass on reprocess,
   * while a DEEP row is left untouched (see the orchestrator's pre-Pass-1 guard).
   */
  deepAlreadyDone(existing: OpportunityRow | undefined): boolean;
}

/** Drizzle-backed Cost Gate (today's behaviour). */
export const dbCostGate: CostGate = {
  async digestAlreadyExtracted(messageId) {
    const marker = await db.query.digestExtractions.findFirst({
      where: eq(digestExtractions.messageId, messageId),
    });
    return marker !== undefined;
  },

  async markDigestExtracted(messageId) {
    // onConflictDoNothing keeps this idempotent: a `force` re-run (which bypasses the read
    // check) re-marks a digest it already completed without erroring on the primary key.
    await db
      .insert(digestExtractions)
      .values({ messageId })
      .onConflictDoNothing({ target: digestExtractions.messageId });
  },

  deepAlreadyDone(existing) {
    return existing?.analysisDepth === 'DEEP';
  },
};
