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
import { opportunities } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { OpportunityRow } from './persist.js';

export interface CostGate {
  /**
   * Pass-1 checkpoint: has this digest already been extracted?
   *
   * KNOWN LIMITATION: proxies on the presence of the first indexed opportunity
   * (`gmail://<messageId>#0`) as a stand-in for "digest processed". A prior run that
   * crashed before persisting #0 will be re-extracted (re-paying the AI cost). A real
   * per-digest completion marker replaces this in issue #12 without re-cutting the seam.
   */
  digestAlreadyExtracted(messageId: string): Promise<boolean>;

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
    const proxy = await db.query.opportunities.findFirst({
      where: eq(opportunities.canonicalUrl, `gmail://${messageId}#0`),
    });
    return proxy !== undefined;
  },

  deepAlreadyDone(existing) {
    return existing?.analysisDepth === 'DEEP';
  },
};
