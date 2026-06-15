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
import { strategicPreFilter, type StrategicPreFilter } from '../engine/strategicPreFilter.js';
import { decideRecommendedAction } from '../engine/recommendedActionRouting.js';
import { computeStrategicScore } from '../engine/strategicScoring.js';
import { applyScoreGuardrails, DEFAULT_GUARDRAILS, type GuardrailSettings } from '../engine/strategicGuardrails.js';
import { reconcileStrategicCategory } from '../engine/strategicReconcile.js';
import type { StrategicCategory } from '../engine/strategicVocabulary.js';
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
import { reconciledToSignals } from './ingestion/recommendedActionAdapter.js';
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
    /** Load the configurable Guardrail inputs (once per run, reused across digests). */
    loadGuardrails: () => Promise<GuardrailSettings>;
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

/**
 * Merge a (possibly partial) stored guardrails object with `DEFAULT_GUARDRAILS`. Pure. Each
 * list is filled independently — a partial update through the generic settings API (a row that
 * omits one of the three arrays, or stores a non-array) must not leave a list `undefined`, or
 * `applyScoreGuardrails` would later call `.find`/`includesAny` on it and the whole opportunity
 * would throw. Validating per-list (not truthy-casting the whole object) is what keeps the
 * veto/cap/floor live under partial settings.
 */
export const mergeGuardrailSettings = (stored: unknown): GuardrailSettings => {
    const s = (stored ?? {}) as Partial<GuardrailSettings>;
    return {
        excludedIndustries: toStringList(s.excludedIndustries, DEFAULT_GUARDRAILS.excludedIndustries),
        penaltyKeywords: toStringList(s.penaltyKeywords, DEFAULT_GUARDRAILS.penaltyKeywords),
        tier1Keywords: toStringList(s.tier1Keywords, DEFAULT_GUARDRAILS.tier1Keywords),
    };
};

/**
 * Coerce a stored guardrail list to `string[]`. The generic settings endpoint stores arbitrary
 * JSON, so a row like `{ penaltyKeywords: [123] }` would pass `Array.isArray` yet later blow up
 * when `includesAny`/the industry check call `.toLowerCase()` on a number. Non-array → fallback;
 * otherwise keep only non-blank strings, trimmed — a whitespace-only entry like `" "` is a
 * substring of every `title + ' ' + description`, so it would veto/cap *every* row if accepted.
 * A non-empty array with *no* valid entries is malformed → fall back to defaults, while an
 * intentionally-empty list (`[]` = "no entries") is honoured.
 */
const toStringList = (value: unknown, fallback: string[]): string[] => {
    if (!Array.isArray(value)) return fallback;
    const strings = value
        .filter((v): v is string => typeof v === 'string')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    return strings.length === 0 && value.length > 0 ? fallback : strings;
};

/** Production Guardrail-inputs loader: the `strategic_guardrails` settings row, merged with defaults. */
const dbLoadGuardrails = async (): Promise<GuardrailSettings> => {
    const record = await db.query.settings.findFirst({
        where: eq(settings.key, 'strategic_guardrails'),
    });
    return mergeGuardrailSettings(record?.value);
};

