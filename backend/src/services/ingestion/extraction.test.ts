/**
 * Unit tests for the no-key heuristic-fallback detection (#12, Codex P2).
 *
 * When GEMINI_API_KEY is absent, defaultExtraction returns a single heuristic row carrying
 * NO_API_KEY_CONCERN instead of running the LLM. isHeuristicFallback lets the orchestrator
 * tell that degraded path apart from a genuine AI extraction so it never finalizes (marks)
 * the digest — see ingestionService's completion-marker guard.
 */

import { describe, it, expect } from 'vitest';
import { NO_API_KEY_CONCERN, isHeuristicFallback } from './extraction.js';
import { EMPTY_STRATEGIC_ANALYSIS } from '../../engine/strategicAnalysis.js';
import type { ExtractedOpportunity } from './types.js';

const make = (overrides: Partial<ExtractedOpportunity>): ExtractedOpportunity => ({
    type: 'NOISE', title: 'X', company: 'Y', description: 'body', sourceUrl: null,
    reasons: [], concerns: [], strategicCategory: null,
    strategicAnalysis: EMPTY_STRATEGIC_ANALYSIS, ...overrides,
});

describe('isHeuristicFallback (#12)', () => {
    it('detects the no-key fallback sentinel (NOISE or JOB)', () => {
        expect(isHeuristicFallback([make({ type: 'NOISE', concerns: [NO_API_KEY_CONCERN] })])).toBe(true);
        expect(isHeuristicFallback([make({ type: 'JOB', concerns: [NO_API_KEY_CONCERN] })])).toBe(true);
    });

    it('does not flag a genuine AI extraction', () => {
        expect(isHeuristicFallback([make({ concerns: [] })])).toBe(false);
        expect(isHeuristicFallback([make({ type: 'JOB', concerns: ['Some real concern'] })])).toBe(false);
    });

    it('does not flag a multi-row result (the fallback only ever returns one)', () => {
        expect(isHeuristicFallback([
            make({ concerns: [NO_API_KEY_CONCERN] }),
            make({ type: 'JOB' }),
        ])).toBe(false);
        expect(isHeuristicFallback([])).toBe(false);
    });
});
