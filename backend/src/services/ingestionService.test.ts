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
        reasons: ['extracted reason'], concerns: [],
    },
    { type: 'NOISE', title: 'Newsletter', description: 'unrelated', reasons: [], concerns: [] },
    {
        type: 'JOB', title: 'Engineer Position', company: 'Beta',
        description: 'A good opportunity', sourceUrl: null, reasons: [], concerns: [],
    },
    {
        type: 'JOB', title: 'Junior Clerk', company: 'Gamma',
        description: 'office filing work', location: 'Mars', sourceUrl: null, reasons: [], concerns: [],
    },
];

const FINAL_ANALYSIS: AIAnalysisResult = {
    type: 'JOB', title: 'Senior Engineer TypeScript AI', company: 'Acme',
    industry: '', location: 'Remote', remoteStatus: 'REMOTE', description: SCRAPED_DESCRIPTION,
    reasons: ['deep reason'], concerns: [],
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
        expect(summary.byRecommendedAction).toEqual({ ALERT: 1, DIGEST: 1, STORE: 1 });
        expect(summary.errors).toEqual([]);

        // Persisted rows: NOISE never lands; the three jobs do, at their routed status.
        expect(rows.size).toBe(3);
        const high = rows.get('gmail://msgA#0');
        const mid = rows.get('gmail://msgA#2');
        const low = rows.get('gmail://msgA#3');

        expect(high?.status).toBe('NEW');
        expect(high?.fitScore).toBe(85);
        expect(high?.description).toBe(SCRAPED_DESCRIPTION); // Pass 2 replaced the body

        expect(mid?.status).toBe('NEW');
        expect(mid?.fitScore).toBe(60);

        expect(low?.status).toBe('DISMISSED');
        expect(low?.fitScore).toBe(20);

        // Exactly one immediate alert, for the 85-fit job.
        expect(alerted).toHaveLength(1);
        expect(alerted[0]?.canonicalUrl).toBe('gmail://msgA#0');
    });
});
