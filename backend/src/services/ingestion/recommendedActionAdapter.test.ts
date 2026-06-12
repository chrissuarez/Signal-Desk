import { describe, it, expect } from 'vitest';
import { scoreToSignals } from './recommendedActionAdapter.js';
import { decideRecommendedAction } from '../../engine/recommendedActionRouting.js';

describe('scoreToSignals (degenerate adapter)', () => {
  it('lifts a score onto degenerate signals (null category, LOW risks)', () => {
    expect(scoreToSignals(73)).toEqual({
      strategicScore: 73,
      category: null,
      seoComfortZoneRisk: 'LOW',
      resourceAdminTrapRisk: 'LOW',
    });
  });

  it('drives the live null-category fallback when fed to the decision module', () => {
    expect(decideRecommendedAction(scoreToSignals(80))).toBe('ALERT');
    expect(decideRecommendedAction(scoreToSignals(79))).toBe('STORE');
    expect(decideRecommendedAction(scoreToSignals(0))).toBe('STORE');
  });
});
