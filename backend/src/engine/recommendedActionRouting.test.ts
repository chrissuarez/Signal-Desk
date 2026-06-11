import { describe, it, expect } from 'vitest';
import { legacyRoute } from './recommendedActionRouting.js';

describe('legacyRoute', () => {
  it('dismisses opportunities scoring below 40', () => {
    expect(legacyRoute({ fitScore: 39 })).toEqual({ status: 'DISMISSED', shouldAlert: false });
    expect(legacyRoute({ fitScore: 0 })).toEqual({ status: 'DISMISSED', shouldAlert: false });
  });

  it('marks opportunities NEW from 40 up', () => {
    expect(legacyRoute({ fitScore: 40 })).toEqual({ status: 'NEW', shouldAlert: false });
    expect(legacyRoute({ fitScore: 79 })).toEqual({ status: 'NEW', shouldAlert: false });
  });

  it('flags an alert at 80 and above', () => {
    expect(legacyRoute({ fitScore: 80 })).toEqual({ status: 'NEW', shouldAlert: true });
    expect(legacyRoute({ fitScore: 100 })).toEqual({ status: 'NEW', shouldAlert: true });
  });
});
