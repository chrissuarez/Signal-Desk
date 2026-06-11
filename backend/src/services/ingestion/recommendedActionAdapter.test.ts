import { describe, it, expect } from 'vitest';
import { fitScoreToSignals } from './recommendedActionAdapter.js';
import { decideRecommendedAction } from '../../engine/recommendedActionRouting.js';

describe('fitScoreToSignals (legacy adapter)', () => {
  it('maps fitScore onto degenerate signals (null category, LOW risks)', () => {
    expect(fitScoreToSignals(73)).toEqual({
      strategicScore: 73,
      category: null,
      seoComfortZoneRisk: 'LOW',
      resourceAdminTrapRisk: 'LOW',
    });
  });

  it('drives the live null-category fallback when fed to the decision module', () => {
    expect(decideRecommendedAction(fitScoreToSignals(80))).toBe('ALERT');
    expect(decideRecommendedAction(fitScoreToSignals(79))).toBe('STORE');
    expect(decideRecommendedAction(fitScoreToSignals(0))).toBe('STORE');
  });
});
