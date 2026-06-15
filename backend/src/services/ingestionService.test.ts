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
import { runIngestion, defaultDeps, mergeGuardrailSettings, type IngestionDeps } from './ingestionService.js';
import type { PersistAdapter, OpportunityRow, OpportunityInsert } from './ingestion/persist.js';
import type { ExtractedOpportunity, RawSource } from './ingestion/types.js';
import type { ScrapedContent } from './scraperService.js';
import type { AIAnalysisResult } from './aiService.js';
import { EMPTY_STRATEGIC_ANALYSIS } from '../engine/strategicAnalysis.js';
import { DEFAULT_GUARDRAILS } from '../engine/strategicGuardrails.js';

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
        // 'delivery lead' in the snippet passes the strategic Pre-filter (#6) — the SEO-flavoured
        // title alone would not. The Fit-score keywords stay in the title, so fitScore is still 85
        // (the scorer reads the digest body, not this snippet — so the extra phrase can't shift it).
        description: 'Remote delivery lead position', location: 'Remote', sourceUrl: 'https://example.com/job1',
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
            markDigestExtracted: async () => {},
            deepAlreadyDone: () => false,
        },
        sendAlert: async (row) => { alerted.push(row); },
        loadGuardrails: async () => DEFAULT_GUARDRAILS,
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
        expect(summary.preFilterPassed).toBe(1);    // only the 'delivery lead' job clears the strategic gate (#6)
        expect(summary.deepAnalyzed).toBe(1);       // and it has a sourceUrl, so Pass 2 runs
        expect(summary.created).toBe(3);            // high + mid + low; NOISE is not persisted
        expect(summary.updated).toBe(0);
        // Routing follows the Strategic Score (#4) AND the reconciled category (#5): no row
        // clears the 80 alert threshold, but the high row is a mid-scoring USEFUL_BRIDGE (66)
        // so its category arm routes it to DIGEST; mid (33 < 40) and low (null category) STORE.
        expect(summary.byRecommendedAction).toEqual({ ALERT: 0, DIGEST: 1, STORE: 2, SUPPRESS: 0 });
        expect(summary.errors).toEqual([]);

        // Persisted rows: NOISE never lands; the three jobs do, at their routed action.
        expect(rows.size).toBe(3);
        const high = rows.get('gmail://msgA#0');
        const mid = rows.get('gmail://msgA#2');
        const low = rows.get('gmail://msgA#3');

        // High Fit (85) but sub-threshold Strategic (66) → never ALERT: the #4 fix means the
        // Fit Score no longer floats a role to the top of the dashboard. As a mid-scoring
        // USEFUL_BRIDGE it routes to DIGEST (#5 category arm), not STORE.
        expect(high?.recommendedAction).toBe('DIGEST');
        expect(high?.fitScore).toBe(85);
        expect(high?.description).toBe(SCRAPED_DESCRIPTION); // Pass 2 replaced the body
        // The LLM labelled it STRATEGIC_FIT, but reconciliation (#5) demotes it: the deep
        // Strategic Score is 66 (< 70), so it can't stand as a strategic fit → USEFUL_BRIDGE.
        expect(high?.strategicCategory).toBe('USEFUL_BRIDGE');

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
        // MEDIUM) = 33. Low was never strategically analysed (EMPTY block) — only its
        // Fit-sourced practicalFit is present, which never fabricates a headline → null.
        expect(high?.strategicScore).toBe(66);
        expect(mid?.strategicScore).toBe(33);
        expect(low?.strategicScore).toBeNull();

        // Analysis depth (#6): the high row was re-judged on the full scraped description → DEEP;
        // mid and low never ran Pass 2 (no sourceUrl), so their judgment is snippet-only → SHALLOW.
        expect(high?.analysisDepth).toBe('DEEP');
        expect(mid?.analysisDepth).toBe('SHALLOW');
        expect(low?.analysisDepth).toBe('SHALLOW');

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
            costGate: { digestAlreadyExtracted: async () => false, markDigestExtracted: async () => {}, deepAlreadyDone: () => false },
            sendAlert: async (row) => { alerted.push(row); },
            loadGuardrails: async () => DEFAULT_GUARDRAILS,
            loadPreferences: async () => ({ keywords: ['engineer'], locations: [], locationWeights: {} }),
        };

        await runIngestion({}, deps);

        const row = rows.get('gmail://msgA#0');
        expect(row?.fitScore).toBe(50);                              // neutral → midpoint, below threshold
        expect(row?.strategicScore).toBeGreaterThanOrEqual(80);      // strong components → clears it
        expect(row?.recommendedAction).toBe('ALERT');
        expect(alerted).toHaveLength(1);
    });

    it('sends the alert when Pass 2 promotes a row from STORE to ALERT (#4)', async () => {
        // Pass 1 scores sub-threshold (STORE, no alert), but the role clears the strategic
        // pre-filter so Pass 2 runs; the deeper block scores ≥80 and promotes the row to
        // ALERT. The immediate alert must fire on that final decision — not be skipped
        // because Pass 1 was STORE. (preFilter forced on: this test is about the promotion +
        // alert, not the gate's matching — that has its own unit tests.)
        const promoteExtracted: ExtractedOpportunity = {
            type: 'JOB', title: 'Engineer', company: 'Promo',
            description: 'A role', location: 'Remote', sourceUrl: 'https://example.com/promote',
            reasons: [], concerns: [], strategicCategory: null,
            strategicAnalysis: {
                consultancyAlignment: 60, deliveryVisibility: 55, commercialProximity: 50,
                buyerEnvironmentFit: 50, seniorityScope: 55,
                resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'LOW',
                realRoleInterpretation: 'shallow', consultancyRelevance: 'some',
                strategicReasons: [], strategicConcerns: [], recommendedScreeningQuestions: [],
            },
        };
        const promoteFinal: AIAnalysisResult = {
            type: 'JOB', title: 'Engineer', company: 'Promo',
            industry: '', location: 'Remote', remoteStatus: 'REMOTE', description: SCRAPED_DESCRIPTION,
            reasons: ['deep'], concerns: [], strategicCategory: null,
            strategicAnalysis: {
                consultancyAlignment: 95, deliveryVisibility: 95, commercialProximity: 95,
                buyerEnvironmentFit: 95, seniorityScope: 95,
                resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'LOW',
                realRoleInterpretation: 'deep', consultancyRelevance: 'strong',
                strategicReasons: [], strategicConcerns: [], recommendedScreeningQuestions: [],
            },
        };
        const alerted: OpportunityRow[] = [];
        const { adapter: persist, rows } = makePersistDouble();
        const deps: IngestionDeps = {
            ...defaultDeps,
            persist,
            intake: { fetchSources: async () => [SOURCES[0]!] },
            extraction: { extract: async () => [promoteExtracted] },
            preFilter: () => true, // force Pass 2; the gate's matching is unit-tested separately
            deepScrape: { scrape: async (url): Promise<ScrapedContent> => ({ title: 't', description: SCRAPED_DESCRIPTION, url }) },
            strategicAnalysis: { analyze: async () => [promoteFinal] },
            costGate: { digestAlreadyExtracted: async () => false, markDigestExtracted: async () => {}, deepAlreadyDone: () => false },
            sendAlert: async (row) => { alerted.push(row); },
            loadGuardrails: async () => DEFAULT_GUARDRAILS,
            loadPreferences: async () => ({ keywords: ['engineer'], locations: ['remote'], locationWeights: {} }),
        };

        const summary = await runIngestion({}, deps);

        const row = rows.get('gmail://msgA#0');
        expect(summary.deepAnalyzed).toBe(1);                   // Pass 2 ran
        expect(row?.recommendedAction).toBe('ALERT');           // promoted by the deep block
        expect(row?.strategicScore).toBeGreaterThanOrEqual(80);
        expect(row?.analysisDepth).toBe('DEEP');                // re-judged on the full scrape (#6)
        expect(alerted).toHaveLength(1);                        // …and the user was notified
        expect(alerted[0]?.strategicScore).toBe(row?.strategicScore); // alert carries the Pass-2 state
    });

    it('still alerts on the Pass-1 decision when the Pass-2 deep scrape fails (#4)', async () => {
        // A row that already routes to ALERT on Pass 1 (strong Pass-1 block) and clears the
        // pre-filter so Pass 2 runs — but the deep scrape throws. The optional enrichment
        // failure must NOT swallow the Pass-1 alert: the row is already persisted as ALERT,
        // so the notification must still fire and the failure be recorded. (preFilter forced
        // on: this test is about the Pass-1 alert surviving a deep failure, not the gate.)
        const alertExtracted: ExtractedOpportunity = {
            type: 'JOB', title: 'Engineer', company: 'Flaky',
            description: 'A role', location: 'Remote', sourceUrl: 'https://example.com/flaky',
            reasons: [], concerns: [], strategicCategory: null,
            strategicAnalysis: {
                consultancyAlignment: 95, deliveryVisibility: 95, commercialProximity: 95,
                buyerEnvironmentFit: 95, seniorityScope: 95,
                resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'LOW',
                realRoleInterpretation: 'strong', consultancyRelevance: 'direct',
                strategicReasons: [], strategicConcerns: [], recommendedScreeningQuestions: [],
            },
        };
        const alerted: OpportunityRow[] = [];
        const { adapter: persist, rows } = makePersistDouble();
        const deps: IngestionDeps = {
            ...defaultDeps,
            persist,
            intake: { fetchSources: async () => [SOURCES[0]!] },
            extraction: { extract: async () => [alertExtracted] },
            preFilter: () => true, // force Pass 2; the gate's matching is unit-tested separately
            deepScrape: { scrape: async () => { throw new Error('boom: scrape timed out'); } },
            costGate: { digestAlreadyExtracted: async () => false, markDigestExtracted: async () => {}, deepAlreadyDone: () => false },
            sendAlert: async (row) => { alerted.push(row); },
            loadGuardrails: async () => DEFAULT_GUARDRAILS,
            loadPreferences: async () => ({ keywords: ['engineer'], locations: ['remote'], locationWeights: {} }),
        };

        const summary = await runIngestion({}, deps);

        const row = rows.get('gmail://msgA#0');
        expect(row?.recommendedAction).toBe('ALERT');                // Pass-1 decision persisted
        expect(row?.strategicScore).toBeGreaterThanOrEqual(80);
        expect(summary.deepAnalyzed).toBe(0);                        // Pass 2 never completed
        // AC#5: the pre-filtered role whose scrape failed keeps its snippet-level (SHALLOW)
        // Strategic Analysis — the depth is never upgraded to DEEP when the deep pass aborts.
        expect(row?.analysisDepth).toBe('SHALLOW');
        // The deep-pass failure is recorded, scoped to the opportunity's canonical URL...
        expect(summary.errors).toHaveLength(1);
        expect(summary.errors[0]?.stage).toBe('deepScrape');
        expect(summary.errors[0]?.canonicalUrl).toBe('gmail://msgA#0');
        expect(summary.errors[0]?.message).toContain('boom');
        // ...and the Pass-1 ALERT still notifies and tallies — not swallowed by the failure.
        expect(alerted).toHaveLength(1);
        expect(alerted[0]?.strategicScore).toBe(row?.strategicScore); // carries the Pass-1 state
        expect(summary.byRecommendedAction.ALERT).toBe(1);
    });

    it('forces RESOURCE_ADMIN_TRAP when trap risk is HIGH, overriding the LLM category (#5)', async () => {
        // The LLM proposed STRATEGIC_FIT, but an unambiguous resource-admin signal (trap risk
        // HIGH) forces the category regardless — reconciliation precedence 1.
        const trapRow: ExtractedOpportunity = {
            type: 'JOB', title: 'Engineering Manager', company: 'TrapCo',
            description: 'A role', sourceUrl: null, reasons: [], concerns: [], strategicCategory: 'STRATEGIC_FIT',
            strategicAnalysis: {
                consultancyAlignment: 90, deliveryVisibility: 85, commercialProximity: 80,
                buyerEnvironmentFit: 80, seniorityScope: 85,
                resourceAdminTrapRisk: 'HIGH', seoComfortZoneRisk: 'LOW',
                realRoleInterpretation: 'Strong on paper but an admin trap.', consultancyRelevance: 'Low.',
                strategicReasons: [], strategicConcerns: [], recommendedScreeningQuestions: [],
            },
        };
        const { adapter: persist, rows } = makePersistDouble();
        const deps: IngestionDeps = {
            ...defaultDeps, persist,
            intake: { fetchSources: async () => [SOURCES[0]!] },
            extraction: { extract: async () => [trapRow] },
            costGate: { digestAlreadyExtracted: async () => false, markDigestExtracted: async () => {}, deepAlreadyDone: () => false },
            sendAlert: async () => {},
            loadGuardrails: async () => DEFAULT_GUARDRAILS,
            loadPreferences: async () => ({ keywords: [], locations: [] }),
        };

        await runIngestion({}, deps);

        const trapResult = rows.get('gmail://msgA#0');
        expect(trapResult?.strategicCategory).toBe('RESOURCE_ADMIN_TRAP');
        // #5 routing: a confirmed trap SUPPRESSes even on a high raw score — it must not ALERT
        // through the score-only arm just because the LLM proposed STRATEGIC_FIT.
        expect(trapResult?.recommendedAction).toBe('SUPPRESS');
    });

    it('vetoes an excluded industry: caps the Strategic Score to 0 and forces REJECT (#5)', async () => {
        // A strong-looking role in an excluded industry: the deterministic Guardrail veto
        // overrides the number and the LLM category — score capped to 0, category REJECT.
        const excludedRow: ExtractedOpportunity = {
            type: 'JOB', title: 'Engineer', company: 'BetCo', industry: 'Online Gambling',
            description: 'A role', sourceUrl: null, reasons: [], concerns: [], strategicCategory: 'STRATEGIC_FIT',
            strategicAnalysis: {
                consultancyAlignment: 80, deliveryVisibility: 80, commercialProximity: 80,
                buyerEnvironmentFit: 80, seniorityScope: 80,
                resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'LOW',
                realRoleInterpretation: 'Strong on paper.', consultancyRelevance: 'But excluded industry.',
                strategicReasons: [], strategicConcerns: [], recommendedScreeningQuestions: [],
            },
        };
        const { adapter: persist, rows } = makePersistDouble();
        const deps: IngestionDeps = {
            ...defaultDeps, persist,
            intake: { fetchSources: async () => [SOURCES[0]!] },
            extraction: { extract: async () => [excludedRow] },
            costGate: { digestAlreadyExtracted: async () => false, markDigestExtracted: async () => {}, deepAlreadyDone: () => false },
            sendAlert: async () => {},
            loadGuardrails: async () => DEFAULT_GUARDRAILS,
            loadPreferences: async () => ({ keywords: [], locations: [] }),
        };

        await runIngestion({}, deps);

        const row = rows.get('gmail://msgA#0');
        expect(row?.strategicScore).toBe(0);             // industry veto caps the score
        expect(row?.strategicCategory).toBe('REJECT');   // …and forces REJECT
        expect(row?.recommendedAction).toBe('SUPPRESS'); // #5: a REJECT is hidden, not just stored
        expect(row?.concerns?.some((c) => c.includes('Gambling'))).toBe(true);
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
            costGate: { digestAlreadyExtracted: async () => false, markDigestExtracted: async () => {}, deepAlreadyDone: () => false },
            sendAlert: async () => {},
            loadGuardrails: async () => DEFAULT_GUARDRAILS,
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

    it('keeps the excluded-industry veto through Pass 2 when the deep analysis omits industry (#5)', async () => {
        // Pass 1 vetoes on the excluded industry, but the Fit Score clears the pre-filter so
        // Pass 2 runs. The deep analyzer drops the industry (''), so without the Pass-1 fallback
        // the deep re-score would un-veto the row and persist/route a high score for an excluded
        // industry. The veto must survive enrichment: score 0, REJECT, SUPPRESS.
        const excludedExtracted: ExtractedOpportunity = {
            type: 'JOB', title: 'Engineer', company: 'BetCo', industry: 'Online Gambling',
            description: 'A role', sourceUrl: 'https://example.com/x', reasons: [], concerns: [], strategicCategory: 'STRATEGIC_FIT',
            strategicAnalysis: {
                consultancyAlignment: 80, deliveryVisibility: 80, commercialProximity: 80,
                buyerEnvironmentFit: 80, seniorityScope: 80,
                resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'LOW',
                realRoleInterpretation: 'Strong on paper.', consultancyRelevance: 'But excluded industry.',
                strategicReasons: [], strategicConcerns: [], recommendedScreeningQuestions: [],
            },
        };
        const strongDeepNoIndustry: AIAnalysisResult = {
            type: 'JOB', title: 'Engineer', company: 'BetCo',
            industry: '', location: 'Remote', remoteStatus: 'REMOTE', description: SCRAPED_DESCRIPTION,
            reasons: ['deep'], concerns: [], strategicCategory: 'STRATEGIC_FIT',
            strategicAnalysis: {
                consultancyAlignment: 95, deliveryVisibility: 95, commercialProximity: 95,
                buyerEnvironmentFit: 95, seniorityScope: 95,
                resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'LOW',
                realRoleInterpretation: 'deep', consultancyRelevance: 'strong',
                strategicReasons: [], strategicConcerns: [], recommendedScreeningQuestions: [],
            },
        };
        const { adapter: persist, rows } = makePersistDouble();
        const deps: IngestionDeps = {
            ...defaultDeps, persist,
            intake: { fetchSources: async () => [SOURCES[0]!] },
            extraction: { extract: async () => [excludedExtracted] },
            preFilter: () => true, // force Pass 2 regardless of Fit Score
            deepScrape: { scrape: async (url): Promise<ScrapedContent> => ({ title: 't', description: SCRAPED_DESCRIPTION, url }) },
            strategicAnalysis: { analyze: async () => [strongDeepNoIndustry] },
            costGate: { digestAlreadyExtracted: async () => false, markDigestExtracted: async () => {}, deepAlreadyDone: () => false },
            sendAlert: async () => {},
            loadGuardrails: async () => DEFAULT_GUARDRAILS,
            loadPreferences: async () => ({ keywords: [], locations: [] }),
        };

        const summary = await runIngestion({}, deps);

        const row = rows.get('gmail://msgA#0');
        expect(summary.deepAnalyzed).toBe(1);           // Pass 2 actually ran...
        expect(row?.strategicScore).toBe(0);             // ...but the veto held: score still 0
        expect(row?.strategicCategory).toBe('REJECT');   // ...and the category stays REJECT
        expect(row?.recommendedAction).toBe('SUPPRESS'); // #5: a REJECT is hidden through Pass 2 too
        expect(row?.concerns?.some((c) => c.includes('Gambling'))).toBe(true);
    });

    it('keeps the Pass-1 veto when the deep analysis returns a non-empty broad label (#5)', async () => {
        // The trap-case of the test above: the deep analyzer returns a *non-empty* broad label
        // ("Other"), not ''. A `deep || pass1` industry would let "Other" shadow the Pass-1
        // "Online Gambling" and un-veto the row — but the persisted industry is never replaced,
        // so the veto must still fire on the Pass-1 value: score 0, REJECT, SUPPRESS.
        const excludedExtracted: ExtractedOpportunity = {
            type: 'JOB', title: 'Engineer', company: 'BetCo', industry: 'Online Gambling',
            description: 'A role', sourceUrl: 'https://example.com/x', reasons: [], concerns: [], strategicCategory: 'STRATEGIC_FIT',
            strategicAnalysis: {
                consultancyAlignment: 80, deliveryVisibility: 80, commercialProximity: 80,
                buyerEnvironmentFit: 80, seniorityScope: 80,
                resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'LOW',
                realRoleInterpretation: 'Strong on paper.', consultancyRelevance: 'But excluded industry.',
                strategicReasons: [], strategicConcerns: [], recommendedScreeningQuestions: [],
            },
        };
        const strongDeepBroadLabel: AIAnalysisResult = {
            type: 'JOB', title: 'Engineer', company: 'BetCo',
            industry: 'Other', location: 'Remote', remoteStatus: 'REMOTE', description: SCRAPED_DESCRIPTION,
            reasons: ['deep'], concerns: [], strategicCategory: 'STRATEGIC_FIT',
            strategicAnalysis: {
                consultancyAlignment: 95, deliveryVisibility: 95, commercialProximity: 95,
                buyerEnvironmentFit: 95, seniorityScope: 95,
                resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'LOW',
                realRoleInterpretation: 'deep', consultancyRelevance: 'strong',
                strategicReasons: [], strategicConcerns: [], recommendedScreeningQuestions: [],
            },
        };
        const { adapter: persist, rows } = makePersistDouble();
        const deps: IngestionDeps = {
            ...defaultDeps, persist,
            intake: { fetchSources: async () => [SOURCES[0]!] },
            extraction: { extract: async () => [excludedExtracted] },
            preFilter: () => true, // force Pass 2 regardless of Fit Score
            deepScrape: { scrape: async (url): Promise<ScrapedContent> => ({ title: 't', description: SCRAPED_DESCRIPTION, url }) },
            strategicAnalysis: { analyze: async () => [strongDeepBroadLabel] },
            costGate: { digestAlreadyExtracted: async () => false, markDigestExtracted: async () => {}, deepAlreadyDone: () => false },
            sendAlert: async () => {},
            loadGuardrails: async () => DEFAULT_GUARDRAILS,
            loadPreferences: async () => ({ keywords: [], locations: [] }),
        };

        const summary = await runIngestion({}, deps);

        const row = rows.get('gmail://msgA#0');
        expect(summary.deepAnalyzed).toBe(1);            // Pass 2 ran with the broad-label deep result...
        expect(row?.strategicScore).toBe(0);             // ...but "Other" did not shadow the veto
        expect(row?.strategicCategory).toBe('REJECT');
        expect(row?.recommendedAction).toBe('SUPPRESS');
        expect(row?.concerns?.some((c) => c.includes('Gambling'))).toBe(true);
    });

    it('keeps a Pass-1 title-based veto when the deep analysis returns a generic title (#5)', async () => {
        // The veto term is in the TITLE (industry is a broad "Other"), and the deep re-analysis
        // returns a generic title + clean scraped body. The persisted title stays the Pass-1
        // value, so the veto must still fire from the carried-over Pass-1 title: score 0, REJECT.
        const excludedByTitle: ExtractedOpportunity = {
            type: 'JOB', title: 'Gambling Platform Engineer', company: 'BetCo', industry: 'Other',
            description: 'A role', sourceUrl: 'https://example.com/x', reasons: [], concerns: [], strategicCategory: 'STRATEGIC_FIT',
            strategicAnalysis: {
                consultancyAlignment: 80, deliveryVisibility: 80, commercialProximity: 80,
                buyerEnvironmentFit: 80, seniorityScope: 80,
                resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'LOW',
                realRoleInterpretation: 'Strong on paper.', consultancyRelevance: 'But excluded.',
                strategicReasons: [], strategicConcerns: [], recommendedScreeningQuestions: [],
            },
        };
        const cleanDeep: AIAnalysisResult = {
            type: 'JOB', title: 'Platform Engineer', company: 'BetCo',
            industry: 'Other', location: 'Remote', remoteStatus: 'REMOTE', description: SCRAPED_DESCRIPTION,
            reasons: ['deep'], concerns: [], strategicCategory: 'STRATEGIC_FIT',
            strategicAnalysis: {
                consultancyAlignment: 95, deliveryVisibility: 95, commercialProximity: 95,
                buyerEnvironmentFit: 95, seniorityScope: 95,
                resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'LOW',
                realRoleInterpretation: 'deep', consultancyRelevance: 'strong',
                strategicReasons: [], strategicConcerns: [], recommendedScreeningQuestions: [],
            },
        };
        const { adapter: persist, rows } = makePersistDouble();
        const deps: IngestionDeps = {
            ...defaultDeps, persist,
            intake: { fetchSources: async () => [SOURCES[0]!] },
            extraction: { extract: async () => [excludedByTitle] },
            preFilter: () => true,
            deepScrape: { scrape: async (url): Promise<ScrapedContent> => ({ title: 't', description: SCRAPED_DESCRIPTION, url }) },
            strategicAnalysis: { analyze: async () => [cleanDeep] },
            costGate: { digestAlreadyExtracted: async () => false, markDigestExtracted: async () => {}, deepAlreadyDone: () => false },
            sendAlert: async () => {},
            loadGuardrails: async () => DEFAULT_GUARDRAILS,
            loadPreferences: async () => ({ keywords: [], locations: [] }),
        };

        await runIngestion({}, deps);

        const row = rows.get('gmail://msgA#0');
        expect(row?.strategicScore).toBe(0);             // the Pass-1 title term still vetoes...
        expect(row?.strategicCategory).toBe('REJECT');   // ...through enrichment
        expect(row?.recommendedAction).toBe('SUPPRESS');
        expect(row?.concerns?.some((c) => c.includes('Gambling'))).toBe(true);
    });

    it('preserves a DEEP row on a forced reprocess instead of downgrading it (#6, Codex P2)', async () => {
        // A row already deep-analysed (DEEP, full scraped description) is re-encountered on a
        // forced run. Re-running Pass 1 would overwrite it with a snippet-level read, and the
        // deep pass is cost-gated from re-running — so the orchestrator leaves it untouched
        // rather than silently downgrade its depth + content to SHALLOW. Drives the REAL cost
        // gate (deepAlreadyDone keys on analysisDepth), only digest extraction is faked.
        const { adapter: persist, rows } = makePersistDouble();
        const deepRow = {
            id: 1, canonicalUrl: 'gmail://msgA#0', title: 'Delivery Lead', company: 'Acme',
            description: SCRAPED_DESCRIPTION, fitScore: 70, strategicScore: 90,
            analysisDepth: 'DEEP', recommendedAction: 'ALERT',
        } as OpportunityRow;
        rows.set('gmail://msgA#0', deepRow);

        const freshShallow: ExtractedOpportunity = {
            type: 'JOB', title: 'Delivery Lead', company: 'Acme', description: 'snippet only',
            sourceUrl: 'https://example.com/job1', reasons: [], concerns: [],
            strategicCategory: null, strategicAnalysis: EMPTY_STRATEGIC_ANALYSIS,
        };
        const deps: IngestionDeps = {
            ...defaultDeps, persist,
            intake: { fetchSources: async () => [SOURCES[0]!] },
            extraction: { extract: async () => [freshShallow] },
            deepScrape: { scrape: async (url): Promise<ScrapedContent> => ({ title: 't', description: SCRAPED_DESCRIPTION, url }) },
            strategicAnalysis: { analyze: async () => [FINAL_ANALYSIS] },
            // Real deepAlreadyDone (keys on analysisDepth); only the digest extraction gate is faked.
            costGate: { digestAlreadyExtracted: async () => false, markDigestExtracted: async () => {}, deepAlreadyDone: defaultDeps.costGate.deepAlreadyDone },
            sendAlert: async () => {},
            loadGuardrails: async () => DEFAULT_GUARDRAILS,
            loadPreferences: async () => ({ keywords: [], locations: [] }),
        };

        const summary = await runIngestion({ force: true }, deps);

        const row = rows.get('gmail://msgA#0');
        expect(summary.extracted).toBe(1);          // Pass 1 still extracted it...
        expect(summary.created).toBe(0);            // ...but the deep row was left untouched:
        expect(summary.updated).toBe(0);            // no re-persist
        expect(summary.deepAnalyzed).toBe(0);       // and no re-deepen
        expect(row?.analysisDepth).toBe('DEEP');    // depth preserved, not downgraded to SHALLOW
        expect(row?.description).toBe(SCRAPED_DESCRIPTION); // deep content preserved
        expect(row?.strategicScore).toBe(90);       // untouched
    });

    it('leaves a row SHALLOW + retryable when the deep re-analysis returns NOISE (#6, Codex P2)', async () => {
        // The production analyzer swallows a Gemini/parse failure and returns a truthy NOISE row
        // with an EMPTY strategic block. Marking that DEEP would persist empty fields and flip the
        // cost gate to deep-done, so the pre-Pass-1 guard would block every retry. Instead the row
        // must keep its Pass-1 SHALLOW analysis and stay retryable.
        const noiseDeep: AIAnalysisResult = {
            type: 'NOISE', title: 'Unknown', company: 'Unknown', industry: 'Unknown',
            location: 'Unknown', remoteStatus: 'Unknown', description: SCRAPED_DESCRIPTION,
            reasons: [], concerns: ['AI Analysis failed'], strategicCategory: null,
            strategicAnalysis: EMPTY_STRATEGIC_ANALYSIS,
        };
        const shallowExtracted: ExtractedOpportunity = {
            type: 'JOB', title: 'Delivery Lead', company: 'Acme', description: 'snippet only',
            sourceUrl: 'https://example.com/job1', reasons: [], concerns: [], strategicCategory: 'USEFUL_BRIDGE',
            strategicAnalysis: {
                consultancyAlignment: 55, deliveryVisibility: 45, commercialProximity: 40,
                buyerEnvironmentFit: 35, seniorityScope: 50,
                resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'LOW',
                realRoleInterpretation: 'shallow', consultancyRelevance: 'some',
                strategicReasons: ['shallow reason'], strategicConcerns: [], recommendedScreeningQuestions: [],
            },
        };
        const { adapter: persist, rows } = makePersistDouble();
        const deps: IngestionDeps = {
            ...defaultDeps, persist,
            intake: { fetchSources: async () => [SOURCES[0]!] },
            extraction: { extract: async () => [shallowExtracted] },
            preFilter: () => true,
            deepScrape: { scrape: async (url): Promise<ScrapedContent> => ({ title: 't', description: SCRAPED_DESCRIPTION, url }) },
            strategicAnalysis: { analyze: async () => [noiseDeep] },
            costGate: { digestAlreadyExtracted: async () => false, markDigestExtracted: async () => {}, deepAlreadyDone: defaultDeps.costGate.deepAlreadyDone },
            sendAlert: async () => {},
            loadGuardrails: async () => DEFAULT_GUARDRAILS,
            loadPreferences: async () => ({ keywords: [], locations: [] }),
        };

        const summary = await runIngestion({}, deps);

        const row = rows.get('gmail://msgA#0');
        expect(summary.deepAnalyzed).toBe(0);                 // NOISE is not a completed deep analysis
        expect(row?.analysisDepth).toBe('SHALLOW');           // left retryable, not marked DEEP
        expect(row?.consultancyAlignment).toBe(55);           // Pass-1 strategic block preserved, not emptied
        expect(row?.description).toBe('snippet only');        // not overwritten by the NOISE deep result
        expect(summary.errors.some((e) => e.stage === 'deepScrape')).toBe(true); // failure surfaced
        // The cost gate now allows a retry: a SHALLOW row is not deep-done.
        expect(defaultDeps.costGate.deepAlreadyDone(row)).toBe(false);
    });

    it('marks a cleanly-extracted digest and skips it on the next run via the marker (#12)', async () => {
        // A digest whose opportunities all persist without error is marked extracted; a second
        // run reads that completion marker and cost-skips the whole digest — no repeat
        // extraction LLM call. This is the happy-path the marker must preserve.
        const marked = new Set<string>();
        const { adapter: persist, rows } = makePersistDouble();
        const job: ExtractedOpportunity = {
            type: 'JOB', title: 'Engineer', company: 'Acme', description: 'A role',
            sourceUrl: null, reasons: [], concerns: [], strategicCategory: null,
            strategicAnalysis: EMPTY_STRATEGIC_ANALYSIS,
        };
        let extractCalls = 0;
        const deps: IngestionDeps = {
            ...defaultDeps, persist,
            intake: { fetchSources: async () => [SOURCES[0]!] },
            extraction: { extract: async () => { extractCalls++; return [job]; } },
            costGate: {
                digestAlreadyExtracted: async (id) => marked.has(id),
                markDigestExtracted: async (id) => { marked.add(id); },
                deepAlreadyDone: () => false,
            },
            sendAlert: async () => {},
            loadGuardrails: async () => DEFAULT_GUARDRAILS,
            loadPreferences: async () => ({ keywords: ['engineer'], locations: [] }),
        };

        const first = await runIngestion({}, deps);
        expect(first.created).toBe(1);
        expect(extractCalls).toBe(1);
        expect(marked.has('msgA')).toBe(true);    // clean digest → marked extracted

        const second = await runIngestion({}, deps);
        expect(second.costSkipped).toBe(1);       // marker read → whole digest skipped
        expect(second.extracted).toBe(0);
        expect(extractCalls).toBe(1);             // no second extraction LLM call
        expect(rows.size).toBe(1);
    });

    it('re-extracts a digest that failed after persisting #0, instead of skipping it forever (#12)', async () => {
        // The reported bug: a prior run persisted #0 then failed before #1, so the old
        // #0-presence proxy treated the digest as done and #1 was lost forever. With the
        // completion marker, the half-written digest is left UNMARKED — so the next run does
        // not skip it: it re-extracts and recovers #1.
        const marked = new Set<string>();
        const { adapter: realPersist, rows } = makePersistDouble();
        // Persist double that throws on opportunity #1 during the first run only, simulating a
        // crash after #0 landed but before the rest of the digest was written.
        let failSecondOpportunity = true;
        const persist: PersistAdapter = {
            ...realPersist,
            async upsertByCanonicalUrl(values, conflictSet) {
                if (failSecondOpportunity && values.canonicalUrl === 'gmail://msgA#1') {
                    throw new Error('boom: persist crashed after #0');
                }
                return realPersist.upsertByCanonicalUrl(values, conflictSet);
            },
        };
        const mkJob = (title: string): ExtractedOpportunity => ({
            type: 'JOB', title, company: 'Acme', description: 'A role',
            sourceUrl: null, reasons: [], concerns: [], strategicCategory: null,
            strategicAnalysis: EMPTY_STRATEGIC_ANALYSIS,
        });
        const twoJobs = [mkJob('Engineer Zero'), mkJob('Engineer One')];
        const deps: IngestionDeps = {
            ...defaultDeps, persist,
            intake: { fetchSources: async () => [SOURCES[0]!] },
            extraction: { extract: async () => twoJobs },
            costGate: {
                digestAlreadyExtracted: async (id) => marked.has(id),
                markDigestExtracted: async (id) => { marked.add(id); },
                deepAlreadyDone: () => false,
            },
            sendAlert: async () => {},
            loadGuardrails: async () => DEFAULT_GUARDRAILS,
            loadPreferences: async () => ({ keywords: ['engineer'], locations: [] }),
        };

        // Run 1: #0 persists, #1 throws (isolated + recorded). The digest is NOT marked.
        const first = await runIngestion({}, deps);
        expect(rows.get('gmail://msgA#0')?.title).toBe('Engineer Zero');
        expect(rows.get('gmail://msgA#1')).toBeUndefined();              // lost in the crash
        expect(first.errors.some((e) => e.canonicalUrl === 'gmail://msgA#1')).toBe(true);
        expect(marked.has('msgA')).toBe(false);                          // half-written → unmarked

        // Run 2: the gate sees no marker, so it does NOT skip — it re-extracts and recovers #1.
        failSecondOpportunity = false;
        const second = await runIngestion({}, deps);
        expect(second.costSkipped).toBe(0);                              // not skipped: bug fixed
        expect(rows.get('gmail://msgA#1')?.title).toBe('Engineer One');  // recovered
        expect(marked.has('msgA')).toBe(true);                           // now clean → marked
    });

    it('does not mark a digest whose extraction failed, so it is retried (#12, Codex P1)', async () => {
        // A swallowed Gemini/parse failure surfaces as a thrown extraction (see extraction.ts,
        // which converts the sentinel NOISE row into an error). The source-level catch records it
        // and the digest is left UNMARKED — otherwise a failed extraction would look like a clean
        // all-NOISE digest, get marked, and skip the digest forever, losing every real role in it.
        const marked = new Set<string>();
        const { adapter: persist, rows } = makePersistDouble();
        const job: ExtractedOpportunity = {
            type: 'JOB', title: 'Engineer', company: 'Acme', description: 'A role',
            sourceUrl: null, reasons: [], concerns: [], strategicCategory: null,
            strategicAnalysis: EMPTY_STRATEGIC_ANALYSIS,
        };
        let failExtraction = true;
        const deps: IngestionDeps = {
            ...defaultDeps, persist,
            intake: { fetchSources: async () => [SOURCES[0]!] },
            extraction: { extract: async () => {
                if (failExtraction) throw new Error('AI extraction failed for message msgA');
                return [job];
            } },
            costGate: {
                digestAlreadyExtracted: async (id) => marked.has(id),
                markDigestExtracted: async (id) => { marked.add(id); },
                deepAlreadyDone: () => false,
            },
            sendAlert: async () => {},
            loadGuardrails: async () => DEFAULT_GUARDRAILS,
            loadPreferences: async () => ({ keywords: ['engineer'], locations: [] }),
        };

        // Run 1: extraction fails → recorded as a source error, digest left unmarked.
        const first = await runIngestion({}, deps);
        expect(first.errors.some((e) => e.stage === 'source' && e.messageId === 'msgA')).toBe(true);
        expect(marked.has('msgA')).toBe(false);   // failed extraction → NOT marked
        expect(rows.size).toBe(0);

        // Run 2: no marker → not skipped → re-extracts and recovers the real opportunity.
        failExtraction = false;
        const second = await runIngestion({}, deps);
        expect(second.costSkipped).toBe(0);       // not skipped: failure was retried
        expect(rows.get('gmail://msgA#0')?.title).toBe('Engineer');
        expect(marked.has('msgA')).toBe(true);    // now clean → marked
    });
});

