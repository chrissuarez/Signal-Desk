/**
 * Pipeline DTOs for the carved ingestion pipeline (issue #11).
 *
 * These are the shapes that flow between the eight stages — Intake · Extraction ·
 * Strategic Pre-filter · Deep scrape · Strategic Analysis · Score+Category reconcile ·
 * Recommended Action routing · Persist — plus the Cost Gate predicate.
 *
 * Defined up front (plan commit 2) so each subsequent extract commit imports a stable
 * contract rather than re-deriving inline `any` shapes. Not wired into the orchestrator
 * yet.
 */

import type { StrategicCategory } from '../../engine/strategicVocabulary.js';
import type { StrategicAnalysis } from '../../engine/strategicAnalysis.js';
import type { Preferences } from '../../engine/scoring.js';

/**
 * User scoring preferences, as persisted under settings key `user_preferences`.
 *
 * One shape with the scoring engine (issue #15): an alias of the engine's `Preferences`
 * so the pipeline DTOs and `calculateFitScore` cannot drift. The validated read path
 * lives in `ingestion/preferences.ts`.
 */
export type IngestionPreferences = Preferences;

/** A normalized raw email digest yielded by the Intake adapter (one per Gmail message). */
export interface RawSource {
  /** Gmail message id; basis for the `gmail://<id>#<i>` canonical URL. */
  messageId: string;
  subject: string;
  from: string;
  /** Best-available body text (full body, falling back to snippet). */
  body: string;
  /** Gmail `internalDate` (epoch-ms string), used for `receivedAt`. */
  internalDate?: string;
}

/** A single opportunity emitted by the Extraction adapter (Pass 1) from one RawSource. */
export interface ExtractedOpportunity {
  type: 'JOB' | 'BUSINESS' | 'NOISE';
  title: string;
  company?: string;
  description: string;
  industry?: string;
  location?: string;
  remoteStatus?: string;
  sourceUrl?: string | null;
  reasons: string[];
  concerns: string[];
  /** LLM-proposed Strategic Category (#2); null when uncategorised or no-key fallback. */
  strategicCategory: StrategicCategory | null;
  /** Validated LLM Strategic Analysis block (#3); EMPTY block on no-key/failure fallback. */
  strategicAnalysis: StrategicAnalysis;
}

/** Output of the Score + Category reconcile seam. */
export interface ScoreResult {
  fitScore: number;
  reasons: string[];
  concerns: string[];
}

/** The persisted Recommended Action values (schema enum `recommended_action`). */
export type RecommendedAction = 'ALERT' | 'DIGEST' | 'STORE' | 'SUPPRESS';

/**
 * Output of the Recommended Action routing seam — today's effective routing,
 * expressed as the status written plus the alert decision. (Deep-pass gating is the
 * Strategic Pre-filter's concern, not routing's.) Commit 9 moves the existing
 * ternaries here verbatim; ADR-0005 later switches persistence to write
 * `recommendedAction` instead of `status` and adds SUPPRESS.
 */
export interface RoutingDecision {
  status: 'NEW' | 'DISMISSED';
  shouldAlert: boolean;
}

/** A failure collected during a run (per-source or per-opportunity); see commit 13. */
export interface IngestionError {
  stage: string;
  messageId?: string;
  canonicalUrl?: string;
  message: string;
}

/**
 * The typed result of a full ingestion run — the orchestrator's return value and the
 * primary test surface (commit 11 switches `runIngestion` from `void` to this).
 */
export interface IngestionRunSummary {
  /** Sources (digests) intaken. */
  sourcesSeen: number;
  /** Sources skipped by the per-digest Cost Gate. */
  costSkipped: number;
  /** Opportunities emitted by Extraction. */
  extracted: number;
  /** Opportunities that passed the Strategic Pre-filter into deep processing. */
  preFilterPassed: number;
  /** Opportunities that ran the Pass 2 deep scrape + re-analysis. */
  deepAnalyzed: number;
  /** Rows newly created by Persist. */
  created: number;
  /** Rows updated by Persist. */
  updated: number;
  /** Tally of opportunities by their routed Recommended Action. */
  byRecommendedAction: Record<RecommendedAction, number>;
  /** Failures collected during the run. */
  errors: IngestionError[];
}
