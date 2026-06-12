/**
 * Ingestion orchestrator (issue #11, plan commit 11).
 *
 * Thinned to pure wiring: it intakes sources, then maps the per-opportunity pipeline
 * — Cost Gate · Extraction · dedup · Score+reconcile · Routing · Persist · Pass 2 —
 * over each extracted opportunity, accumulating a typed `IngestionRunSummary` (was
 * `void`). Every seam is injected via `IngestionDeps`, defaulting to the production
 * adapters; commit 12's pipeline test supplies fakes + an in-memory persist double.
 * Behaviour at the boundary (DB writes, alerts) is identical to before the carve.
 */

import { legacyScoreReconcile, type ScoreReconcile } from '../engine/scoreReconcile.js';
import { legacyPreFilter, type StrategicPreFilter } from '../engine/strategicPreFilter.js';
import { decideRecommendedAction } from '../engine/recommendedActionRouting.js';
import { sendImmediateAlert } from './notificationService.js';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { dbPersist, type PersistAdapter, type OpportunityRow } from './ingestion/persist.js';
import { gmailIntake, type IntakeAdapter } from './ingestion/intake.js';
import { defaultExtraction, type ExtractionAdapter } from './ingestion/extraction.js';
import { httpDeepScrape, type DeepScrapeAdapter } from './ingestion/deepScrape.js';
import { aiStrategicAnalysis, type StrategicAnalysisAdapter } from './ingestion/strategicAnalysis.js';
import { dbCostGate, type CostGate } from './ingestion/costGate.js';
import { fitScoreToSignals } from './ingestion/recommendedActionAdapter.js';
import type {
    IngestionError,
    IngestionPreferences,
    IngestionRunSummary,
} from './ingestion/types.js';

/**
 * The seams the orchestrator wires together. Bundling them as one injectable
 * dependency object is what makes the whole pipeline drivable by fakes (commit 12)
 * without touching real Gmail, Gemini, or Postgres.
 */
export interface IngestionDeps {
    intake: IntakeAdapter;
    extraction: ExtractionAdapter;
    preFilter: StrategicPreFilter;
    deepScrape: DeepScrapeAdapter;
    strategicAnalysis: StrategicAnalysisAdapter;
    scoreReconcile: ScoreReconcile;
    persist: PersistAdapter;
    costGate: CostGate;
    /** Send an immediate alert for a high-fit opportunity. */
    sendAlert: (row: OpportunityRow) => Promise<void>;
    /** Load the user's scoring preferences (once per run, reused across digests). */
    loadPreferences: () => Promise<IngestionPreferences>;
}

const DEFAULT_PREFERENCES: IngestionPreferences = {
    keywords: ['Software Engineer', 'AI', 'Fullstack', 'TypeScript'],
    locations: ['Remote', 'London'],
};

/** Production preferences loader: the `user_preferences` settings row, with a fallback. */
const dbLoadPreferences = async (): Promise<IngestionPreferences> => {
    const prefsRecord = await db.query.settings.findFirst({
        where: eq(settings.key, 'user_preferences'),
    });
    return (prefsRecord?.value as IngestionPreferences) || DEFAULT_PREFERENCES;
};

/** The production wiring: real adapters behind every seam. */
export const defaultDeps: IngestionDeps = {
    intake: gmailIntake,
    extraction: defaultExtraction,
    preFilter: legacyPreFilter,
    deepScrape: httpDeepScrape,
    strategicAnalysis: aiStrategicAnalysis,
    scoreReconcile: legacyScoreReconcile,
    persist: dbPersist,
    costGate: dbCostGate,
    sendAlert: sendImmediateAlert,
    loadPreferences: dbLoadPreferences,
};

const emptySummary = (): IngestionRunSummary => ({
    sourcesSeen: 0,
    costSkipped: 0,
    extracted: 0,
    preFilterPassed: 0,
    deepAnalyzed: 0,
    created: 0,
    updated: 0,
    byRecommendedAction: { ALERT: 0, DIGEST: 0, STORE: 0, SUPPRESS: 0 },
    errors: [],
});

