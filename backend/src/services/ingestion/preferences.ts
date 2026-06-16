/**
 * Typed, validated read path for the `user_preferences` settings bag (issue #15).
 *
 * The generic `settings` table is a key→jsonb bag, so `user_preferences` comes back as
 * untyped JSON. Before #15 the single reader cast it `as IngestionPreferences` straight
 * into the scoring engine — an unchecked boundary where a malformed stored row would flow
 * in unguarded. This module is the guardrail at that boundary: a zod schema mirroring the
 * named `Preferences` type, parsed on read.
 *
 * Failure contract = **validate-then-fall-back**, deliberately NOT the Extraction seam's
 * fail≠empty (#14). A bad or missing preferences row must never halt ingestion — scoring
 * config has a safe default, an extraction failure does not — so `parsePreferences` always
 * returns usable `Preferences`: a missing/invalid row degrades to `DEFAULT_PREFERENCES`
 * (logging the invalid case), never throws, never returns undefined.
 */

import { z } from 'zod';
import type { Preferences } from '../../engine/scoring.js';

/**
 * "No tuning configured", stated explicitly. The weight maps are **present but empty**
 * (`{}`), not omitted: this preserves today's no-row no-op (the weight-scoring branches in
 * `calculateFitScore` iterate an empty map → no points) while making it an intentional,
 * documented default rather than an accident of an incomplete literal — the single
 * signed-off behaviour delta of this refactor. Slice #5 seeds real Guardrail/weight values.
 */
export const DEFAULT_PREFERENCES: Preferences = {
    keywords: ['Software Engineer', 'AI', 'Fullstack', 'TypeScript'],
    locations: ['Remote', 'London'],
    industryWeights: {},
    locationWeights: {},
};

/**
 * Mirrors the `Preferences` type. `keywords`/`locations` are the core contract
 * `calculateFitScore` always iterates, so they are required string arrays; the weight maps
 * and `minSalary` are optional tuning. Unknown keys are stripped (zod default), so an extra
 * field written by the frontend's separate write path never fails validation here.
 */
const preferencesSchema = z.object({
    keywords: z.array(z.string()),
    locations: z.array(z.string()),
    locationWeights: z.record(z.string(), z.number()).optional(),
    industryWeights: z.record(z.string(), z.number()).optional(),
    minSalary: z.number().optional(),
});

/**
 * Validate a stored `user_preferences` jsonb value against the `Preferences` contract.
 * Pure: a valid row parses through unchanged; a missing (`null`/`undefined`) or malformed
 * row returns `DEFAULT_PREFERENCES` and logs a warning. The db read lives in
 * `dbLoadPreferences`; this is the testable core.
 */
export const parsePreferences = (value: unknown): Preferences => {
    const result = preferencesSchema.safeParse(value);
    if (!result.success) {
        if (value != null) {
            console.warn(
                '[preferences] Invalid user_preferences row; falling back to defaults:',
                result.error.message,
            );
        }
        return DEFAULT_PREFERENCES;
    }
    // Conditional spreads keep optional keys absent rather than present-as-undefined, which
    // `exactOptionalPropertyTypes` requires for assignment to `Preferences`.
    const { keywords, locations, locationWeights, industryWeights, minSalary } = result.data;
    return {
        keywords,
        locations,
        ...(locationWeights !== undefined && { locationWeights }),
        ...(industryWeights !== undefined && { industryWeights }),
        ...(minSalary !== undefined && { minSalary }),
    };
};
