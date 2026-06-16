/**
 * Extraction seam — Pass 1 (issue #11, plan commit 5; honest internals from #14).
 *
 * One injected `ExtractionAdapter` turns a RawSource digest into validated
 * `ExtractedOpportunity` DTOs. The key-vs-no-key choice is no longer an `if`/`else` inside
 * a single adapter: {@link createExtractor} reads `GEMINI_API_KEY` once and returns the real
 * {@link geminiExtractor} (validated Gemini, throws ExtractionError on failure — see
 * geminiExtractor.ts) or the {@link deterministicExtractor} no-key fallback. Tests inject a
 * fake adapter directly. Behaviour at the orchestrator boundary is unchanged.
 */

import { parseEmailBody, classifyOpportunity } from '../../engine/parser.js';
import { extractWithGemini } from './geminiExtractor.js';
import { EMPTY_STRATEGIC_ANALYSIS } from '../../engine/strategicAnalysis.js';
import type { ExtractedOpportunity, RawSource } from './types.js';

export interface ExtractionAdapter {
  /** Extract zero or more opportunities from a single raw source (digest). */
  extract(source: RawSource): Promise<ExtractedOpportunity[]>;
}

/**
 * Concern stamped on the single result the no-key heuristic fallback returns. Exported so the
 * orchestrator can tell a *degraded* (heuristic, no-LLM) extraction apart from a genuine AI one
 * and decline to finalize the digest — see {@link isHeuristicFallback}.
 */
export const NO_API_KEY_CONCERN = 'AI analysis skipped (no API key)';

/**
 * True when `results` is the no-key heuristic fallback (a lone row carrying
 * {@link NO_API_KEY_CONCERN}) rather than a real AI extraction. The orchestrator uses this to
 * avoid writing the per-digest completion marker (#12): the heuristic returns at most one row
 * regardless of how many opportunities the digest holds and never runs the LLM, so marking it
 * "fully extracted" would lose the rest of the digest and permanently skip it once a key exists.
 */
export const isHeuristicFallback = (results: ExtractedOpportunity[]): boolean =>
  results.length === 1 && (results[0]?.concerns?.includes(NO_API_KEY_CONCERN) ?? false);

/** The real adapter: validated Gemini extraction (#14). Throws ExtractionError on failure. */
export const geminiExtractor: ExtractionAdapter = {
  extract(source) {
    console.log(`Analyzing message ${source.messageId} with AI (Length: ${source.body.length})...`);
    return extractWithGemini(source.body);
  },
};

/**
 * The honest no-key fallback: classify + parse the digest locally, with no LLM. Returns a
 * single heuristic row carrying {@link NO_API_KEY_CONCERN} (the orchestrator skips it when it
 * classifies as NOISE and never finalizes the digest, so a later keyed run extracts it
 * properly — see #12). This is a production degraded-mode adapter, not test scaffolding.
 */
export const deterministicExtractor: ExtractionAdapter = {
  async extract(source) {
    const { subject, body } = source;
    const type = classifyOpportunity(body);
    const parsed = parseEmailBody(body);
    return [
      {
        type,
        title: parsed.title === 'Unknown Position' ? subject : parsed.title,
        company: parsed.company,
        description: body,
        reasons: [],
        concerns: [NO_API_KEY_CONCERN],
        strategicCategory: null,
        strategicAnalysis: EMPTY_STRATEGIC_ANALYSIS,
      },
    ];
  },
};

/** Pick the extraction adapter for the current environment: keyed → Gemini, else deterministic. */
export const createExtractor = (): ExtractionAdapter =>
  process.env.GEMINI_API_KEY ? geminiExtractor : deterministicExtractor;

/**
 * Default Extraction adapter. Picks the concrete extractor once on first use (after dotenv has
 * loaded) and memoizes it, so `GEMINI_API_KEY` is read once rather than per extract — while
 * staying a stable value for `defaultDeps`.
 */
let cached: ExtractionAdapter | undefined;
export const defaultExtraction: ExtractionAdapter = {
  extract(source) {
    cached ??= createExtractor();
    return cached.extract(source);
  },
};
