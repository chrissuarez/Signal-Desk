import { describe, it, expect } from 'vitest';
import {
  computeStrategicScore,
  DEFAULT_STRATEGIC_WEIGHTS,
  type StrategicScoreInput,
} from './strategicScoring.js';

/** A fully-judged block: every component present, no risk flags. */
const base: StrategicScoreInput = {
  consultancyAlignment: 80,
  deliveryVisibility: 80,
  commercialProximity: 80,
  buyerEnvironmentFit: 80,
  seniorityScope: 80,
  practicalFit: 80,
  resourceAdminTrapRisk: null,
  seoComfortZoneRisk: null,
};

describe('computeStrategicScore', () => {
  it('averages a uniform block to that value', () => {
    expect(computeStrategicScore(base)).toBe(80);
  });

  it('weights the six components per ADR-0003 (30/20/15/15/10/10)', () => {
    // Only consultancyAlignment scores; with full weights summing to 100 its 100
    // contributes its weight (30) to the headline.
    const input = { ...base, consultancyAlignment: 100, deliveryVisibility: 0, commercialProximity: 0, buyerEnvironmentFit: 0, seniorityScope: 0, practicalFit: 0 };
    expect(computeStrategicScore(input)).toBe(30);
  });

  it('default weights sum to 100', () => {
    const total = Object.values(DEFAULT_STRATEGIC_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it('applies the full penalty at HIGH risk (SEO −20, trap −30)', () => {
    const allHundred = { ...base, consultancyAlignment: 100, deliveryVisibility: 100, commercialProximity: 100, buyerEnvironmentFit: 100, seniorityScope: 100, practicalFit: 100 };
    expect(computeStrategicScore({ ...allHundred, seoComfortZoneRisk: 'HIGH' })).toBe(80);
    expect(computeStrategicScore({ ...allHundred, resourceAdminTrapRisk: 'HIGH' })).toBe(70);
    expect(computeStrategicScore({ ...allHundred, seoComfortZoneRisk: 'HIGH', resourceAdminTrapRisk: 'HIGH' })).toBe(50);
  });

  it('halves the penalty at MEDIUM risk and charges nothing at LOW', () => {
    const allHundred = { ...base, consultancyAlignment: 100, deliveryVisibility: 100, commercialProximity: 100, buyerEnvironmentFit: 100, seniorityScope: 100, practicalFit: 100 };
    expect(computeStrategicScore({ ...allHundred, resourceAdminTrapRisk: 'MEDIUM' })).toBe(85); // 100 − 15
    expect(computeStrategicScore({ ...allHundred, seoComfortZoneRisk: 'MEDIUM' })).toBe(90); // 100 − 10
    expect(computeStrategicScore({ ...allHundred, resourceAdminTrapRisk: 'LOW', seoComfortZoneRisk: 'LOW' })).toBe(100); // no penalty
  });

  it('clamps a penalty-dominated score up to 0, never negative', () => {
    const weak = { ...base, consultancyAlignment: 10, deliveryVisibility: 10, commercialProximity: 10, buyerEnvironmentFit: 10, seniorityScope: 10, practicalFit: 10 };
    expect(computeStrategicScore({ ...weak, resourceAdminTrapRisk: 'HIGH' })).toBe(0); // 10 − 30 → clamp 0
  });

  it('renormalizes over present components, ignoring missing ones', () => {
    // Only consultancyAlignment judged: it alone defines the headline, not diluted by nulls.
    const input: StrategicScoreInput = {
      consultancyAlignment: 90,
      deliveryVisibility: null,
      commercialProximity: null,
      buyerEnvironmentFit: null,
      seniorityScope: null,
      practicalFit: null,
      resourceAdminTrapRisk: null,
      seoComfortZoneRisk: null,
    };
    expect(computeStrategicScore(input)).toBe(90);
  });

  it('weights present components against each other when only some are judged', () => {
    // consultancyAlignment (w30) = 100, practicalFit (w10) = 0, rest null →
    // (100·30 + 0·10) / (30 + 10) = 75.
    const input: StrategicScoreInput = {
      consultancyAlignment: 100,
      deliveryVisibility: null,
      commercialProximity: null,
      buyerEnvironmentFit: null,
      seniorityScope: null,
      practicalFit: 0,
      resourceAdminTrapRisk: null,
      seoComfortZoneRisk: null,
    };
    expect(computeStrategicScore(input)).toBe(75);
  });

  it('returns null when no component was judged (never a fake 0)', () => {
    const empty: StrategicScoreInput = {
      consultancyAlignment: null,
      deliveryVisibility: null,
      commercialProximity: null,
      buyerEnvironmentFit: null,
      seniorityScope: null,
      practicalFit: null,
      resourceAdminTrapRisk: 'HIGH',
      seoComfortZoneRisk: 'HIGH',
    };
    expect(computeStrategicScore(empty)).toBeNull();
  });

  it('rounds the headline to an integer', () => {
    // (80·30 + 65·20 + 50·15 + 40·15 + 70·10 + 60·10) / 100 = 63.5 → 64 (round half up).
    const input: StrategicScoreInput = {
      consultancyAlignment: 80,
      deliveryVisibility: 65,
      commercialProximity: 50,
      buyerEnvironmentFit: 40,
      seniorityScope: 70,
      practicalFit: 60,
      resourceAdminTrapRisk: null,
      seoComfortZoneRisk: null,
    };
    expect(computeStrategicScore(input)).toBe(64);
  });
});
