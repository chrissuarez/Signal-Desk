/**
 * Gemini-backed extraction core (issue #14).
 *
 * The honest replacement for aiService's blind-cast `analyzeOpportunityWithAI`. Three
 * behaviours that were tangled there are separated here:
 *
 *  1. **Validation at the boundary.** The untrusted Gemini JSON is validated through
 *     {@link ExtractedOpportunitySchema} (the identity fields) plus the existing
 *     `parseStrategicAnalysis`/`coerceStrategicCategory` boundaries (the strategic block,
 *     #2/#3) — a drifted field or wrong type can no longer sail straight into persistence.
 *  2. **Failure ≠ empty.** A request/parse failure now `throw`s an {@link ExtractionError}
 *     instead of being swallowed into a phantom NOISE row, so the orchestrator's per-source
 *     error isolation records it and leaves the digest unmarked → it is retried next run
 *     (this replaces #12's `isAiAnalysisFailure` sentinel band-aid with a real contract).
 *  3. **No env branch here.** This module is the *real-key* adapter only; the
 *     key-vs-no-key choice lives in {@link createExtractor} (extraction.ts).
 *
 * Two-tier validation contract:
 *  - **Structural** — a row that isn't an object or is missing a required field
 *    (`type`, `title`) is dropped; a whole response that isn't parseable JSON throws.
 *  - **Soft** — a well-formed row with an out-of-range enum (`remoteStatus`) is coerced
 *    to the safe catch-all and a concern is attached, but the row is kept (a job with a
 *    weird remote status is still a real job).
 */

import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { coerceStrategicCategory } from '../../engine/strategicVocabulary.js';
import { parseStrategicAnalysis } from '../../engine/strategicAnalysis.js';
import type { ExtractedOpportunity } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../../../.env') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

/**
 * Thrown when extraction *could not be determined* — a Gemini request failure or an
 * unparseable response — as opposed to a successful extraction that genuinely found no
 * opportunities (an empty array). The orchestrator's per-source isolation collects this so
 * the email persists nothing, the Cost Gate marker is never written, and it is retried.
 */
export class ExtractionError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message);
        this.name = 'ExtractionError';
        if (options?.cause !== undefined) this.cause = options.cause;
    }
}

/** The remote-status values the prompt asks for; anything else is soft-coerced to Unknown. */
const KNOWN_REMOTE_STATUSES = ['Remote', 'Hybrid', 'On-site'] as const;
const UNKNOWN_REMOTE_STATUS = 'Unknown';

/** A trimmed non-empty string, or undefined — for the optional identity fields. */
const optionalString = z.preprocess(
    (v) => (typeof v === 'string' && v.trim().length ? v.trim() : undefined),
    z.string().optional(),
);

/** The string members of an array (trimmed, non-empty), defaulting to []. */
const stringArray = z.preprocess(
    (v) =>
        Array.isArray(v)
            ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter((x) => x.length)
            : [],
    z.array(z.string()),
);

/** A direct URL string, or null — Gemini emits the literal "null" when absent. */
const nullableUrl = z.preprocess((v) => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t.length && t.toLowerCase() !== 'null' ? t : null;
}, z.string().nullable());

/**
 * Validates the untrusted *identity* fields of one Gemini row. Structural failures
 * (`type` not one of the three, or a JOB/BUSINESS row with a missing/blank `title`) raise a
 * ZodError — the caller drops the row. A `NOISE` row needs no title: the prompt returns a
 * lone `{type:"NOISE"}` for a digest with no roles, the orchestrator skips NOISE rows and
 * never reads their title, and rejecting it would drop every row and falsely fail the digest
 * (re-extracting the same newsletter every run). The `.transform` applies the soft
 * `remoteStatus` coercion, appending a concern rather than rejecting. The strategic block
 * (`strategicCategory`, `strategicAnalysis`) is validated separately in
 * {@link validateExtractedRow} because it reads the same flat object through the #2/#3 boundaries.
 */
export const ExtractedOpportunitySchema = z
    .object({
        type: z.preprocess(
            (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
            z.enum(['JOB', 'BUSINESS', 'NOISE']),
        ),
        title: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string()),
        company: optionalString,
        description: z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string()),
        industry: optionalString,
        location: optionalString,
        remoteStatus: optionalString,
        sourceUrl: nullableUrl,
        reasons: stringArray,
        concerns: stringArray,
    })
    .refine((row) => row.type === 'NOISE' || row.title.length > 0, {
        message: 'A JOB or BUSINESS row must have a non-empty title',
        path: ['title'],
    })
    .transform((row) => {
        if (
            row.remoteStatus &&
            !KNOWN_REMOTE_STATUSES.some((s) => s.toLowerCase() === row.remoteStatus!.toLowerCase())
        ) {
            return {
                ...row,
                remoteStatus: UNKNOWN_REMOTE_STATUS,
                concerns: [...row.concerns, `Unrecognised remote status — coerced to ${UNKNOWN_REMOTE_STATUS}`],
            };
        }
        return row;
    });

