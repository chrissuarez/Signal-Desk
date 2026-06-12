import { describe, it, expect } from 'vitest';
import { parseStrategicAnalysis, EMPTY_STRATEGIC_ANALYSIS } from './strategicAnalysis.js';

const fullRaw = {
  consultancyAlignment: 80,
  deliveryVisibility: 65,
  commercialProximity: 50,
  buyerEnvironmentFit: 40,
  seniorityScope: 70,
  resourceAdminTrapRisk: 'LOW',
  seoComfortZoneRisk: 'MEDIUM',
  realRoleInterpretation: 'Really a delivery-ops leadership role.',
  consultancyRelevance: 'Builds the resourcing-insights muscle directly.',
  strategicReasons: ['Owns delivery visibility', 'Senior scope'],
  strategicConcerns: ['Light on commercial exposure'],
  recommendedScreeningQuestions: ['Who owns capacity planning today?'],
};

describe('parseStrategicAnalysis', () => {
  it('passes a well-formed strategic block through intact', () => {
    expect(parseStrategicAnalysis(fullRaw)).toEqual(fullRaw);
  });

  it('clamps component scores into 0–100 and rounds', () => {
    const result = parseStrategicAnalysis({ ...fullRaw, consultancyAlignment: 120, seniorityScope: -5, deliveryVisibility: 66.7 });
    expect(result.consultancyAlignment).toBe(100);
    expect(result.seniorityScope).toBe(0);
    expect(result.deliveryVisibility).toBe(67);
  });

  it('coerces numeric-string scores and nulls non-numeric ones', () => {
    const result = parseStrategicAnalysis({ ...fullRaw, consultancyAlignment: '85', commercialProximity: 'high' });
    expect(result.consultancyAlignment).toBe(85);
    expect(result.commercialProximity).toBeNull();
  });

  it('nulls blank/whitespace-only score strings rather than scoring them 0', () => {
    const result = parseStrategicAnalysis({ ...fullRaw, consultancyAlignment: '', commercialProximity: '   ' });
    expect(result.consultancyAlignment).toBeNull();
    expect(result.commercialProximity).toBeNull();
  });

  it('uppercases known risk levels and nulls unknown ones', () => {
    const result = parseStrategicAnalysis({ ...fullRaw, resourceAdminTrapRisk: 'high', seoComfortZoneRisk: 'severe' });
    expect(result.resourceAdminTrapRisk).toBe('HIGH');
    expect(result.seoComfortZoneRisk).toBeNull();
  });

  it('filters non-string array members and trims', () => {
    const result = parseStrategicAnalysis({ ...fullRaw, strategicReasons: ['  keep me  ', 42, null, ''] });
    expect(result.strategicReasons).toEqual(['keep me']);
  });

  it('defaults missing fields to null scores/narratives and empty arrays', () => {
    const result = parseStrategicAnalysis({ consultancyAlignment: 80 });
    expect(result.consultancyAlignment).toBe(80);
    expect(result.deliveryVisibility).toBeNull();
    expect(result.resourceAdminTrapRisk).toBeNull();
    expect(result.realRoleInterpretation).toBeNull();
    expect(result.strategicReasons).toEqual([]);
  });

  it('returns the empty analysis for non-object input rather than throwing', () => {
    expect(parseStrategicAnalysis(null)).toEqual(EMPTY_STRATEGIC_ANALYSIS);
    expect(parseStrategicAnalysis(undefined)).toEqual(EMPTY_STRATEGIC_ANALYSIS);
    expect(parseStrategicAnalysis('nope')).toEqual(EMPTY_STRATEGIC_ANALYSIS);
    expect(parseStrategicAnalysis([1, 2, 3])).toEqual(EMPTY_STRATEGIC_ANALYSIS);
  });
});
