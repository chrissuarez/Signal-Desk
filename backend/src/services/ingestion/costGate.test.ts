import { describe, it, expect } from 'vitest';
import { dbCostGate } from './costGate.js';
import type { OpportunityRow } from './persist.js';

describe('dbCostGate.deepAlreadyDone', () => {
  it('reports done when the existing row is already at DEEP analysis depth', () => {
    // #6: deep-done now keys on the real signal — the row was re-analysed on the full scrape.
    const deep = { id: 1, canonicalUrl: 'gmail://abc#0', analysisDepth: 'DEEP' } as unknown as OpportunityRow;
    expect(dbCostGate.deepAlreadyDone(deep)).toBe(true);
  });

  it('reports not done for a SHALLOW row, so a failed-scrape row can retry the deep pass', () => {
    const shallow = { id: 1, canonicalUrl: 'gmail://abc#0', analysisDepth: 'SHALLOW' } as unknown as OpportunityRow;
    expect(dbCostGate.deepAlreadyDone(shallow)).toBe(false);
  });

  it('reports not done for a legacy row with no recorded depth', () => {
    const legacy = { id: 1, canonicalUrl: 'gmail://abc#0', analysisDepth: null } as unknown as OpportunityRow;
    expect(dbCostGate.deepAlreadyDone(legacy)).toBe(false);
  });

  it('reports not done when there is no existing row', () => {
    expect(dbCostGate.deepAlreadyDone(undefined)).toBe(false);
  });
});
