/**
 * SHALLOW backfill test (issue #9).
 *
 * Drives `runBackfill` with fake loadRows/analyze/persist seams while running the REAL Pass-1
 * engine (`runStrategicPass`, real `legacyScoreReconcile`, real `DEFAULT_GUARDRAILS`). The
 * persisted decision is asserted against a direct `runStrategicPass` call over the same inputs,
 * so the test proves the backfill delegates to the live engine rather than re-implementing it —
 * and stays green if the engine is later re-tuned.
 */

import { describe, it, expect } from 'vitest';
import { runBackfill, type BackfillDeps } from './backfillShallow.js';
import { runStrategicPass } from '../services/ingestionService.js';
import { legacyScoreReconcile } from '../engine/scoreReconcile.js';
import { DEFAULT_GUARDRAILS } from '../engine/strategicGuardrails.js';
import { EMPTY_STRATEGIC_ANALYSIS } from '../engine/strategicAnalysis.js';
import type { OpportunityRow, OpportunityInsert } from '../services/ingestion/persist.js';
import type { AIAnalysisResult } from '../services/aiService.js';
import type { IngestionPreferences } from '../services/ingestion/types.js';

const PREFERENCES: IngestionPreferences = {
    keywords: ['engineer', 'typescript', 'ai'],
    locations: ['Remote'],
};

/** A strong strategic block that should produce a non-null score + category. */
const STRONG_ANALYSIS: AIAnalysisResult = {
    type: 'JOB', title: 'Re-analyzed Title', company: 'Acme',
    industry: '', location: 'Remote', remoteStatus: 'REMOTE', description: 'full text',
    reasons: ['deep reason'], concerns: [], strategicCategory: 'STRATEGIC_FIT',
    strategicAnalysis: {
        consultancyAlignment: 90, deliveryVisibility: 80, commercialProximity: 60,
        buyerEnvironmentFit: 55, seniorityScope: 75,
        resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'LOW',
        realRoleInterpretation: 'A delivery-ops leadership role.', consultancyRelevance: 'Strong.',
        strategicReasons: ['strategic reason'], strategicConcerns: ['strategic concern'],
        recommendedScreeningQuestions: ['screening question'],
    },
};

const NOISE_ANALYSIS: AIAnalysisResult = {
    type: 'NOISE', title: 'Newsletter', company: '', industry: '', location: '',
    remoteStatus: '', description: 'unrelated', reasons: [], concerns: [],
    strategicCategory: null, strategicAnalysis: EMPTY_STRATEGIC_ANALYSIS,
};

/** Build a legacy (un-analyzed) Opportunity row — only the fields the backfill reads matter. */
const makeRow = (over: Partial<OpportunityRow> & { id: number }): OpportunityRow => ({
    title: 'Senior Engineer TypeScript AI',
    description: 'Remote delivery lead role re-analyzed from stored text.',
    industry: null,
    location: 'Remote',
    analysisDepth: null,
    ...over,
} as OpportunityRow);

/** Build deps: real engine seams, fake I/O. Returns the captured updateById writes. */
const makeDeps = (
    rows: OpportunityRow[],
    analyze: BackfillDeps['analyze'],
): { deps: BackfillDeps; writes: Array<{ id: number; set: Partial<OpportunityInsert> }> } => {
    const writes: Array<{ id: number; set: Partial<OpportunityInsert> }> = [];
    const deps: BackfillDeps = {
        loadRows: async () => rows,
        analyze,
        scoreReconcile: legacyScoreReconcile,
        persist: { updateById: async (id, set) => { writes.push({ id, set }); } },
        loadPreferences: async () => PREFERENCES,
        loadGuardrails: async () => DEFAULT_GUARDRAILS,
        now: () => new Date('2026-06-15T00:00:00.000Z'),
    };
    return { deps, writes };
};

describe('runBackfill', () => {
    it('backfills a legacy row with the live engine result, marked SHALLOW', async () => {
        const row = makeRow({ id: 7 });
        const { deps, writes } = makeDeps([row], async () => [STRONG_ANALYSIS]);

        const summary = await runBackfill(deps);

        // The persisted decision must equal a direct live-engine pass over the same inputs —
        // identity from the STORED row, strategic block from the re-analysis.
        const expected = runStrategicPass({
            analysis: {
                title: row.title,
                description: row.description!,
                industry: row.industry ?? undefined,
                location: row.location ?? undefined,
                strategicCategory: STRONG_ANALYSIS.strategicCategory,
                strategicAnalysis: STRONG_ANALYSIS.strategicAnalysis,
            },
            scoringText: row.description!,
            preferences: PREFERENCES,
            guardrails: DEFAULT_GUARDRAILS,
            scoreReconcile: legacyScoreReconcile,
        });

        expect(writes).toHaveLength(1);
        expect(writes[0]!.id).toBe(7);
        expect(writes[0]!.set).toMatchObject({
            ...expected.strategicFields,
            strategicScore: expected.strategicScore,
            strategicCategory: expected.strategicCategory,
            recommendedAction: expected.recommendedAction,
            fitScore: expected.fitScore,
            analysisDepth: 'SHALLOW',
        });
        expect(expected.strategicScore).not.toBeNull();
        expect(expected.strategicCategory).not.toBeNull();

        expect(summary.considered).toBe(1);
        expect(summary.backfilled).toBe(1);
        expect(summary.byRecommendedAction[expected.recommendedAction]).toBe(1);
    });

    it('skips a row whose re-analysis returns NOISE, leaving it NULL for retry', async () => {
        const row = makeRow({ id: 8 });
        const { deps, writes } = makeDeps([row], async () => [NOISE_ANALYSIS]);

        const summary = await runBackfill(deps);

        expect(writes).toHaveLength(0);
        expect(summary.skippedNoise).toBe(1);
        expect(summary.backfilled).toBe(0);
    });

    it('skips a row with no stored description', async () => {
        const row = makeRow({ id: 9, description: '   ' });
        let analyzeCalls = 0;
        const { deps, writes } = makeDeps([row], async () => { analyzeCalls++; return [STRONG_ANALYSIS]; });

        const summary = await runBackfill(deps);

        expect(analyzeCalls).toBe(0); // empty text never reaches the (paid) analyzer
        expect(writes).toHaveLength(0);
        expect(summary.skippedEmpty).toBe(1);
    });

    it('isolates a per-row failure and continues the run', async () => {
        const rows = [makeRow({ id: 1 }), makeRow({ id: 2 })];
        let call = 0;
        const { deps, writes } = makeDeps(rows, async () => {
            call++;
            if (call === 1) throw new Error('Gemini exploded');
            return [STRONG_ANALYSIS];
        });

        const summary = await runBackfill(deps);

        expect(summary.errors).toHaveLength(1);
        expect(summary.errors[0]!.opportunityId).toBe(1);
        expect(summary.backfilled).toBe(1); // row 2 still processed
        expect(writes.map((w) => w.id)).toEqual([2]);
    });

    it('is idempotent: a run with no un-analyzed rows does nothing', async () => {
        const { deps, writes } = makeDeps([], async () => [STRONG_ANALYSIS]);

        const summary = await runBackfill(deps);

        expect(writes).toHaveLength(0);
        expect(summary).toMatchObject({ considered: 0, backfilled: 0 });
    });
});
