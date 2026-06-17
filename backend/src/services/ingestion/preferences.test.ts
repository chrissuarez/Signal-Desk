import { describe, it, expect, vi, afterEach } from 'vitest';
import { parsePreferences, DEFAULT_PREFERENCES } from './preferences.js';

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
            minSalary: 90000,
        };
        expect(parsePreferences(stored)).toEqual(stored);
    });

    it('keeps a valid row that omits the optional weight maps and minSalary', () => {
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