/** Record a collected failure on the summary and log it, without aborting the run. */
const recordError = (
    summary: IngestionRunSummary,
    error: Omit<IngestionError, 'message'>,
    cause: any,
): void => {
    const message = cause?.message || String(cause);
    summary.errors.push({ ...error, message });
    console.error(`Ingestion error [${error.stage}${error.messageId ? ` ${error.messageId}` : ''}]:`, message);
    if (cause?.response?.data) {
        console.error('Error details:', JSON.stringify(cause.response.data));
    }
};

/** Log a concise report derived from the accumulated summary. */
const reportSummary = (summary: IngestionRunSummary): void => {
    const { ALERT, DIGEST, STORE } = summary.byRecommendedAction;
    console.log(
        `Ingestion run complete. Sources: ${summary.sourcesSeen} ` +
        `(cost-skipped ${summary.costSkipped}), extracted ${summary.extracted}, ` +
        `pre-filter passed ${summary.preFilterPassed}, deep-analyzed ${summary.deepAnalyzed}, ` +
        `persisted ${summary.created} created / ${summary.updated} updated ` +
        `[ALERT ${ALERT}, DIGEST ${DIGEST}, STORE ${STORE}], errors ${summary.errors.length}.`,
    );
};

/** Run the per-opportunity pipeline for one extracted opportunity, mutating `summary`. */
const processOpportunity = async (
    deps: IngestionDeps,
    summary: IngestionRunSummary,
    source: { messageId: string; from: string; body: string; internalDate?: string },
    analysis: Awaited<ReturnType<ExtractionAdapter['extract']>>[number],
    index: number,
    preferences: IngestionPreferences,
    force: boolean,
): Promise<void> => {
    const { messageId, from, body, internalDate } = source;
    const canonicalUrl = `gmail://${messageId}#${index}`;

    // Dedup: skip an opportunity already persisted in a prior run (unless forced).
    const existing = await deps.persist.findByCanonicalUrl(canonicalUrl);
    if (existing && !force) {
        console.log(`Opportunity ${canonicalUrl} already processed. Skipping.`);
        return;
    }

    const scored = deps.scoreReconcile({
        title: analysis.title,
        description: body,
        ...(analysis.industry !== undefined ? { industry: analysis.industry } : {}),
        ...(analysis.location !== undefined ? { location: analysis.location } : {}),
        preferences,
    });
    // ADR-0005 (#13): ingestion writes the system's `recommendedAction` and no longer
    // writes `status` — `status` is now purely the user's lifecycle field. The legacy
    // fitScore adapter feeds degenerate signals, so only the null-category fallback fires.
    let recommendedAction = decideRecommendedAction(fitScoreToSignals(scored.fitScore));

    const insertedRow = await deps.persist.upsertByCanonicalUrl({
        type: analysis.type,
        source: 'EMAIL',
        origin: from,
        receivedAt: new Date(parseInt(internalDate || Date.now().toString())),
        canonicalUrl,
        title: analysis.title,
        company: analysis.company,
        industry: analysis.industry,
        location: analysis.location,
        remoteStatus: analysis.remoteStatus,
        description: analysis.description,
        sourceUrl: analysis.sourceUrl || null,
        fitScore: scored.fitScore,
        reasons: [...analysis.reasons, ...scored.reasons],
        concerns: [...analysis.concerns, ...scored.concerns],
        strategicCategory: analysis.strategicCategory,
        recommendedAction,
    }, {
        title: analysis.title,
        company: analysis.company,
        industry: analysis.industry,
        location: analysis.location,
        remoteStatus: analysis.remoteStatus,
        description: analysis.description,
        sourceUrl: analysis.sourceUrl || null,
        fitScore: scored.fitScore,
        reasons: [...analysis.reasons, ...scored.reasons],
        concerns: [...analysis.concerns, ...scored.concerns],
        strategicCategory: analysis.strategicCategory,
        recommendedAction,
        updatedAt: new Date(),
    });

    if (existing) summary.updated++; else summary.created++;

    if (recommendedAction === 'ALERT' && insertedRow) {
        await deps.sendAlert(insertedRow);
    }

    // PASS 2: Deep Scrape for high-potential jobs.
    if (deps.preFilter({ fitScore: scored.fitScore })) {
        summary.preFilterPassed++;
        if (analysis.sourceUrl && !deps.costGate.deepAlreadyDone(existing)) {
            console.log(`Pass 2: Triggering Deep Scrape for ${analysis.title} at ${analysis.company}...`);
            const scraped = await deps.deepScrape.scrape(analysis.sourceUrl);
            if (scraped && scraped.description.length > 500) {
                console.log(`Pass 2: Re-analyzing with full description (Length: ${scraped.description.length})...`);
                const deepAnalysis = await deps.strategicAnalysis.analyze(scraped.description);
                const finalAnalysis = deepAnalysis?.[0];
                if (finalAnalysis && insertedRow?.id) {
                    const finalScored = deps.scoreReconcile({
                        title: finalAnalysis.title,
                        description: scraped.description,
                        industry: finalAnalysis.industry,
                        location: finalAnalysis.location,
                        preferences,
                    });
                    recommendedAction = decideRecommendedAction(fitScoreToSignals(finalScored.fitScore));

                    await deps.persist.updateById(insertedRow.id, {
                        description: scraped.description,
                        requirements: finalAnalysis.reasons.join(', '), // Using reasons as a proxy for raw requirements extract
                        fitScore: finalScored.fitScore,
                        reasons: [...finalAnalysis.reasons, ...finalScored.reasons],
                        concerns: [...finalAnalysis.concerns, ...finalScored.concerns],
                        strategicCategory: finalAnalysis.strategicCategory,
                        recommendedAction,
                        updatedAt: new Date(),
                    });
                    summary.deepAnalyzed++;
                    console.log(`Pass 2 Complete: ${finalAnalysis.title} re-scored to ${finalScored.fitScore}`);
                }
            }
        }
    }

    summary.byRecommendedAction[recommendedAction]++;
    console.log(`Ingested ${analysis.title} at ${analysis.company} (Score: ${scored.fitScore}, Action: ${recommendedAction}, Industry: ${analysis.industry}) from ${canonicalUrl}`);
};

