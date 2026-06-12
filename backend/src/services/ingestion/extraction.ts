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
import { analyzeOpportunityWithAI } from '../aiService.js';
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
      return await analyzeOpportunityWithAI(body);
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