/**
 * Validate one untrusted Gemini row into an {@link ExtractedOpportunity}, or `null` to drop
 * it (structural failure). The strategic block degrades to null/empty via the #2/#3
 * boundaries; it never causes a drop.
 */
export const validateExtractedRow = (raw: unknown): ExtractedOpportunity | null => {
    const parsed = ExtractedOpportunitySchema.safeParse(raw);
    if (!parsed.success) return null;
    const d = parsed.data;
    // Spread the optional identity fields only when present: under exactOptionalPropertyTypes a
    // `field?: string` target rejects an explicit `undefined`, so omit the key instead (the same
    // idiom the orchestrator uses for industry/location).
    return {
        type: d.type,
        title: d.title,
        description: d.description,
        sourceUrl: d.sourceUrl,
        reasons: d.reasons,
        concerns: d.concerns,
        ...(d.company !== undefined ? { company: d.company } : {}),
        ...(d.industry !== undefined ? { industry: d.industry } : {}),
        ...(d.location !== undefined ? { location: d.location } : {}),
        ...(d.remoteStatus !== undefined ? { remoteStatus: d.remoteStatus } : {}),
        strategicCategory: coerceStrategicCategory((raw as { strategicCategory?: unknown })?.strategicCategory),
        strategicAnalysis: parseStrategicAnalysis(raw),
    };
};

/** The Gemini prompt — extraction + the #2/#3 strategic judgement, in one call. */
const buildPrompt = (text: string): string => `
    Analyze the following email content and extract ALL specific job opportunities or business opportunities (tenders/contracts).
    If the email is a digest, job alert, or listing, extract EVERY distinct role or opportunity mentioned.
    If no opportunities are found, return a single entry with type "NOISE".

    STRICT INDUSTRY CLASSIFICATION:
    You MUST classify each opportunity into EXACTLY ONE of the following high-level industries:
    - Healthcare & Life Sciences
    - Technology & Software
    - Financial Services
    - Retail & CPG
    - Industrial & Energy
    - Government & Public Sector
    - Professional Services
    - Real Estate & Hospitality
    - Marketing, Creative & Digital
    - Education
    - Logistics & Transportation
    - Non-Profit & Social Impact
    - Agriculture & Food
    - Legal
    - Other

    STRATEGIC CATEGORY:
    Classify each opportunity into EXACTLY ONE Strategic Category — what *kind* of role
    it is for someone building toward an agency delivery-visibility / resourcing
    consultancy:
    - STRATEGIC_FIT: directly compounds that goal (delivery leadership, PMO, delivery
      operations, resource/capacity management at a strategic level).
    - USEFUL_BRIDGE: an adjacent role that plausibly bridges toward that goal.
    - SEO_COMFORT_ZONE: an SEO / search / content role — familiar but does not advance
      the strategic goal.
    - RESOURCE_ADMIN_TRAP: resourcing/scheduling/coordination that is administrative and
      low-leverage despite sounding relevant.
    - GENERIC_OPS_UNCLEAR: generic operations, or too vague to place.
    - REJECT: clearly off-target or irrelevant.

    STRATEGIC ANALYSIS:
    For each opportunity, judge how it serves someone building toward an agency
    delivery-visibility / resourcing-insights consultancy. Score each of these five
    Component Scores from 0 (none) to 100 (excellent):
    - consultancyAlignment: how directly the role compounds toward that consultancy goal.
    - deliveryVisibility: how much ownership/visibility it gives over delivery and
      resource/capacity management.
    - commercialProximity: proximity to commercial decisions, P&L, or client/account
      ownership.
    - buyerEnvironmentFit: how well it sits inside the kind of buyer environment that
      consultancy would later sell into.
    - seniorityScope: the seniority and breadth of remit.
    (Do NOT score practical/location/salary fit — that is computed separately.)
    Also judge two risks, each "LOW" | "MEDIUM" | "HIGH":
    - resourceAdminTrapRisk: risk this is low-leverage resourcing/scheduling/coordination
      admin dressed up as strategic.
    - seoComfortZoneRisk: risk this is a familiar SEO/search/content comfort-zone role
      that does not advance the strategic goal.
    And provide the narrative:
    - realRoleInterpretation: what the job actually is underneath the title.
    - consultancyRelevance: how (or whether) it builds toward the consultancy.
    - strategicReasons: reasons it is strategically valuable.
    - strategicConcerns: strategic concerns or red flags.
    - recommendedScreeningQuestions: questions to ask to verify the real role.

    For each JOB or BUSINESS opportunity:
    1. Extract the title, company, and precise location.
    2. Assign the single most relevant "industry" from the list above.
    3. Determine Remote Status (Remote, Hybrid, or On-site) based on text clues.
    4. Extract the direct link (URL) to the position if available in the text.
    5. Provide a list of reasons why it qualifies and any concerns.
    6. Assign the single best "strategicCategory" from the six values above.
    7. Produce the full STRATEGIC ANALYSIS fields described above.

    Return the result EXACTLY as a JSON array of objects:
    [
      {
        "type": "JOB" | "BUSINESS" | "NOISE",
        "title": "Extracted Title",
        "company": "Extracted Company",
        "industry": "One of the valid industries listed above",
        "location": "City, Country (if known)",
        "remoteStatus": "Remote" | "Hybrid" | "On-site",
        "description": "Brief summarized description (max 100 words).",
        "sourceUrl": "Direct URL if found, otherwise null",
        "reasons": ["reason 1", "reason 2"],
        "concerns": ["concern 1", "concern 2"],
        "strategicCategory": "One of the six Strategic Category values above",
        "consultancyAlignment": 0,
        "deliveryVisibility": 0,
        "commercialProximity": 0,
        "buyerEnvironmentFit": 0,
        "seniorityScope": 0,
        "resourceAdminTrapRisk": "LOW" | "MEDIUM" | "HIGH",
        "seoComfortZoneRisk": "LOW" | "MEDIUM" | "HIGH",
        "realRoleInterpretation": "What the role actually is underneath the title.",
        "consultancyRelevance": "How it does or doesn't build toward the consultancy.",
        "strategicReasons": ["strategic reason 1"],
        "strategicConcerns": ["strategic concern 1"],
        "recommendedScreeningQuestions": ["question 1"]
      }
    ]

    Email Content:
    ${text}
  `;

