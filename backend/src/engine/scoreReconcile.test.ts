import { describe, it, expect } from 'vitest';
import { legacyScoreReconcile } from './scoreReconcile.js';

describe('legacyScoreReconcile', () => {
  it('maps the calculateFitScore result onto a ScoreResult', () => {
    const result = legacyScoreReconcile({
      title: 'Software Engineer',
      description: 'A role with no matching signals.',
      preferences: { keywords: [], locations: [] },
    });

    expect(result.fitScore).toBe(50);
    expect(result.reasons).toEqual([]);
    expect(result.concerns).toEqual([]);
  });

  it('surfaces preferred-keyword reasons and the raised score', () => {
    const result = legacyScoreReconcile({
      title: 'Senior TypeScript Engineer',
      description: 'Build things.',
      preferences: { keywords: ['TypeScript'], locations: [] },
    });

    expect(result.fitScore).toBe(60); // 50 midpoint + 10 title keyword
    expect(result.reasons).toContain('Title contains preferred keyword: TypeScript');
  });
});