export const runIngestion = async (
    options: { force?: boolean, limit?: number } = {},
    deps: IngestionDeps = defaultDeps,
): Promise<IngestionRunSummary> => {
    const { force = false, limit = 50 } = options;
    console.log(`Starting ingestion run (Force: ${force}, Limit: ${limit})...`);

    const summary = emptySummary();

    // Run-level setup (intake + preferences). A failure here leaves nothing to iterate,
    // so it is recorded as a run-level error and the (empty) summary is returned.
    let sources: Awaited<ReturnType<IntakeAdapter['fetchSources']>>;
    let preferences: IngestionPreferences;
    try {
        sources = await deps.intake.fetchSources('Job Alerts', limit);
        summary.sourcesSeen = sources.length;
        preferences = await deps.loadPreferences();
    } catch (error) {
        recordError(summary, { stage: 'intake' }, error);
        reportSummary(summary);
        return summary;
    }

    // Per-item error isolation: a poison source no longer aborts the whole run, and a
    // poison opportunity no longer aborts its digest. Each failure is collected into
    // summary.errors and processing continues.
    for (const source of sources) {
        try {
            // COST GATE (Pass 1): skip extraction if this digest was already processed.
            if (!force && await deps.costGate.digestAlreadyExtracted(source.messageId)) {
                console.log(`Message ${source.messageId} already analyzed. Skipping AI call.`);
                summary.costSkipped++;
                continue;
            }

            const analysisResults = await deps.extraction.extract(source);
            summary.extracted += analysisResults.length;

            for (const [i, analysis] of analysisResults.entries()) {
                if (analysis.type === 'NOISE') continue;
                try {
                    await processOpportunity(deps, summary, source, analysis, i, preferences, force);
                } catch (error) {
                    recordError(summary, {
                        stage: 'opportunity',
                        messageId: source.messageId,
                        canonicalUrl: `gmail://${source.messageId}#${i}`,
                    }, error);
                }
            }
        } catch (error) {
            recordError(summary, { stage: 'source', messageId: source.messageId }, error);
        }
    }

    reportSummary(summary);
    return summary;
};
