/**
 * Unit tests for the validated Gemini extraction boundary (issue #14).
 *
 * Asserts the two-tier failure contract through the public surface — canned model response
 * strings in, validated ExtractedOpportunity[] / [] / thrown ExtractionError out — never by
 * reaching into parse internals:
 *  - structural drop (missing title, invalid type, non-object row)
 *  - soft coerce (out-of-range remoteStatus → Unknown + concern, row kept)
 *  - whole-response unparseable JSON → throw ExtractionError
 *  - ```json``` fence stripping
 *  - multi-role digest → N rows
 *  - genuine NOISE row kept (the orchestrator skips it; it is not a failure)
 */

import { describe, it, expect } from 'vitest';
import { parseGeminiResponse, validateExtractedRow, ExtractionError } from './geminiExtractor.js';

/** One well-formed Gemini row with every identity + strategic field present. */
const fullRow = (overrides: Record<string, unknown> = {}) => ({
    type: 'JOB',
    title: 'Delivery Lead',
    company: 'Acme',
    industry: 'Technology & Software',
    location: 'London',
    remoteStatus: 'Remote',
    description: 'Own delivery across squads.',
    sourceUrl: 'https://example.com/job1',
    reasons: ['clear remit'],
    concerns: [],
    strategicCategory: 'STRATEGIC_FIT',
    consultancyAlignment: 80,
    deliveryVisibility: 75,
    commercialProximity: 60,
    buyerEnvironmentFit: 55,
    seniorityScope: 70,
    resourceAdminTrapRisk: 'LOW',
    seoComfortZoneRisk: 'LOW',
    realRoleInterpretation: 'A delivery leadership role.',
    consultancyRelevance: 'Strong.',
    strategicReasons: ['compounds the goal'],
    strategicConcerns: [],
    recommendedScreeningQuestions: ['Who owns the roadmap?'],
    ...overrides,
});

describe('parseGeminiResponse (#14) — whole-response contract', () => {
    it('throws ExtractionError on unparseable JSON (failure ≠ empty)', () => {
        expect(() => parseGeminiResponse('the model apologised instead of answering')).toThrow(ExtractionError);
    });

    it('strips ```json``` fences before parsing', () => {
        const fenced = '```json\n' + JSON.stringify([fullRow()]) + '\n```';
        const out = parseGeminiResponse(fenced);
        expect(out).toHaveLength(1);
        expect(out[0]?.title).toBe('Delivery Lead');
    });

    it('extracts every role in a multi-role digest', () => {
        const out = parseGeminiResponse(JSON.stringify([
            fullRow({ title: 'Delivery Lead' }),
            fullRow({ title: 'Programme Manager' }),
            fullRow({ title: 'PMO Analyst' }),
        ]));
        expect(out.map((o) => o.title)).toEqual(['Delivery Lead', 'Programme Manager', 'PMO Analyst']);
    });

    it('keeps a genuine NOISE row (skipping is the orchestrator\'s job, not a failure)', () => {
        const out = parseGeminiResponse(JSON.stringify([{ type: 'NOISE', title: 'Newsletter' }]));
        expect(out).toHaveLength(1);
        expect(out[0]?.type).toBe('NOISE');
    });

    it('accepts a single bare object as well as an array', () => {
        const out = parseGeminiResponse(JSON.stringify(fullRow()));
        expect(out).toHaveLength(1);
    });

    it('throws when any row fails structural validation (total loss → retry the digest)', () => {
        expect(() => parseGeminiResponse(JSON.stringify([{ jobTitle: 'Engineer' }]))).toThrow(ExtractionError);
        expect(() => parseGeminiResponse(JSON.stringify([{ type: 'JOB' }, { type: 'BUSINESS' }]))).toThrow(ExtractionError);
    });

    it('throws on a PARTIAL structural drop rather than compacting (keeps canonical-URL indexes stable)', () => {
        // Compacting [invalid, valid] → [valid] would persist the valid role at #0; a later clean
        // re-extraction puts a different role at #0 → identity corruption. So fail + retry instead.
        expect(() => parseGeminiResponse(JSON.stringify([{ jobTitle: 'Dropped' }, fullRow({ title: 'Delivery Lead' })])))
            .toThrow(ExtractionError);
    });

    it('returns [] for a genuinely empty response without throwing (newsletter, no roles)', () => {
        expect(parseGeminiResponse('[]')).toEqual([]);
    });

    it('completes a title-less NOISE digest without throwing (newsletter sentinel)', () => {
        // The prompt returns a lone {type:NOISE} for a no-role digest; it has no title, but the
        // orchestrator skips NOISE rows so the digest must still complete (not throw + re-extract).
        const out = parseGeminiResponse('[{"type":"NOISE"}]');
        expect(out).toHaveLength(1);
        expect(out[0]?.type).toBe('NOISE');
    });
});

describe('validateExtractedRow (#14) — per-row two-tier contract', () => {
    it('drops a structurally-invalid row: missing title', () => {
        expect(validateExtractedRow({ type: 'JOB', description: 'x' })).toBeNull();
    });

    it('drops a structurally-invalid row: unrecognised type', () => {
        expect(validateExtractedRow(fullRow({ type: 'GOSSIP' }))).toBeNull();
    });

    it('accepts a title-less NOISE row (title is required only for JOB/BUSINESS)', () => {
        expect(validateExtractedRow({ type: 'NOISE' })?.type).toBe('NOISE');
        expect(validateExtractedRow({ type: 'JOB' })).toBeNull(); // JOB still needs a title
    });

    it('drops a non-object row', () => {
        expect(validateExtractedRow('not an object')).toBeNull();
        expect(validateExtractedRow(null)).toBeNull();
        expect(validateExtractedRow(['array'])).toBeNull();
    });

    it('soft-coerces an out-of-range remoteStatus to Unknown and keeps the row + a concern', () => {
        const row = validateExtractedRow(fullRow({ remoteStatus: 'Telepathic' }));
        expect(row).not.toBeNull();
        expect(row?.remoteStatus).toBe('Unknown');
        expect(row?.concerns.some((c) => c.includes('remote status'))).toBe(true);
    });

    it('validates the strategic block through the #2/#3 boundaries', () => {
        const row = validateExtractedRow(fullRow({ strategicCategory: 'NONSENSE', consultancyAlignment: 999 }));
        expect(row?.strategicCategory).toBeNull(); // unknown category coerced to null (#2)
        expect(row?.strategicAnalysis.consultancyAlignment).toBe(100); // clamped to 0–100 (#3)
    });

    it('normalises sourceUrl: the literal "null" string becomes null', () => {
        expect(validateExtractedRow(fullRow({ sourceUrl: 'null' }))?.sourceUrl).toBeNull();
        expect(validateExtractedRow(fullRow({ sourceUrl: '  ' }))?.sourceUrl).toBeNull();
    });
});
