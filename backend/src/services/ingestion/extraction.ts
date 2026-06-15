/**
 * Extraction seam — Pass 1 (issue #11, plan commit 5).
 *
 * Unifies the two ways runIngestion turns a RawSource body into opportunities today:
 * the Gemini-backed AI branch (when GEMINI_API_KEY is set) and the local
 * parser/classifier fallback. Returns pipeline ExtractedOpportunity DTOs. Behaviour
 * identical. The honest/validated AI adapter internals are out of scope here
 * (architecture candidate #3) — this commit only relocates the existing branch.
 */

import { parseEmailBody, classifyOpportunity } from '../../engine/parser.js';
import { analyzeOpportunityWithAI, isAiAnalysisFailure } from '../aiService.js';
import { EMPTY_STRATEGIC_ANALYSIS } from '../../engine/strategicAnalysis.js';
import type { ExtractedOpportunity, RawSource } from './types.js';

export interface ExtractionAdapter {
  /** Extract zero or more opportunities from a single raw source (digest). */
  extract(source: RawSource): Promise<ExtractedOpportunity[]>;
}

/** Default Extraction adapter: AI when keyed, local parser fallback otherwise. */
export const defaultExtraction: ExtractionAdapter = {
  async extract(source) {
    const { messageId, subject, body } = source;

    if (process.env.GEMINI_API_KEY) {
      console.log(`Analyzing message ${messageId} with AI (Length: ${body.length})...`);
      const results = await analyzeOpportunityWithAI(body);
      // analyzeOpportunityWithAI swallows a Gemini/parse failure into a sentinel NOISE row
      // rather than throwing. Surface it as a real extraction error here so the orchestrator
      // records it and leaves the digest UNMARKED (#12) — otherwise a swallowed failure would
      // look like a clean all-NOISE digest, get marked complete, and skip the digest forever,
      // losing every real opportunity in it. Throwing lets the next run re-extract and recover.
      if (isAiAnalysisFailure(results)) {
        throw new Error(`AI extraction failed for message ${messageId}`);
      }
      return results;
    }

    const type = classifyOpportunity(body);
    const parsed = parseEmailBody(body);
    return [
      {
        type,
        title: parsed.title === 'Unknown Position' ? subject : parsed.title,
        company: parsed.company,
        description: body,
        reasons: [],
        concerns: ['AI analysis skipped (no API key)'],
        strategicCategory: null,
        strategicAnalysis: EMPTY_STRATEGIC_ANALYSIS,
      },
    ];
  },
};
