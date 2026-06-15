import { describe, it, expect } from 'vitest';
import {
  strategicPreFilter,
  legacyPreFilter,
  ROLE_FAMILY_TITLES,
  type StrategicPreFilterConfig,
} from './strategicPreFilter.js';

// Mirrors the production wiring: the gate's configurable inputs come from the
// `strategic_guardrails` settings (Tier-1 keywords + excluded industries).
const CONFIG: StrategicPreFilterConfig = {
  tier1Keywords: ['delivery lead', 'resource management', 'consultancy'],
  excludedIndustries: ['Gambling', 'Adult Entertainment'],
};

describe('strategicPreFilter (#6, ADR-0004)', () => {
  it('passes a strategic-titled role that has no SEO keywords at all', () => {
    // The role ADR-0004 was starving: a clear target title, zero SEO terms, so the legacy
    // fitScore gate would never have admitted it.
    expect(
      strategicPreFilter({ title: 'Delivery Operations Lead', description: 'Own delivery across teams.' }, CONFIG),
    ).toBe(true);
  });

  it('passes on a Tier-1 keyword appearing only in the snippet', () => {
    expect(
      strategicPreFilter({ title: 'Senior Manager', description: 'A resource management remit.' }, CONFIG),
    ).toBe(true);
  });

  it('passes on a role-family title even when it is not in the configured keywords', () => {
    // 'engagement manager' is a hardcoded role-family title, not in CONFIG.tier1Keywords.
    expect(ROLE_FAMILY_TITLES).toContain('engagement manager');
    expect(strategicPreFilter({ title: 'Engagement Manager', description: 'Client delivery.' }, CONFIG)).toBe(true);
  });

  it('rejects a role with no strategic keyword or role-family title (high recall, not no recall)', () => {
    expect(strategicPreFilter({ title: 'SEO Specialist', description: 'Link building and keyword work.' }, CONFIG)).toBe(false);
    expect(strategicPreFilter({ title: 'Junior Clerk', description: 'Office filing.' }, CONFIG)).toBe(false);
  });

  it('vetoes an excluded industry even when a strategic keyword is also present', () => {
    // The hard-exclude Guardrail wins: a delivery-lead role at a gambling firm must not reach
    // an expensive Pass-2 analysis.
    expect(
      strategicPreFilter(
        { title: 'Delivery Lead', description: 'Lead delivery at a Gambling operator.' },
        CONFIG,
      ),
    ).toBe(false);
  });

  it('matches case-insensitively and ignores surrounding text', () => {
    expect(strategicPreFilter({ title: 'HEAD OF DELIVERY', description: '' }, CONFIG)).toBe(true);
  });

  it('does not pass on a blank/whitespace-only configured keyword', () => {
    // A " " needle is a substring of every haystack — it must never pass the gate.
    const blankCfg: StrategicPreFilterConfig = { tier1Keywords: [' ', ''], excludedIndustries: [] };
    expect(strategicPreFilter({ title: 'SEO Specialist', description: 'keyword work' }, blankCfg)).toBe(false);
  });

  it('ignores the Fit Score entirely — it is not even an input', () => {
    // A high-Fit SEO role (no strategic signal) is rejected; a zero-Fit strategic role passes.
    // Proves the gate no longer reads the Fit Score the way the legacy gate did.
    expect(strategicPreFilter({ title: 'SEO Lead', description: 'On-page SEO and link building.' }, CONFIG)).toBe(false);
    expect(strategicPreFilter({ title: 'Resource Management Lead', description: '' }, CONFIG)).toBe(true);
  });
});

// Retained transiently until the orchestrator is rewired to strategicPreFilter (same commit).
describe('legacyPreFilter (to be removed)', () => {
  it('passes opportunities scoring above 60', () => {
    expect(legacyPreFilter({ fitScore: 61 })).toBe(true);
  });
  it('rejects opportunities at or below the 60 threshold', () => {
    expect(legacyPreFilter({ fitScore: 60 })).toBe(false);
  });
});
