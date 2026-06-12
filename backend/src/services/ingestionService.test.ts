/**
 * Headline pipeline test (issue #11, plan commit 12).
 *
 * The deliverable that could not be written before the carve: drive the full
 * `runIngestion` orchestrator end-to-end with a fake intake source, fake
 * extraction/scrape/analysis adapters, and an in-memory persist double — no real
 * Gmail, Gemini, or Postgres — then assert on the returned `IngestionRunSummary`
 * and the persisted rows. The three pure seams (Score+reconcile, Pre-filter,
 * Routing) run for real via `defaultDeps`, so scores/routing are exercised genuinely;
 * only the I/O seams are faked. This establishes the fake-adapter + in-memory-double
 * pattern that strategic-targeting slices #2–#9 reuse.
 */

import { describe, it, expect } from 'vitest';
import { runIngestion, defaultDeps, type IngestionDeps } from './ingestionService.js';
import type { PersistAdapter, OpportunityRow, OpportunityInsert } from './ingestion/persist.js';
import type { ExtractedOpportunity, RawSource } from './ingestion/types.js';
import type { ScrapedContent } from './scraperService.js';
import type { AIAnalysisResult } from './aiService.js';
import { EMPTY_STRATEGIC_ANALYSIS } from '../engine/strategicAnalysis.js';

/** Minimal in-memory Persist double: a Map keyed on canonicalUrl with auto-increment ids. */
const makePersistDouble = () => {
    const rows = new Map<string, OpportunityRow>();
    let nextId = 1;
    const adapter: PersistAdapter = {
        async findByCanonicalUrl(canonicalUrl) {
            return rows.get(canonicalUrl);
        },
        async upsertByCanonicalUrl(values: OpportunityInsert, conflictSet) {
            const key = values.canonicalUrl ?? '';
            const existing = rows.get(key);
            if (existing) {
                Object.assign(existing, conflictSet);
                return existing;
            }
            const row = { ...values, id: nextId++ } as OpportunityRow;
            rows.set(key, row);
            return row;
        },
        async updateById(id, set) {
            for (const row of rows.values()) {
                if (row.id === id) Object.assign(row, set);
            }
        },
    };
    return { adapter, rows };
};

const SCRAPED_DESCRIPTION = 'X'.repeat(600); // >500 so Pass 2 re-analysis fires

// Two digests: msgA is fresh; msgB is already-extracted (Pass-1 Cost Gate skips it).
// Bodies are kept neutral (no scoring keywords/locations) because today's scorer is
// fed the digest `body` as its `description` — so scores here depend only on each
// opportunity's title + location, keeping the routing branches deterministic.
const SOURCES: RawSource[] = [
    { messageId: 'msgA', subject: 'Job Alerts', from: 'jobs@example.com', body: 'Weekly listings below.', internalDate: '1700000000000' },
    { messageId: 'msgB', subject: 'Job Alerts', from: 'jobs@example.com', body: 'Weekly listings below.', internalDate: '1700000000000' },
];

