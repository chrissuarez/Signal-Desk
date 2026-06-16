/**
 * Unit tests for the swallowed-AI-failure sentinel detection (#12, Codex P1).
 *
 * `analyzeOpportunityWithAI` catches a Gemini/parse failure and returns a lone NOISE row
 * carrying `AI_ANALYSIS_FAILED_CONCERN` instead of throwing. `isAiAnalysisFailure` lets the
 * extraction seam tell that swallowed failure apart from a genuine all-NOISE digest, so a
 * failed extraction is never mistaken for a clean one and marked complete forever.
 */

import { describe, it, expect } from 'vitest';
import {
    AI_ANALYSIS_FAILED_CONCERN,
    isAiAnalysisFailure,
    type AIAnalysisResult,
} from './aiService.js';
import { EMPTY_STRATEGIC_ANALYSIS } from '../engine/strategicAnalysis.js';

const noise = (concerns: string[]): AIAnalysisResult => ({
    type: 'NOISE', title: 'Unknown', company: 'Unknown', industry: 'Unknown',
    location: 'Unknown', remoteStatus: 'Unknown', description: 'body',
    reasons: [], concerns, strategicCategory: null, strategicAnalysis: EMPTY_STRATEGIC_ANALYSIS,
});

describe('isAiAnalysisFailure (#12)', () => {
    it('detects the swallowed-failure sentinel', () => {
        expect(isAiAnalysisFailure([noise([AI_ANALYSIS_FAILED_CONCERN])])).toBe(true);
    });

    it('does not flag a genuine all-NOISE digest (newsletter with no roles)', () => {
        expect(isAiAnalysisFailure([noise([])])).toBe(false);
        expect(isAiAnalysisFailure([noise(['No relevant opportunities'])])).toBe(false);
    });

    it('does not flag a digest that yielded real opportunities', () => {
        const job: AIAnalysisResult = { ...noise([]), type: 'JOB', title: 'Engineer' };
        expect(isAiAnalysisFailure([job])).toBe(false);
        expect(isAiAnalysisFailure([job, noise([AI_ANALYSIS_FAILED_CONCERN])])).toBe(false);
    });

    it('treats an empty result set as not-a-failure', () => {
        expect(isAiAnalysisFailure([])).toBe(false);
    });
});
