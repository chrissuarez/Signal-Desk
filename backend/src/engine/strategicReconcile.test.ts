import { describe, it, expect } from 'vitest';
import {
  reconcileStrategicCategory,
  DEFAULT_RECONCILE_CONFIG,
  type ReconcileInput,
} from './strategicReconcile.js';

/** A neutral base: a scored STRATEGIC_FIT with no risk flags and no ops signals. */
const base: ReconcileInput = {
  llmCategory: 'STRATEGIC_FIT',
  strategicScore: 80,
  resourceAdminTrapRisk: null,
  seoComfortZoneRisk: null,
  deliveryVisibility: null,
  commercialProximity: null,
};

describe('reconcileStrategicCategory', () => {
  it('forces RESOURCE_ADMIN_TRAP when trap risk is HIGH, overriding the LLM (precedence 1)', () => {
    const input = { ...base, llmCategory: 'STRATEGIC_FIT' as const, resourceAdminTrapRisk: 'HIGH' as const };
    expect(reconcileStrategicCategory(input)).toBe('RESOURCE_ADMIN_TRAP');
  });

  it('trap-force beats SEO-force when both risks are HIGH (precedence order)', () => {
    const input = { ...base, resourceAdminTrapRisk: 'HIGH' as const, seoComfortZoneRisk: 'HIGH' as const };
    expect(reconcileStrategicCategory(input)).toBe('RESOURCE_ADMIN_TRAP');
  });

  it('forces SEO_COMFORT_ZONE when SEO risk is HIGH without strong ops signals (precedence 2)', () => {
    const input = { ...base, llmCategory: 'USEFUL_BRIDGE' as const, seoComfortZoneRisk: 'HIGH' as const };
    expect(reconcileStrategicCategory(input)).toBe('SEO_COMFORT_ZONE');
  });

  it('does NOT force SEO_COMFORT_ZONE when a strong ops signal is present', () => {
    // deliveryVisibility 60 ≥ strongOpsSignalMin → the LLM category stands despite HIGH SEO.
    const input = { ...base, llmCategory: 'USEFUL_BRIDGE' as const, seoComfortZoneRisk: 'HIGH' as const, deliveryVisibility: 60 };
    expect(reconcileStrategicCategory(input)).toBe('USEFUL_BRIDGE');
  });

  it('treats a strong commercialProximity as an ops signal too', () => {
    const input = { ...base, llmCategory: 'USEFUL_BRIDGE' as const, seoComfortZoneRisk: 'HIGH' as const, commercialProximity: 75 };
    expect(reconcileStrategicCategory(input)).toBe('USEFUL_BRIDGE');
  });

  it('keeps STRATEGIC_FIT when the score backs it up (≥ 70)', () => {
    expect(reconcileStrategicCategory({ ...base, strategicScore: 70 })).toBe('STRATEGIC_FIT');
  });

  it('demotes STRATEGIC_FIT to USEFUL_BRIDGE when the score is below 70 (precedence 3)', () => {
    expect(reconcileStrategicCategory({ ...base, strategicScore: 69 })).toBe('USEFUL_BRIDGE');
  });

  it('demotes STRATEGIC_FIT when the score is null (un-scored never reads as a strategic fit)', () => {
    expect(reconcileStrategicCategory({ ...base, strategicScore: null })).toBe('USEFUL_BRIDGE');
  });

  it('passes a non-STRATEGIC_FIT category through unchanged when no force-rule fires', () => {
    const input = { ...base, llmCategory: 'GENERIC_OPS_UNCLEAR' as const, strategicScore: 20 };
    expect(reconcileStrategicCategory(input)).toBe('GENERIC_OPS_UNCLEAR');
  });

  it('leaves a null LLM category null when no force-rule fires', () => {
    expect(reconcileStrategicCategory({ ...base, llmCategory: null })).toBeNull();
  });

  it('respects a custom config (threshold + demotion target)', () => {
    const config = { ...DEFAULT_RECONCILE_CONFIG, strategicFitMinScore: 85, demotionTarget: 'REJECT' as const };
    expect(reconcileStrategicCategory({ ...base, strategicScore: 80 }, config)).toBe('REJECT');
  });
});