// Four extracted opportunities from msgA, crafted to land on each routing branch through
// the real scorer (keywords ['engineer','typescript','ai']; locationWeights { mars: -30 }):
//   high (85) → ALERT + Pass 2 ; NOISE → skipped ; mid (60) → DIGEST ; low (20) → STORE.
const EXTRACTED: ExtractedOpportunity[] = [
    {
        type: 'JOB', title: 'Senior Engineer TypeScript AI', company: 'Acme',
        description: 'Remote position', location: 'Remote', sourceUrl: 'https://example.com/job1',
        reasons: ['extracted reason'], concerns: [], strategicCategory: 'STRATEGIC_FIT',
        // Populated Pass-1 block scoring sub-threshold strategically (64) despite the high
        // Fit Score (85): proves routing follows the Strategic Score, not the Fit Score.
        // Pass 2 overwrites these with the deeper block below.
        strategicAnalysis: {
            consultancyAlignment: 70, deliveryVisibility: 60, commercialProximity: 55,
            buyerEnvironmentFit: 50, seniorityScope: 65,
            resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'LOW',
            realRoleInterpretation: 'Shallow first pass.', consultancyRelevance: 'Some.',
            strategicReasons: ['shallow'], strategicConcerns: [], recommendedScreeningQuestions: [],
        },
    },
    { type: 'NOISE', title: 'Newsletter', description: 'unrelated', reasons: [], concerns: [], strategicCategory: null, strategicAnalysis: EMPTY_STRATEGIC_ANALYSIS },
    {
        type: 'JOB', title: 'Engineer Position', company: 'Beta',
        description: 'A good opportunity', sourceUrl: null, reasons: [], concerns: [], strategicCategory: 'USEFUL_BRIDGE',
        // Populated Pass-1 block: mid never runs Pass 2 (no sourceUrl), so this is what persists.
        strategicAnalysis: {
            consultancyAlignment: 55, deliveryVisibility: 45, commercialProximity: 40,
            buyerEnvironmentFit: 35, seniorityScope: 50,
            resourceAdminTrapRisk: 'MEDIUM', seoComfortZoneRisk: 'LOW',
            realRoleInterpretation: 'A mid bridge role.', consultancyRelevance: 'Some relevance.',
            strategicReasons: ['shallow reason'], strategicConcerns: ['shallow concern'],
            recommendedScreeningQuestions: ['shallow question'],
        },
    },
    {
        type: 'JOB', title: 'Junior Clerk', company: 'Gamma',
        description: 'office filing work', location: 'Mars', sourceUrl: null, reasons: [], concerns: [], strategicCategory: null,
        strategicAnalysis: EMPTY_STRATEGIC_ANALYSIS,
    },
];

const FINAL_ANALYSIS: AIAnalysisResult = {
    type: 'JOB', title: 'Senior Engineer TypeScript AI', company: 'Acme',
    industry: '', location: 'Remote', remoteStatus: 'REMOTE', description: SCRAPED_DESCRIPTION,
    reasons: ['deep reason'], concerns: [], strategicCategory: 'STRATEGIC_FIT',
    // Populated deep block: Pass 2 overwrites the high row's Pass-1 strategic fields.
    strategicAnalysis: {
        consultancyAlignment: 90, deliveryVisibility: 80, commercialProximity: 60,
        buyerEnvironmentFit: 55, seniorityScope: 75,
        resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'MEDIUM',
        realRoleInterpretation: 'Deep: a delivery-ops leadership role.', consultancyRelevance: 'Strong.',
        strategicReasons: ['deep strategic reason'], strategicConcerns: ['deep strategic concern'],
        recommendedScreeningQuestions: ['deep screening question'],
    },
};

/** Build deps: real pure seams from defaultDeps, fake I/O. Returns the persist double too. */
const makeDeps = (alerted: OpportunityRow[]) => {
    const { adapter: persist, rows } = makePersistDouble();
    const deps: IngestionDeps = {
        ...defaultDeps,
        persist,
        intake: { fetchSources: async () => SOURCES },
        extraction: { extract: async (s) => (s.messageId === 'msgA' ? EXTRACTED : []) },
        deepScrape: { scrape: async (url): Promise<ScrapedContent> => ({ title: 't', description: SCRAPED_DESCRIPTION, url }) },
        strategicAnalysis: { analyze: async () => [FINAL_ANALYSIS] },
        costGate: {
            digestAlreadyExtracted: async (id) => id === 'msgB',
            deepAlreadyDone: () => false,
        },
        sendAlert: async (row) => { alerted.push(row); },
        loadPreferences: async () => ({
            keywords: ['engineer', 'typescript', 'ai'],
            locations: ['remote'],
            locationWeights: { mars: -30 },
        }),
    };
    return { deps, rows };
};

