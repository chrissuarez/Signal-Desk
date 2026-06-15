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
import { eq, sql } from 'drizzle-orm';
import type { OpportunityRow } from './persist.js';
import { NO_API_KEY_CONCERN } from './extraction.js';

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

/**
 * One-time transition seed (#12). Marks every digest that already has a persisted opportunity
 * as extracted, so switching the Pass-1 check from the old `#0`-presence proxy to the
 * `digest_extractions` marker doesn't make the first run after deploy treat every
 * already-handled Gmail digest as new and re-pay the Gemini extraction cost for it.
 *
 * Why here and not in migration 0006: the project applies schema with `drizzle-kit push`,
 * which ignores hand-written data SQL in migration files — so the backfill has to run from
 * code. `initWorker` calls this at startup. Idempotent via ON CONFLICT DO NOTHING, and the
 * caller skips it once any marker exists, so it does real work at most once.
 *
 * A digest with any persisted opportunity completed extraction under the old code, so its
 * messageId — the `canonical_url` between `gmail://` and the trailing `#<index>` — is marked
 * done. Legacy partially-failed digests (the bug this release fixes) keep whatever rows they
 * have; their never-persisted opportunities aren't reconstructable. Returns the count seeded.
 *
 * Exception (#12, Codex P2): a digest whose rows came from the no-key heuristic fallback (any
 * row carrying NO_API_KEY_CONCERN) is NOT seeded. Marking it would make the first keyed run
 * skip it at the pre-extraction `digestAlreadyExtracted` check — before the per-opportunity
 * reprocess path that upgrades a heuristic row can run — leaving it stranded on heuristic data
 * forever. Left unseeded, that digest re-extracts and the keyed run replaces the placeholder.
 */
export const seedDigestMarkersFromLegacy = async (): Promise<number> => {
  const result = await db.execute(sql`
    INSERT INTO digest_extractions (message_id)
    SELECT msg FROM (
      SELECT substring(canonical_url from 'gmail://(.*)#[0-9]+$') AS msg,
             bool_or(concerns IS NOT NULL AND jsonb_exists(concerns, ${NO_API_KEY_CONCERN})) AS has_fallback
      FROM opportunities
      WHERE canonical_url LIKE 'gmail://%#%'
        AND substring(canonical_url from 'gmail://(.*)#[0-9]+$') IS NOT NULL
      GROUP BY 1
    ) digests
    WHERE msg IS NOT NULL AND NOT has_fallback
    ON CONFLICT (message_id) DO NOTHING
  `);
  return result.rowCount ?? 0;
};

/**
 * Run the #12 transition seed only when the markers table is still empty — so it transitions a
 * legacy database exactly once and is a cheap no-op on every boot thereafter. Safe on a fresh
 * install (no opportunities → seeds nothing). Never throws into the caller; logs and swallows.
 */
export const backfillDigestMarkersOnce = async (): Promise<void> => {
  try {
    const existing = await db.query.digestExtractions.findFirst();
    if (existing) return; // already seeded, or markers written by a prior run — nothing to do
    const seeded = await seedDigestMarkersFromLegacy();
    if (seeded > 0) {
      console.log(`Cost Gate: seeded ${seeded} digest completion marker(s) from existing opportunities (#12 transition).`);
    }
  } catch (error) {
    console.error('Cost Gate: digest-marker backfill failed (non-fatal):', error);
  }
};
