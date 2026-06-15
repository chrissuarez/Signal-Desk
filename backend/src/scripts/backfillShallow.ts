/**
 * SHALLOW strategic backfill (issue #9).
 *
 * A one-off, idempotent script that gives every legacy Opportunity a Strategic Category and
 * Score so the dashboard is uniform. It re-uses the LIVE Pass-1 engine (`runStrategicPass`):
 * the AI strategic analyzer is run over each row's stored `description` — no deep re-scrape, as
 * the original source URLs are mostly dead — then the same Fit/Strategic-Score/#5-Guardrails/
 * routing path that live ingestion uses produces the persisted decision. Every backfilled row is
 * marked `analysisDepth = SHALLOW` (ADR-0004) so its snippet-level origin stays visible.
 *
 * Idempotency: only rows with `analysisDepth IS NULL` are selected (the pre-#6 legacy marker, per
 * schema.ts). A re-run therefore skips already-backfilled rows and never downgrades a DEEP/SHALLOW
 * row. A row whose re-analysis returns NOISE, yields no usable Strategic Score (an empty/garbled
 * strategic block), or has no stored text is left untouched at NULL so a later run can retry it.
 *
 * Run: `npm run backfill:shallow` (from backend/).
 */

import { isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { opportunities } from '../db/schema.js';
import {
    runStrategicPass,
    dbLoadPreferences,
    dbLoadGuardrails,
} from '../services/ingestionService.js';
import { aiStrategicAnalysis } from '../services/ingestion/strategicAnalysis.js';
import { legacyScoreReconcile, type ScoreReconcile } from '../engine/scoreReconcile.js';
import { dbPersist, type PersistAdapter, type OpportunityRow } from '../services/ingestion/persist.js';
import type { StrategicAnalysisAdapter } from '../services/ingestion/strategicAnalysis.js';
import type { GuardrailSettings } from '../engine/strategicGuardrails.js';
import type { IngestionPreferences, RecommendedAction } from '../services/ingestion/types.js';

/** The seams the backfill wires together — all injectable so the run is drivable by fakes. */
export interface BackfillDeps {
    /** Load the rows that still need a SHALLOW backfill (legacy `analysisDepth IS NULL`). */
    loadRows: () => Promise<OpportunityRow[]>;
    /** Re-analyze a row's stored description into strategic block(s). */
    analyze: StrategicAnalysisAdapter['analyze'];
    scoreReconcile: ScoreReconcile;
    /** Persist the backfilled strategic fields onto an existing row. */
    persist: Pick<PersistAdapter, 'updateById'>;
    loadPreferences: () => Promise<IngestionPreferences>;
    loadGuardrails: () => Promise<GuardrailSettings>;
    /** Clock seam so the persisted `updatedAt` is testable. */
    now: () => Date;
}

/** A failure collected during a backfill run; the run continues past it. */
export interface BackfillError {
    opportunityId: number;
    message: string;
}

/** The typed result of a backfill run — its return value and primary test surface. */
export interface BackfillSummary {
    /** Rows the loader returned for consideration. */
    considered: number;
    /** Rows given a SHALLOW strategic analysis and persisted. */
    backfilled: number;
    /** Rows skipped because they had no stored description text to analyze. */
    skippedEmpty: number;
    /** Rows skipped because re-analysis returned NOISE / no result (left NULL for retry). */
    skippedNoise: number;
    /** Rows skipped because the strategic block was empty/garbled (null score; left NULL for retry). */
    skippedUnusable: number;
    /** Tally of backfilled rows by their routed Recommended Action. */
    byRecommendedAction: Record<RecommendedAction, number>;
    /** Failures collected during the run. */
    errors: BackfillError[];
}

const emptySummary = (): BackfillSummary => ({
    considered: 0,
    backfilled: 0,
    skippedEmpty: 0,
    skippedNoise: 0,
    skippedUnusable: 0,
    byRecommendedAction: { ALERT: 0, DIGEST: 0, STORE: 0, SUPPRESS: 0 },
    errors: [],
});

/** The production wiring: real adapters + DB behind every seam. */
export const defaultBackfillDeps: BackfillDeps = {
    loadRows: () =>
        db.query.opportunities.findMany({ where: isNull(opportunities.analysisDepth) }),
    analyze: aiStrategicAnalysis.analyze,
    scoreReconcile: legacyScoreReconcile,
    persist: dbPersist,
    loadPreferences: dbLoadPreferences,
    loadGuardrails: dbLoadGuardrails,
    now: () => new Date(),
};

/**
 * Backfill every legacy Opportunity with a SHALLOW strategic analysis. Per-row error isolation:
 * a poison row is recorded on `summary.errors` and the run continues.
 */
export const runBackfill = async (
    deps: BackfillDeps = defaultBackfillDeps,
): Promise<BackfillSummary> => {
    console.log('Starting SHALLOW strategic backfill...');
    const summary = emptySummary();

    const [rows, preferences, guardrails] = await Promise.all([
        deps.loadRows(),
        deps.loadPreferences(),
        deps.loadGuardrails(),
    ]);
    summary.considered = rows.length;
    console.log(`Found ${rows.length} un-analyzed opportunit${rows.length === 1 ? 'y' : 'ies'}.`);

    for (const row of rows) {
        try {
            const text = row.description?.trim();
            if (!text) {
                summary.skippedEmpty++;
                continue;
            }

            // Re-analyze the STORED text (no deep re-scrape). The analyzer may emit several
            // opportunities; the row is already one opportunity, so we take the first.
            const results = await deps.analyze(text);
            const analysis = results?.[0];
            // The production analyzer SWALLOWS Gemini/parse failures into a NOISE row with an
            // EMPTY strategic block. Persisting that would mark the row analyzed (depth set) and
            // strand it forever, so a NOISE/absent result leaves the row at NULL for a later retry.
            if (!analysis || analysis.type === 'NOISE') {
                summary.skippedNoise++;
                continue;
            }

            // Reuse the live Pass-1 core. Identity stays the STORED row (title/industry/location)
            // — we are adding a strategic block, not re-extracting the posting; only the LLM's
            // strategic block + proposed category come from the re-analysis.
            const pass = runStrategicPass({
                analysis: {
                    title: row.title,
                    description: text,
                    industry: row.industry ?? undefined,
                    location: row.location ?? undefined,
                    strategicCategory: analysis.strategicCategory,
                    strategicAnalysis: analysis.strategicAnalysis,
                },
                scoringText: text,
                preferences,
                guardrails,
                scoreReconcile: deps.scoreReconcile,
            });

            // A non-NOISE result can still carry an empty/garbled strategic block (the AI boundary
            // coerces malformed component scores to null rather than to NOISE). computeStrategicScore
            // then returns null — no usable Strategic Score, the very thing this backfill exists to add.
            // Marking such a row SHALLOW would strand it: the loader only retries `analysisDepth IS NULL`.
            // So leave it NULL for a later retry, exactly as a NOISE result is left. (A non-null score with
            // a null category is NOT unusable — it's a legitimately-analysed row, identical to a live SHALLOW
            // row, and re-running the same stored text wouldn't conjure a category, so it is kept.)
            if (pass.strategicScore === null) {
                summary.skippedUnusable++;
                continue;
            }

            await deps.persist.updateById(row.id, {
                fitScore: pass.fitScore,
                ...pass.strategicFields,
                strategicScore: pass.strategicScore,
                strategicCategory: pass.strategicCategory,
                recommendedAction: pass.recommendedAction,
                // #6/ADR-0004: snippet-level origin → SHALLOW. This is also the idempotency marker
                // that excludes the row from the next run's loader.
                analysisDepth: 'SHALLOW',
                updatedAt: deps.now(),
            });

            summary.backfilled++;
            summary.byRecommendedAction[pass.recommendedAction]++;
            console.log(
                `Backfilled #${row.id} "${row.title}" → score ${pass.strategicScore ?? 'null'}, ` +
                `category ${pass.strategicCategory ?? 'null'}, action ${pass.recommendedAction}.`,
            );
        } catch (error: any) {
            const message = error?.message || String(error);
            summary.errors.push({ opportunityId: row.id, message });
            console.error(`Backfill error [#${row.id}]:`, message);
        }
    }

    console.log(
        `Backfill complete. Considered ${summary.considered}, backfilled ${summary.backfilled}, ` +
        `skipped ${summary.skippedEmpty} empty / ${summary.skippedNoise} noise / ` +
        `${summary.skippedUnusable} unusable, errors ${summary.errors.length}.`,
    );
    return summary;
};

// CLI entry: run against the real DB when executed directly (not when imported by a test).
const invokedDirectly =
    typeof process !== 'undefined' &&
    Array.isArray(process.argv) &&
    !!process.argv[1] &&
    import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
    runBackfill()
        .then((summary) => {
            process.exit(summary.errors.length > 0 ? 1 : 0);
        })
        .catch((error) => {
            console.error('Backfill run failed:', error);
            process.exit(1);
        });
}
