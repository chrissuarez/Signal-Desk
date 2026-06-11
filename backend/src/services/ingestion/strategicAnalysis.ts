/**
 * Strategic Analysis seam — Pass 2 (issue #11, plan commit 6).
 *
 * Wraps the re-analysis of a deeply-scraped full description, behind an adapter so the
 * pipeline test can substitute a fake. Today this re-runs the same AI extraction over
 * the richer text; behaviour identical to the direct analyzeOpportunityWithAI call.
 */

import { analyzeOpportunityWithAI, type AIAnalysisResult } from '../aiService.js';

export interface StrategicAnalysisAdapter {
  /** Re-analyze a full (scraped) description into opportunities. */
  analyze(description: string): Promise<AIAnalysisResult[]>;
}

/** AI-backed Strategic Analysis adapter (today's behaviour). */
export const aiStrategicAnalysis: StrategicAnalysisAdapter = {
  analyze(description) {
    return analyzeOpportunityWithAI(description);
  },
};
