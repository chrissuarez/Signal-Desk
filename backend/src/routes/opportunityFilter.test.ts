import { describe, it, expect } from 'vitest';
import { parseOpportunityFilter } from './opportunityFilter.js';

describe('parseOpportunityFilter', () => {
  it('returns an empty, unfiltered shape when nothing is supplied', () => {
    expect(parseOpportunityFilter(undefined, undefined)).toEqual({
      categories: [],
      actions: [],
      hasFilter: false,
    });
  });

  it('parses a single category tab (Strategic Fit)', () => {
    const f = parseOpportunityFilter('STRATEGIC_FIT', undefined);
    expect(f).toEqual({ categories: ['STRATEGIC_FIT'], actions: [], hasFilter: true });
  });

  it('parses a comma-separated category list (Traps-Rejects)', () => {
    const f = parseOpportunityFilter('RESOURCE_ADMIN_TRAP,REJECT,SEO_COMFORT_ZONE', undefined);
    expect(f.categories).toEqual(['RESOURCE_ADMIN_TRAP', 'REJECT', 'SEO_COMFORT_ZONE']);
    expect(f.actions).toEqual([]);
    expect(f.hasFilter).toBe(true);
  });

  it('parses category AND action together (Needs Review = ambiguous OR digest)', () => {
    const f = parseOpportunityFilter('GENERIC_OPS_UNCLEAR', 'DIGEST');
    expect(f).toEqual({
      categories: ['GENERIC_OPS_UNCLEAR'],
      actions: ['DIGEST'],
      hasFilter: true,
    });
  });

  it('is tolerant of whitespace and casing', () => {
    const f = parseOpportunityFilter(' strategic_fit , useful_bridge ', ' alert ');
    expect(f.categories).toEqual(['STRATEGIC_FIT', 'USEFUL_BRIDGE']);
    expect(f.actions).toEqual(['ALERT']);
  });

  it('drops unknown tokens without erroring or widening the query', () => {
    const f = parseOpportunityFilter('STRATEGIC_FIT,NONSENSE,', 'DELETE_EVERYTHING');
    expect(f.categories).toEqual(['STRATEGIC_FIT']);
    expect(f.actions).toEqual([]);
    // A request made only of junk is treated as no filter at all (default view applies).
    expect(parseOpportunityFilter('JUNK', 'JUNK').hasFilter).toBe(false);
  });

  it('de-duplicates repeated tokens', () => {
    const f = parseOpportunityFilter('REJECT,REJECT,reject', undefined);
    expect(f.categories).toEqual(['REJECT']);
  });

  it('ignores non-string inputs (e.g. repeated query params arriving as arrays)', () => {
    const f = parseOpportunityFilter(['STRATEGIC_FIT'], { weird: true });
    expect(f).toEqual({ categories: [], actions: [], hasFilter: false });
  });
});
