import { describe, it, expect } from 'vitest';
import {
  STRATEGIC_CATEGORIES,
  coerceStrategicCategory,
} from './strategicVocabulary.js';

describe('coerceStrategicCategory', () => {
  it('returns each known category unchanged', () => {
    for (const category of STRATEGIC_CATEGORIES) {
      expect(coerceStrategicCategory(category)).toBe(category);
    }
  });

  it('tolerates surrounding whitespace and lower casing', () => {
    expect(coerceStrategicCategory('  strategic_fit ')).toBe('STRATEGIC_FIT');
    expect(coerceStrategicCategory('Useful_Bridge')).toBe('USEFUL_BRIDGE');
  });

  it('maps unknown labels to null rather than throwing', () => {
    expect(coerceStrategicCategory('STRATEGIC_MAYBE')).toBeNull();
    expect(coerceStrategicCategory('')).toBeNull();
    expect(coerceStrategicCategory('   ')).toBeNull();
  });

  it('maps missing / non-string input to null', () => {
    expect(coerceStrategicCategory(null)).toBeNull();
    expect(coerceStrategicCategory(undefined)).toBeNull();
    expect(coerceStrategicCategory(42)).toBeNull();
    expect(coerceStrategicCategory({})).toBeNull();
  });
});
