/**
 * Persist seam (issue #11, plan commit 3).
 *
 * Wraps the two opportunity writes the orchestrator does today — the
 * `insert ... onConflictDoUpdate` upsert keyed on canonicalUrl, and the deep-pass
 * (Pass 2) `update` by id — behind a small interface. The Drizzle-backed adapter
 * preserves today's behaviour verbatim; commit 12's pipeline test supplies an
 * in-memory double implementing the same interface.
 */

import { db } from '../../db/index.js';
import { opportunities } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export type OpportunityInsert = typeof opportunities.$inferInsert;
export type OpportunityRow = typeof opportunities.$inferSelect;

export interface PersistAdapter {
  /** Upsert an opportunity keyed on canonicalUrl, returning the resulting row. */
  upsertByCanonicalUrl(
    values: OpportunityInsert,
    conflictSet: Partial<OpportunityInsert>,
  ): Promise<OpportunityRow | undefined>;
  /** Apply the deep-pass re-analysis update to an existing row by id. */
  updateById(id: number, set: Partial<OpportunityInsert>): Promise<void>;
}

/** Drizzle/Postgres-backed Persist adapter (today's behaviour). */
export const dbPersist: PersistAdapter = {
  async upsertByCanonicalUrl(values, conflictSet) {
    const inserted = await db
      .insert(opportunities)
      .values(values)
      .onConflictDoUpdate({
        target: opportunities.canonicalUrl,
        set: conflictSet,
      })
      .returning();
    return inserted[0];
  },

  async updateById(id, set) {
    await db.update(opportunities).set(set).where(eq(opportunities.id, id));
  },
};
