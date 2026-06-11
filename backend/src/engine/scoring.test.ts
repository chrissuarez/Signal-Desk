import { describe, it, expect } from 'vitest';
import { calculateFitScore } from './scoring';

// Smoke test: establishes the test harness (first test in the repo).
describe('calculateFitScore', () => {
  it('returns the midpoint score when no preferences match', () => {
    const result = calculateFitScore({
      title: 'Software Engineer',
      description: 'A role with no matching signals.',
      preferences: { keywords: [], locations: [] },
    });

    expect(result.score).toBe(50);
    expect(result.reasons).toEqual([]);
    expect(result.concerns).toEqual([]);
  });
});