/** The production wiring: real adapters behind every seam. */
export const defaultDeps: IngestionDeps = {
    intake: gmailIntake,
    extraction: defaultExtraction,
    preFilter: strategicPreFilter,
    deepScrape: httpDeepScrape,
    strategicAnalysis: aiStrategicAnalysis,
    scoreReconcile: legacyScoreReconcile,
    persist: dbPersist,
    costGate: dbCostGate,
    sendAlert: sendImmediateAlert,
    loadPreferences: dbLoadPreferences,
    loadGuardrails: dbLoadGuardrails,
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

/**
 * Apply the deterministic Guardrails + Category reconciliation (#5, ADR-0002) to a computed
 * Strategic Score. Guardrails run first (they can cap the score or force REJECT on an excluded
 * industry); the LLM category is then reconciled against the *capped* score + risk flags. A
 * Guardrail-forced category wins outright. Returns the final score/category + any Guardrail
 * concerns to merge into the row. Shared by Pass 1 and the Pass-2 re-score so they stay in step.
 */
const reconcileScoreAndCategory = (args: {
    strategicScore: number | null;
    llmCategory: StrategicCategory | null;
    strategicFields: {
        deliveryVisibility: number | null;
        commercialProximity: number | null;
        resourceAdminTrapRisk: import('../engine/strategicVocabulary.js').RiskLevel | null;
        seoComfortZoneRisk: import('../engine/strategicVocabulary.js').RiskLevel | null;
    };
    industry: string | undefined;
    title: string;
    description: string;
    guardrails: GuardrailSettings;
}): { strategicScore: number | null; strategicCategory: StrategicCategory | null; guardrailConcerns: string[] } => {
    const guard = applyScoreGuardrails(
        // `?? ''` so an absent industry isn't passed as an explicit `undefined` (rejected under
        // exactOptionalPropertyTypes); the Guardrail treats '' as "no industry" (no veto) anyway.
        { score: args.strategicScore, industry: args.industry ?? '', title: args.title, description: args.description },
        args.guardrails,
    );
    const strategicCategory =
        guard.forcedCategory ??
        reconcileStrategicCategory({
            llmCategory: args.llmCategory,
            strategicScore: guard.score,
            resourceAdminTrapRisk: args.strategicFields.resourceAdminTrapRisk,
            seoComfortZoneRisk: args.strategicFields.seoComfortZoneRisk,
            deliveryVisibility: args.strategicFields.deliveryVisibility,
            commercialProximity: args.strategicFields.commercialProximity,
        });
    return { strategicScore: guard.score, strategicCategory, guardrailConcerns: guard.concerns };
};

/** Run the per-opportunity pipeline for one extracted opportunity, mutating `summary`. */
const processOpportunity = async (
    deps: IngestionDeps,
    summary: IngestionRunSummary,
    source: { messageId: string; from: string; body: string; internalDate?: string },
    analysis: Awaited<ReturnType<ExtractionAdapter['extract']>>[number],
    index: number,
    preferences: IngestionPreferences,
    guardrails: GuardrailSettings,
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
    // Strategic Analysis fields (#3): the LLM-judged block persisted raw, plus the
    // Practical Fit Component Score sourced from the Fit Score (not the LLM). The
    // headline Strategic Score (#4, ADR-0001) is computed from that block here and
    // persisted alongside it — the ranking authority that replaces the Fit Score.
    const strategicFields = {
        ...analysis.strategicAnalysis,
        practicalFit: scored.fitScore,
    };
    const computedScore = computeStrategicScore(strategicFields);

    // #5 (ADR-0002): deterministic Guardrails (excluded-industry veto, penalty cap, tier-1
    // floor) bound the computed score, then the LLM-proposed category is reconciled against
    // the *capped* score + risk flags by fixed precedence. The reconciled category + capped
    // score are what we persist and route on.
    const reconciled = reconcileScoreAndCategory({
        strategicScore: computedScore,
        llmCategory: analysis.strategicCategory,
        strategicFields,
        industry: analysis.industry,
        title: analysis.title,
        description: analysis.description,
        guardrails,
    });
    const strategicScore = reconciled.strategicScore;
    const strategicCategory = reconciled.strategicCategory;

    // ADR-0005 (#13): ingestion writes the system's `recommendedAction` and no longer
    // writes `status` — `status` is now purely the user's lifecycle field. ADR-0001 (#4):
    // routing follows the (Guardrail-capped) Strategic Score (null → 0, i.e. un-scored never
    // alerts). #5: it also follows the *reconciled* category + risk flags — a confirmed
    // RESOURCE_ADMIN_TRAP/REJECT SUPPRESSes and an SEO comfort zone STOREs, rather than
    // slipping through the score-only arm, so a bad row can never ALERT on a high raw score.
    let recommendedAction = decideRecommendedAction(reconciledToSignals({
        strategicScore,
        category: strategicCategory,
        seoComfortZoneRisk: strategicFields.seoComfortZoneRisk,
        resourceAdminTrapRisk: strategicFields.resourceAdminTrapRisk,
    }));

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
        concerns: [...analysis.concerns, ...scored.concerns, ...reconciled.guardrailConcerns],
        strategicCategory,
        ...strategicFields,
        strategicScore,
        // #6 (ADR-0004): SHALLOW until a Pass-2 deep re-analysis upgrades it to DEEP below.
        // Every persisted row records a depth so the dashboard can flag snippet-only judgments.
        analysisDepth: 'SHALLOW',
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
        concerns: [...analysis.concerns, ...scored.concerns, ...reconciled.guardrailConcerns],
        strategicCategory,
        ...strategicFields,
        strategicScore,
        analysisDepth: 'SHALLOW',
        recommendedAction,
        updatedAt: new Date(),
    });

    if (existing) summary.updated++; else summary.created++;

    // The immediate alert fires once, on the FINAL recommendedAction (see below). Pass 2
    // can still promote (STORE→ALERT) or demote (ALERT→STORE) this row, so notifying here
    // on the Pass-1 decision would miss promotions and fire premature alerts on demotions.
    let alertRow: OpportunityRow | undefined = insertedRow;

    // PASS 2 (ADR-0004): the Strategic Pre-filter — not the Fit Score — decides whether this
    // role earns a deep scrape + full re-analysis. High recall: any Tier-1 keyword or target
    // role-family title in the title/snippet passes, unless a hard-exclude industry vetoes. The
    // gate reads the same configurable strategic_guardrails lists the score Guardrails use.
    if (deps.preFilter(
        { title: analysis.title, description: analysis.description, industry: analysis.industry },
        { tier1Keywords: guardrails.tier1Keywords, excludedIndustries: guardrails.excludedIndustries },
    )) {
        summary.preFilterPassed++;
        if (analysis.sourceUrl && !deps.costGate.deepAlreadyDone(existing)) {
            // Deep scrape + re-analysis is optional enrichment. A transient scrape/analysis
            // failure must not lose the Pass-1 decision or its alert — the row is already
            // persisted on the Pass-1 recommendedAction — so it is isolated here: on error we
            // record it and fall through to the single alert point below, which still fires on
            // the Pass-1 decision (alertRow stays the Pass-1 row). This restores the pre-
            // collapse behaviour where a Pass-1 ALERT survived a Pass-2 failure.
            try {
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
                        const finalStrategicFields = {
                            ...finalAnalysis.strategicAnalysis,
                            practicalFit: finalScored.fitScore,
                        };
                        const finalComputedScore = computeStrategicScore(finalStrategicFields);
                        // #5: re-run Guardrails + reconciliation on the deeper analysis. Veto on
                        // BOTH the deep AND the Pass-1 text/industry, not deep-or-Pass-1 — a deep
                        // broad label ("Other") or a re-written generic title/description must not
                        // shadow a Pass-1 veto term. The deep update never overwrites the persisted
                        // industry/title (they stay the Pass-1 values), so a hard veto (whether the
                        // term was in the industry, title, or description) must not disappear here.
                        const finalReconciled = reconcileScoreAndCategory({
                            strategicScore: finalComputedScore,
                            llmCategory: finalAnalysis.strategicCategory,
                            strategicFields: finalStrategicFields,
                            industry: [finalAnalysis.industry, analysis.industry].filter(Boolean).join(' '),
                            title: [finalAnalysis.title, analysis.title].filter(Boolean).join(' '),
                            description: [scraped.description, analysis.description].filter(Boolean).join(' '),
                            guardrails,
                        });
                        const finalStrategicScore = finalReconciled.strategicScore;
                        // Same #5 reconciled-signal routing on the deeper analysis (see Pass 1 above).
                        recommendedAction = decideRecommendedAction(reconciledToSignals({
                            strategicScore: finalStrategicScore,
                            category: finalReconciled.strategicCategory,
                            seoComfortZoneRisk: finalStrategicFields.seoComfortZoneRisk,
                            resourceAdminTrapRisk: finalStrategicFields.resourceAdminTrapRisk,
                        }));

                        const deepUpdate = {
                            description: scraped.description,
                            requirements: finalAnalysis.reasons.join(', '), // Using reasons as a proxy for raw requirements extract
                            fitScore: finalScored.fitScore,
                            reasons: [...finalAnalysis.reasons, ...finalScored.reasons],
                            concerns: [...finalAnalysis.concerns, ...finalScored.concerns, ...finalReconciled.guardrailConcerns],
                            strategicCategory: finalReconciled.strategicCategory,
                            ...finalStrategicFields,
                            strategicScore: finalStrategicScore,
                            // #6: this role was re-judged on the full scraped description → DEEP.
                            analysisDepth: 'DEEP' as const,
                            recommendedAction,
                            updatedAt: new Date(),
                        };
                        await deps.persist.updateById(insertedRow.id, deepUpdate);
                        // Alert on the Pass-2 state, not the stale Pass-1 row.
                        alertRow = { ...insertedRow, ...deepUpdate } as OpportunityRow;
                        summary.deepAnalyzed++;
                        console.log(`Pass 2 Complete: ${finalAnalysis.title} re-scored to ${finalScored.fitScore}`);
                    }
                }
            } catch (error) {
                // Keep the Pass-1 decision + alert; surface the deep-pass failure on the summary.
                recordError(summary, { stage: 'deepScrape', messageId, canonicalUrl }, error);
            }
        }
    }

    // Single alert point: notify on the FINAL decision exactly once — so a Pass-2
    // promotion (STORE→ALERT) is sent and a Pass-2 demotion (ALERT→STORE) is not.
    if (recommendedAction === 'ALERT' && alertRow) {
        await deps.sendAlert(alertRow);
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
    let guardrails: GuardrailSettings;
    try {
        sources = await deps.intake.fetchSources('Job Alerts', limit);
        summary.sourcesSeen = sources.length;
        preferences = await deps.loadPreferences();
        guardrails = await deps.loadGuardrails();
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
                    await processOpportunity(deps, summary, source, analysis, i, preferences, guardrails, force);
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