/**
 * Parse + validate a raw Gemini response string into opportunities. Strips the ```json``` ``
 * fences, parses the JSON, and validates each row. Throws {@link ExtractionError} when the
 * *whole* response is unparseable JSON (a real failure, distinct from a validated empty
 * result); individual structurally-invalid rows are dropped and soft enum errors coerced.
 * Pure (no I/O) so it is unit-tested directly against canned model strings.
 */
export const parseGeminiResponse = (textResponse: string): ExtractedOpportunity[] => {
    let parsed: unknown;
    try {
        const jsonStr = textResponse.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(jsonStr);
    } catch (error) {
        throw new ExtractionError('Gemini returned unparseable JSON', { cause: error });
    }

    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const validated = rows
        .map(validateExtractedRow)
        .filter((r): r is ExtractedOpportunity => r !== null);

    const dropped = rows.length - validated.length;
    if (dropped > 0) {
        console.warn(
            `Extraction dropped ${dropped} structurally-invalid row(s) of ${rows.length} from a Gemini response.`,
        );
        // If the model returned rows but EVERY one was unusable, treat the whole extraction as a
        // failure: throw so the orchestrator leaves the digest unmarked and retries it. A response
        // we can salvage nothing from is far more likely a transient/prompt glitch worth another
        // attempt than N genuinely-malformed roles — and silently marking it complete would lose
        // the entire digest. A *partial* drop (some rows valid) is logged but does NOT fail the
        // digest: the valid rows persist, and re-extraction can't recover a row the model keeps
        // malforming — it would just re-pay every run (the reasoning that keeps a Pass-2 deep
        // failure non-blocking, #12). A genuinely empty response ([]) drops nothing and is not a
        // failure (a newsletter with no roles).
        if (validated.length === 0) {
            throw new ExtractionError(
                `Gemini returned ${rows.length} row(s) but none passed structural validation`,
            );
        }
    }

    return validated;
};

/**
 * Extract opportunities from raw text with Gemini, validated at the boundary. Throws
 * {@link ExtractionError} on a request or whole-response parse failure (a real failure,
 * distinct from a validated empty result). The caller (the Pass-1 GeminiExtractor and the
 * Pass-2 re-analysis) must only reach this when a key is configured.
 */
export const extractWithGemini = async (text: string): Promise<ExtractedOpportunity[]> => {
    if (!process.env.GEMINI_API_KEY) {
        throw new ExtractionError('GEMINI_API_KEY is not set');
    }

    let textResponse: string;
    try {
        const result = await model.generateContent(buildPrompt(text));
        const response = await result.response;
        textResponse = response.text();
    } catch (error) {
        throw new ExtractionError('Gemini request failed', { cause: error });
    }

    return parseGeminiResponse(textResponse);
};
