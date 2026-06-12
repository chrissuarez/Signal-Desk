/**
 * Strategic Analysis validated boundary (issue #3).
 *
 * The first real zod consumer in the codebase. ADR-0002 makes the LLM authoritative for
 * the Strategic Analysis, which means an *untrusted* block of ~a dozen fields crosses
 * into ingestion on every analyse. This schema is the guardrail at that boundary: it
 * clamps the five LLM-judged Component Scores into 0–100, coerces the two risk levels to
 * the known severities, trims the narrative fields, and defaults the three array fields —
 * so a malformed LLM payload degrades to nulls/empties rather than poisoning a write
 * (the same philosophy as #2's coerceStrategicCategory, generalised to the whole block).
 *
 * Scope: this owns *shape + validation* only. `practicalFit` is deliberately absent — it
 * is the demoted Fit Score, sourced deterministically at ingest, not judged by the LLM.
 * No aggregation/ranking (#4) and no category reconciliation (#5) live here. A later
 * refactor (#14) generalises this validated-boundary into a full StrategicAnalyzer seam.
 */

import { z } from 'zod';
import { RISK_LEVELS } from './strategicVocabulary.js';

/** A Component Score: an integer 0–100, or null when the LLM omitted/garbled it. */
const scoreField = z.preprocess((v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n)
    ? Math.min(100, Math.max(0, Math.round(n)))
    : null;
}, z.number().nullable());

/** A risk flag: one of the known severities (case/whitespace-tolerant), else null. */
const riskField = z.preprocess((v) => {
  if (typeof v !== 'string') return null;
  const up = v.trim().toUpperCase();
  return (RISK_LEVELS as readonly string[]).includes(up) ? up : null;
}, z.enum(RISK_LEVELS).nullable());

/** A narrative field: a trimmed non-empty string, else null. */
const textField = z.preprocess((v) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}, z.string().nullable());

/** An array field: the string members (trimmed, non-empty), defaulting to []. */
const arrayField = z.preprocess(
  (v) =>
    Array.isArray(v)
      ? v.filter((x) => typeof x === 'string').map((x) => (x as string).trim()).filter((x) => x.length)
      : [],
  z.array(z.string()),
);

export const strategicAnalysisSchema = z.object({
  consultancyAlignment: scoreField,
  deliveryVisibility: scoreField,
  commercialProximity: scoreField,
  buyerEnvironmentFit: scoreField,
  seniorityScope: scoreField,
  resourceAdminTrapRisk: riskField,
  seoComfortZoneRisk: riskField,
  realRoleInterpretation: textField,
  consultancyRelevance: textField,
  strategicReasons: arrayField,
  strategicConcerns: arrayField,
  recommendedScreeningQuestions: arrayField,
});

/** The LLM-judged Strategic Analysis block (sans practicalFit — that's the Fit Score). */
export type StrategicAnalysis = z.infer<typeof strategicAnalysisSchema>;

/** The all-null / empty-array analysis: an Opportunity not yet (or not validly) analysed. */
export const EMPTY_STRATEGIC_ANALYSIS: StrategicAnalysis = {
  consultancyAlignment: null,
  deliveryVisibility: null,
  commercialProximity: null,
  buyerEnvironmentFit: null,
  seniorityScope: null,
  resourceAdminTrapRisk: null,
  seoComfortZoneRisk: null,
  realRoleInterpretation: null,
  consultancyRelevance: null,
  strategicReasons: [],
  strategicConcerns: [],
  recommendedScreeningQuestions: [],
};

/**
 * Validate an untrusted strategic block (e.g. from the LLM) into a StrategicAnalysis.
 * Non-object input (null, array, string) yields the empty analysis; every field is
 * independently coerced so partial output still persists whatever it got.
 */
export const parseStrategicAnalysis = (raw: unknown): StrategicAnalysis => {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return strategicAnalysisSchema.parse(input);
};
