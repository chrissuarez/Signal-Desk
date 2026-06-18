import { describe, it, expect, vi, afterEach } from 'vitest';
import { parsePreferences, validatePreferences, DEFAULT_PREFERENCES } from './preferences.js';

/**
 * `parsePreferences` is the testable core of the validated `user_preferences` read path
 * (issue #15). It is exercised through its observable contract — given a stored value
 * (valid / missing / malformed), assert the returned `Preferences` and the warning log —
 * never by reaching into the zod schema. The three cases mirror `loadPreferences`'s
 * documented contract: valid row through unchanged, missing/invalid → defaults.
 */
describe('parsePreferences', () => {
    afterEach(() => vi.restoreAllMocks());

    it('passes a valid stored row through unchanged', () => {
        const stored = {
            keywords: ['delivery lead', 'consultant'],
            locations: ['Remote'],
            industryWeights: { agency: 20, gambling: -100 },
            locationWeights: { mars: -30 },
        };
        expect(parsePreferences(stored)).toEqual(stored);
    });

    it('keeps a valid row that omits the optional weight maps', () => {
        const stored = { keywords: ['engineer'], locations: ['London'] };
        expect(parsePreferences(stored)).toEqual(stored);
    });

    it('returns DEFAULT_PREFERENCES for a missing row, without warning', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(parsePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
        expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
        expect(warn).not.toHaveBeenCalled();
    });

    it('returns DEFAULT_PREFERENCES and warns for a malformed row', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        // keywords stored as a string instead of an array, weights with non-numeric values.
        const malformed = { keywords: 'engineer', locations: ['Remote'], industryWeights: { agency: 'high' } };
        expect(parsePreferences(malformed)).toEqual(DEFAULT_PREFERENCES);
        expect(warn).toHaveBeenCalledOnce();
    });

    it('DEFAULT_PREFERENCES has present-but-empty weight maps (intentional no-op)', () => {
        expect(DEFAULT_PREFERENCES.industryWeights).toEqual({});
        expect(DEFAULT_PREFERENCES.locationWeights).toEqual({});
    });
});

/**
 * `validatePreferences` is the testable core of the validated `user_preferences` *write*
 * path (issue #16). It shares the read path's schema but inverts the failure contract:
 * a valid payload is accepted and normalized; an invalid one is **rejected** (so the route
 * returns a 4xx) rather than falling back to defaults. The cases mirror that contract —
 * accept-and-normalize vs reject-with-reason.
 */
describe('validatePreferences', () => {
    it('accepts a valid payload and returns it normalized', () => {
        const payload = {
            keywords: ['delivery lead'],
            locations: ['Remote'],
            industryWeights: { agency: 20 },
            locationWeights: { mars: -30 },
        };
        const result = validatePreferences(payload);
        expect(result).toEqual({ ok: true, value: payload });
    });

    it('accepts a minimal payload that omits the optional weight maps', () => {
        const payload = { keywords: ['engineer'], locations: ['London'] };
        const result = validatePreferences(payload);
        expect(result).toEqual({ ok: true, value: payload });
    });

    it('strips unknown keys — incl. the dropped minSalary — so only the contracted shape persists', () => {
        const result = validatePreferences({
            keywords: ['engineer'],
            locations: ['London'],
            minSalary: 90000, // phantom field: in no scoring path, dropped from the contract (#16)
            rogueField: 'ignored',
        });
        expect(result).toEqual({ ok: true, value: { keywords: ['engineer'], locations: ['London'] } });
    });

    it('rejects a malformed payload instead of defaulting', () => {
        // keywords as a string, weights with a non-numeric value — the read path would
        // degrade these to defaults; the write path must refuse them.
        const result = validatePreferences({
            keywords: 'engineer',
            locations: ['Remote'],
            industryWeights: { agency: 'high' },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBeTruthy();
    });

    it('rejects a missing payload (null / undefined)', () => {
        expect(validatePreferences(undefined).ok).toBe(false);
        expect(validatePreferences(null).ok).toBe(false);
    });
});
