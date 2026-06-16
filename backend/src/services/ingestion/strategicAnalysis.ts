/**
 * Strategic Analysis seam — Pass 2 (issue #11, plan commit 6; routed through the seam in #14).
 *
 * Re-analyses a deeply-scraped full description, behind an adapter so the pipeline test can
 * substitute a fake. It now routes through the same {@link defaultExtraction} the Pass-1
 * extractor uses, so the deep re-analysis is validated the same way (#14) AND no longer
 * crashes in no-key mode — the factory hands it the deterministic fallback instead of calling
 * Gemini with no key (the latent crash the direct aiService call carried).
 *
 * Marked for replacement: the real StrategicAnalyzer (its own schema + Fake) is a later
 * slice's job; this adapter only re-runs extraction over the richer scraped text.
 */

import { defaultExtraction } from './extraction.js';
import type { ExtractedOpportunity, RawSource } from './types.js';

export interface StrategicAnalysisAdapter {
  /** Re-analyze a full (scraped) description into opportunities. */
  analyze(description: string): Promise<ExtractedOpportunity[]>;
}

/** A synthetic RawSource so the deep description can flow through the extraction seam. */
const asDeepSource = (description: string): RawSource => ({
  messageId: 'pass2-deep',
  subject: '',
  from: '',
  body: description,
});

/** Extraction-backed Strategic Analysis adapter — validated, no-key safe (#14). */
export const aiStrategicAnalysis: StrategicAnalysisAdapter = {
  analyze(description) {
    return defaultExtraction.extract(asDeepSource(description));
  },
};
