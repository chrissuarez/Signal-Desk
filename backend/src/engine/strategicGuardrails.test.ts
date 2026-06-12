import { describe, it, expect } from 'vitest';
import { applyScoreGuardrails, DEFAULT_GUARDRAILS, type GuardrailSettings } from './strategicGuardrails.js';

const settings: GuardrailSettings = {
  excludedIndustries: ['Gambling', 'Adult'],
  penaltyKeywords: ['link building', 'data entry'],
  tier1Keywords: ['delivery lead', 'consultancy'],
};

describe('applyScoreGuardrails', () => {
  it('vetoes an excluded industry: score → 0, forces REJECT, adds a concern', () => {
    const result = applyScoreGuardrails(
      { score: 90, industry: 'Online Gambling', title: 'Delivery Lead', description: 'Great role' },
      settings,
    );
    expect(result.score).toBe(0);
    expect(result.forcedCategory).toBe('REJECT');
    expect(result.concerns[0]).toContain('Gambling');
  });

  it('keeps a null score null on an industry veto (never fabricates a number), still forces REJECT', () => {
    const result = applyScoreGuardrails(
      { score: null, industry: 'Adult Entertainment', title: 'X', description: 'Y' },
      settings,
    );
    expect(result.score).toBeNull();
    expect(result.forcedCategory).toBe('REJECT');
  });

  it('caps the score when a penalty keyword hits, with a concern', () => {
    const result = applyScoreGuardrails(
      { score: 85, title: 'SEO Specialist', description: 'Mostly link building all day' },
      settings,
    );
    expect(result.score).toBe(40); // capped to penaltyCap
    expect(result.forcedCategory).toBeUndefined();
    expect(result.concerns[0]).toContain('link building');
  });

  it('does not raise a score that is already above the penalty cap... it lowers it', () => {
    // sanity: a penalty only ever caps downward, never raises
    const result = applyScoreGuardrails(
      { score: 30, title: 'Data Entry Clerk', description: 'data entry' },
      settings,
    );
    expect(result.score).toBe(30); // already below cap → unchanged, no concern
    expect(result.concerns).toEqual([]);
  });

  it('raises a floor when a Tier-1 keyword hits', () => {
    const result = applyScoreGuardrails(
      { score: 45, title: 'Delivery Lead', description: 'Run the consultancy delivery function' },
      settings,
    );
    expect(result.score).toBe(60); // floored up to tier1Floor
  });

  it('lets a penalty win a direct conflict with a Tier-1 floor (conservative)', () => {
    // both hit: floor to 60 then cap to 40 → 40
    const result = applyScoreGuardrails(
      { score: 50, title: 'Delivery Lead', description: 'consultancy work, but mostly link building' },
      settings,
    );
    expect(result.score).toBe(40);
  });

  it('is a no-op when nothing matches', () => {
    const result = applyScoreGuardrails(
      { score: 72, industry: 'SaaS', title: 'Engineering Manager', description: 'Lead a platform team' },
      settings,
    );
    expect(result.score).toBe(72);
    expect(result.forcedCategory).toBeUndefined();
    expect(result.concerns).toEqual([]);
  });
});

describe('DEFAULT_GUARDRAILS', () => {
  it('seeds non-empty brief defaults for all three input lists', () => {
    expect(DEFAULT_GUARDRAILS.excludedIndustries.length).toBeGreaterThan(0);
    expect(DEFAULT_GUARDRAILS.penaltyKeywords.length).toBeGreaterThan(0);
    expect(DEFAULT_GUARDRAILS.tier1Keywords.length).toBeGreaterThan(0);
  });

  it('drives applyScoreGuardrails end to end (a brief tier-1 keyword floors the score)', () => {
    const result = applyScoreGuardrails(
      { score: 30, title: 'Delivery Lead', description: 'own delivery' },
      DEFAULT_GUARDRAILS,
    );
    expect(result.score).toBe(60);
  });
});
