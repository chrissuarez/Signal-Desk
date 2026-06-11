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
   * Shaped for the target "skip if Analysis Depth = DEEP". The `analysisDepth` column
   * does not exist yet, so today this proxies on whether the row already existed before
   * this run. The Analysis Depth slice swaps the body without re-cutting the seam.
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
    return existing !== undefined;
  },
};
