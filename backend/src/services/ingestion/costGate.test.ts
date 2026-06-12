import { describe, it, expect } from 'vitest';
import { dbCostGate } from './costGate.js';
import type { OpportunityRow } from './persist.js';

describe('dbCostGate.deepAlreadyDone', () => {
  it('reports done when the opportunity row already exists', () => {
    // Only identity matters to today's proxy; a minimal row stands in.
    const existing = { id: 1, canonicalUrl: 'gmail://abc#0' } as unknown as OpportunityRow;
    expect(dbCostGate.deepAlreadyDone(existing)).toBe(true);
  });

  it('reports not done when there is no existing row', () => {
    expect(dbCostGate.deepAlreadyDone(undefined)).toBe(false);
  });
});
