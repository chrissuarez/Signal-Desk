import { describe, it, expect } from 'vitest';
import { reconciledToSignals } from './recommendedActionAdapter.js';
import { decideRecommendedAction } from '../../engine/recommendedActionRouting.js';

describe('reconciledToSignals', () => {
  it('passes the reconciled category + risks through, coercing null score/risks to 0/LOW', () => {
    expect(
      reconciledToSignals({ strategicScore: 73, category: 'STRATEGIC_FIT', seoComfortZoneRisk: 'MEDIUM', resourceAdminTrapRisk: 'HIGH' }),
    ).toEqual({
      strategicScore: 73,
      category: 'STRATEGIC_FIT',
      seoComfortZoneRisk: 'MEDIUM',
      resourceAdminTrapRisk: 'HIGH',
    });
    expect(
      reconciledToSignals({ strategicScore: null, category: null, seoComfortZoneRisk: null, resourceAdminTrapRisk: null }),
    ).toEqual({
      strategicScore: 0, // un-scored never alerts
      category: null,
      seoComfortZoneRisk: 'LOW',
      resourceAdminTrapRisk: 'LOW',
    });
  });

  it('still drives the score-only fallback when the reconciled category is null', () => {
    const sig = (score: number) => reconciledToSignals({ strategicScore: score, category: null, seoComfortZoneRisk: null, resourceAdminTrapRisk: null });
    expect(decideRecommendedAction(sig(80))).toBe('ALERT');
    expect(decideRecommendedAction(sig(79))).toBe('STORE');
    expect(decideRecommendedAction(sig(0))).toBe('STORE');
  });

  it('lights up the category arms: a confirmed-bad category never alerts on a high score', () => {
    const highScoreBad = (category: 'RESOURCE_ADMIN_TRAP' | 'REJECT' | 'SEO_COMFORT_ZONE') =>
      reconciledToSignals({ strategicScore: 95, category, seoComfortZoneRisk: 'LOW', resourceAdminTrapRisk: 'LOW' });
    expect(decideRecommendedAction(highScoreBad('RESOURCE_ADMIN_TRAP'))).toBe('SUPPRESS');
    expect(decideRecommendedAction(highScoreBad('REJECT'))).toBe('SUPPRESS');
    expect(decideRecommendedAction(highScoreBad('SEO_COMFORT_ZONE'))).toBe('STORE');
  });
});