describe('mergeGuardrailSettings (#5)', () => {
    it('fills missing lists from defaults on a partial stored object', () => {
        const merged = mergeGuardrailSettings({ excludedIndustries: ['Crypto'] });
        expect(merged.excludedIndustries).toEqual(['Crypto']);                       // honoured
        expect(merged.penaltyKeywords).toEqual(DEFAULT_GUARDRAILS.penaltyKeywords);  // filled
        expect(merged.tier1Keywords).toEqual(DEFAULT_GUARDRAILS.tier1Keywords);      // filled
    });

    it('coerces non-array / null / undefined values to defaults so guardrails never crash', () => {
        const merged = mergeGuardrailSettings({ excludedIndustries: 'oops', penaltyKeywords: null });
        expect(merged.excludedIndustries).toEqual(DEFAULT_GUARDRAILS.excludedIndustries);
        expect(merged.penaltyKeywords).toEqual(DEFAULT_GUARDRAILS.penaltyKeywords);
        expect(mergeGuardrailSettings(undefined)).toEqual(DEFAULT_GUARDRAILS);
    });

    it('passes a complete stored object through unchanged', () => {
        const full = { excludedIndustries: ['A'], penaltyKeywords: ['b'], tier1Keywords: ['c'] };
        expect(mergeGuardrailSettings(full)).toEqual(full);
    });

    it('drops non-string entries so guardrails never call .toLowerCase() on a number', () => {
        // mixed list → keep only the strings; a list with NO valid strings is malformed → defaults.
        const merged = mergeGuardrailSettings({ excludedIndustries: ['Crypto', 123, null], penaltyKeywords: [42] });
        expect(merged.excludedIndustries).toEqual(['Crypto']);                        // numbers/nulls dropped
        expect(merged.penaltyKeywords).toEqual(DEFAULT_GUARDRAILS.penaltyKeywords);   // all-invalid → fallback
    });

    it('honours an intentionally-empty list (no entries) without falling back to defaults', () => {
        const merged = mergeGuardrailSettings({ excludedIndustries: [] });
        expect(merged.excludedIndustries).toEqual([]);
    });

    it('trims and drops blank/whitespace-only entries so a " " never vetoes every row', () => {
        // mixed valid + blank → keep the trimmed valid one; all-blank → malformed → defaults.
        const merged = mergeGuardrailSettings({ excludedIndustries: [' Crypto ', '  '], penaltyKeywords: [' '] });
        expect(merged.excludedIndustries).toEqual(['Crypto']);                        // trimmed, blank dropped
        expect(merged.penaltyKeywords).toEqual(DEFAULT_GUARDRAILS.penaltyKeywords);   // all-blank → fallback
    });
});
