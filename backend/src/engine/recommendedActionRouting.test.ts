import { describe, it, expect } from 'vitest';
import {
  decideRecommendedAction,
  type RecommendedActionSignals,
} from './recommendedActionRouting.js';
import type { StrategicCategory } from './strategicVocabulary.js';

/** Build signals with no-risk defaults; override per case. */
const signals = (over: Partial<RecommendedActionSignals> & { strategicScore: number }): RecommendedActionSignals => ({
  category: null,
  seoComfortZoneRisk: 'LOW',
  resourceAdminTrapRisk: 'LOW',
  ...over,
});

describe('decideRecommendedAction (ADR-0005 mapping)', () => {
  // The only arm that fires LIVE in #13: the legacy fitScore adapter passes category: null.
  describe('null-category fallback (live)', () => {
    it('alerts at score 80 and above', () => {
      expect(decideRecommendedAction(signals({ strategicScore: 80 }))).toBe('ALERT');
      expect(decideRecommendedAction(signals({ strategicScore: 100 }))).toBe('ALERT');
    });

    it('stores everything below 80 (no longer DISMISSED/hidden)', () => {
      expect(decideRecommendedAction(signals({ strategicScore: 79 }))).toBe('STORE');
      expect(decideRecommendedAction(signals({ strategicScore: 39 }))).toBe('STORE');
      expect(decideRecommendedAction(signals({ strategicScore: 0 }))).toBe('STORE');
    });
  });

  // The category arms below are DORMANT until the real category adapter lands (#7b),
  // but are implemented and proven now so that #7b is a safe adapter-only swap.
  describe('confirmed-bad categories suppress', () => {
    it('suppresses RESOURCE_ADMIN_TRAP regardless of score', () => {
      expect(decideRecommendedAction(signals({ strategicScore: 95, category: 'RESOURCE_ADMIN_TRAP' }))).toBe('SUPPRESS');
    });
    it('suppresses REJECT regardless of score', () => {
      expect(decideRecommendedAction(signals({ strategicScore: 95, category: 'REJECT' }))).toBe('SUPPRESS');
    });
  });

  describe('stored categories', () => {
    it('stores SEO_COMFORT_ZONE even at a high score', () => {
      expect(decideRecommendedAction(signals({ strategicScore: 90, category: 'SEO_COMFORT_ZONE' }))).toBe('STORE');
    });
    it('stores (not suppresses) on a HIGH trap-risk flag with a promising category', () => {
      expect(decideRecommendedAction(signals({ strategicScore: 90, category: 'STRATEGIC_FIT', resourceAdminTrapRisk: 'HIGH' }))).toBe('STORE');
    });
    it('stores a low score even for an otherwise-promising category', () => {
      expect(decideRecommendedAction(signals({ strategicScore: 30, category: 'STRATEGIC_FIT' }))).toBe('STORE');
      expect(decideRecommendedAction(signals({ strategicScore: 30, category: 'USEFUL_BRIDGE' }))).toBe('STORE');
    });
  });

  describe('top-of-funnel alerts', () => {
    it('alerts a STRATEGIC_FIT with no HIGH risk', () => {
      expect(decideRecommendedAction(signals({ strategicScore: 75, category: 'STRATEGIC_FIT' }))).toBe('ALERT');
    });
    it('alerts a high-scoring USEFUL_BRIDGE with no HIGH risk', () => {
      expect(decideRecommendedAction(signals({ strategicScore: 85, category: 'USEFUL_BRIDGE' }))).toBe('ALERT');
    });
    it('does not alert a STRATEGIC_FIT when an SEO risk flag is HIGH (falls back to STORE)', () => {
      expect(decideRecommendedAction(signals({ strategicScore: 90, category: 'STRATEGIC_FIT', seoComfortZoneRisk: 'HIGH' }))).toBe('STORE');
    });
  });

  describe('digest arms', () => {
    it('digests a weaker (sub-80) USEFUL_BRIDGE', () => {
      expect(decideRecommendedAction(signals({ strategicScore: 60, category: 'USEFUL_BRIDGE' }))).toBe('DIGEST');
    });
    it('digests an ambiguous GENERIC_OPS_UNCLEAR above the low-score floor', () => {
      expect(decideRecommendedAction(signals({ strategicScore: 60, category: 'GENERIC_OPS_UNCLEAR' }))).toBe('DIGEST');
    });
    it('stores a low-scoring GENERIC_OPS_UNCLEAR', () => {
      expect(decideRecommendedAction(signals({ strategicScore: 20, category: 'GENERIC_OPS_UNCLEAR' }))).toBe('STORE');
    });
  });

  it('covers every category label', () => {
    const all: StrategicCategory[] = ['STRATEGIC_FIT', 'USEFUL_BRIDGE', 'SEO_COMFORT_ZONE', 'RESOURCE_ADMIN_TRAP', 'GENERIC_OPS_UNCLEAR', 'REJECT'];
    for (const category of all) {
      expect(() => decideRecommendedAction(signals({ strategicScore: 70, category }))).not.toThrow();
    }
  });
});