describe('runIngestion (fake-backed pipeline)', () => {
    it('intakes, extracts, routes, and persists end-to-end, returning a summary', async () => {
        const alerted: OpportunityRow[] = [];
        const { deps, rows } = makeDeps(alerted);

        const summary = await runIngestion({}, deps);

        // Summary tallies.
        expect(summary.sourcesSeen).toBe(2);
        expect(summary.costSkipped).toBe(1);        // msgB skipped by the Pass-1 Cost Gate
        expect(summary.extracted).toBe(4);          // all of msgA's items, NOISE included
        expect(summary.preFilterPassed).toBe(1);    // only the high-fit (85) job clears > 60
        expect(summary.deepAnalyzed).toBe(1);       // and it has a sourceUrl, so Pass 2 runs
        expect(summary.created).toBe(3);            // high + mid + low; NOISE is not persisted
        expect(summary.updated).toBe(0);
        // Routing now follows the Strategic Score (#4): all three rows score < 80
        // strategically, so all STORE — even the 85-Fit row. No DIGEST/SUPPRESS until #7b.
        expect(summary.byRecommendedAction).toEqual({ ALERT: 0, DIGEST: 0, STORE: 3, SUPPRESS: 0 });
        expect(summary.errors).toEqual([]);

        // Persisted rows: NOISE never lands; the three jobs do, at their routed action.
        expect(rows.size).toBe(3);
        const high = rows.get('gmail://msgA#0');
        const mid = rows.get('gmail://msgA#2');
        const low = rows.get('gmail://msgA#3');

        // High Fit (85) but sub-threshold Strategic (66) → STORE, NOT ALERT: the #4 fix
        // means the Fit Score no longer floats a role to the top of the dashboard.
        expect(high?.recommendedAction).toBe('STORE');
        expect(high?.fitScore).toBe(85);
        expect(high?.description).toBe(SCRAPED_DESCRIPTION); // Pass 2 replaced the body
        expect(high?.strategicCategory).toBe('STRATEGIC_FIT'); // persisted from analysis (#2)

        expect(mid?.recommendedAction).toBe('STORE');        // strategic 33 < 80 → STORE
        expect(mid?.fitScore).toBe(60);
        expect(mid?.strategicCategory).toBe('USEFUL_BRIDGE');

        expect(low?.recommendedAction).toBe('STORE');
        expect(low?.fitScore).toBe(20);
        expect(low?.strategicCategory).toBeNull();           // uncategorised → null persisted

        // Strategic Analysis (#3) persists. The high row ran Pass 2, so its deep block
        // overwrote the Pass-1 fields; practicalFit is the Fit Score, not an LLM judgment.
        expect(high?.consultancyAlignment).toBe(90);
        expect(high?.seoComfortZoneRisk).toBe('MEDIUM');
        expect(high?.strategicReasons).toEqual(['deep strategic reason']);
        expect(high?.practicalFit).toBe(85);
        // The mid row never runs Pass 2, so it keeps its populated Pass-1 block.
        expect(mid?.consultancyAlignment).toBe(55);
        expect(mid?.resourceAdminTrapRisk).toBe('MEDIUM');
        expect(mid?.practicalFit).toBe(60);
        // The low row was never strategically analysed → block stays null; practicalFit is still the Fit Score.
        expect(low?.consultancyAlignment).toBeNull();
        expect(low?.practicalFit).toBe(20);

        // Strategic Score (#4) is computed from the persisted block and is the ranking
        // authority — distinct from the Fit Score above. High ran Pass 2 (deep block):
        // weighted 76.25 − 10 (SEO MEDIUM) = 66. Mid (Pass-1 block): 47.75 − 15 (trap
        // MEDIUM) = 33. Low has only practicalFit judged → renormalizes to that 20.
        expect(high?.strategicScore).toBe(66);
        expect(mid?.strategicScore).toBe(33);
        expect(low?.strategicScore).toBe(20);

        // Ingestion no longer writes status — it is purely the user's lifecycle field now.
        expect(high?.status).toBeUndefined();

        // No immediate alert fires: no row clears the Strategic Score threshold, so the
        // high Fit Score alone no longer triggers one (the #4 / P1 fix).
        expect(alerted).toHaveLength(0);
    });

    it('alerts on a strong Strategic Score even when the Fit Score is low (#4)', async () => {
        // The mirror of the regression above: a role whose Strategic Score clears the
        // threshold ALERTs even though its Fit Score (neutral body → 50) does not —
        // proving ALERT is driven by the Strategic Score, not the Fit Score.
        const standout: ExtractedOpportunity = {
            type: 'JOB', title: 'Consultancy Delivery Lead', company: 'Delta',
            description: 'A senior role', sourceUrl: null, reasons: [], concerns: [], strategicCategory: null,
            strategicAnalysis: {
                consultancyAlignment: 95, deliveryVisibility: 95, commercialProximity: 95,
                buyerEnvironmentFit: 95, seniorityScope: 95,
                resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'LOW',
                realRoleInterpretation: 'A standout strategic fit.', consultancyRelevance: 'Direct.',
                strategicReasons: ['owns delivery'], strategicConcerns: [], recommendedScreeningQuestions: [],
            },
        };
        const alerted: OpportunityRow[] = [];
        const { adapter: persist, rows } = makePersistDouble();
        const deps: IngestionDeps = {
            ...defaultDeps,
            persist,
            intake: { fetchSources: async () => [SOURCES[0]!] },
            extraction: { extract: async () => [standout] },
            costGate: { digestAlreadyExtracted: async () => false, deepAlreadyDone: () => false },
            sendAlert: async (row) => { alerted.push(row); },
            loadPreferences: async () => ({ keywords: ['engineer'], locations: [], locationWeights: {} }),
        };

        await runIngestion({}, deps);

        const row = rows.get('gmail://msgA#0');
        expect(row?.fitScore).toBe(50);                              // neutral → midpoint, below threshold
        expect(row?.strategicScore).toBeGreaterThanOrEqual(80);      // strong components → clears it
        expect(row?.recommendedAction).toBe('ALERT');
        expect(alerted).toHaveLength(1);
    });

    it('isolates a poison source: records the failure and continues the run', async () => {
        const { adapter: persist, rows } = makePersistDouble();
        const sources: RawSource[] = [
            { messageId: 'poison', subject: 's', from: 'f', body: 'Weekly listings below.', internalDate: '1700000000000' },
            { messageId: 'good', subject: 's', from: 'f', body: 'Weekly listings below.', internalDate: '1700000000000' },
        ];
        const deps: IngestionDeps = {
            ...defaultDeps,
            persist,
            intake: { fetchSources: async () => sources },
            extraction: {
                extract: async (s) => {
                    if (s.messageId === 'poison') throw new Error('boom: extraction failed');
                    return [{
                        type: 'JOB', title: 'Engineer Position', company: 'Beta',
                        description: 'A good opportunity', sourceUrl: null, reasons: [], concerns: [], strategicCategory: null,
                        strategicAnalysis: EMPTY_STRATEGIC_ANALYSIS,
                    }];
                },
            },
            costGate: { digestAlreadyExtracted: async () => false, deepAlreadyDone: () => false },
            sendAlert: async () => {},
            loadPreferences: async () => ({ keywords: ['engineer'], locations: [] }),
        };

        const summary = await runIngestion({}, deps);

        // The poison source is recorded, scoped to its messageId at the source stage...
        expect(summary.errors).toHaveLength(1);
        expect(summary.errors[0]?.stage).toBe('source');
        expect(summary.errors[0]?.messageId).toBe('poison');
        expect(summary.errors[0]?.message).toContain('boom');

        // ...and the run still processes the healthy source that follows it.
        expect(summary.sourcesSeen).toBe(2);
        expect(summary.created).toBe(1);
        expect(rows.get('gmail://good#0')?.title).toBe('Engineer Position');
    });
});
