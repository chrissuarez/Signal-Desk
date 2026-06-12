import { describe, it, expect } from 'vitest';
import { legacyPreFilter } from './strategicPreFilter.js';

describe('legacyPreFilter', () => {
  it('passes opportunities scoring above 60', () => {
    expect(legacyPreFilter({ fitScore: 61 })).toBe(true);
    expect(legacyPreFilter({ fitScore: 100 })).toBe(true);
  });

  it('rejects opportunities at or below the 60 threshold', () => {
    expect(legacyPreFilter({ fitScore: 60 })).toBe(false);
    expect(legacyPreFilter({ fitScore: 40 })).toBe(false);
    expect(legacyPreFilter({ fitScore: 0 })).toBe(false);
  });
});
