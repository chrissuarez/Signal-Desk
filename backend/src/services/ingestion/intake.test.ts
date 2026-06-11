import { describe, it, expect } from 'vitest';
import { parseHeaderValue } from './intake.js';

describe('parseHeaderValue', () => {
  const headers = [
    { name: 'Subject', value: 'Daily Job Alerts' },
    { name: 'From', value: 'jobs@example.com' },
  ];

  it('returns the matching header value', () => {
    expect(parseHeaderValue(headers, 'Subject', 'No Subject')).toBe('Daily Job Alerts');
    expect(parseHeaderValue(headers, 'From', 'Unknown')).toBe('jobs@example.com');
  });

  it('falls back when the header is absent', () => {
    expect(parseHeaderValue(headers, 'Cc', 'No Cc')).toBe('No Cc');
  });

  it('falls back when headers are undefined', () => {
    expect(parseHeaderValue(undefined, 'Subject', 'No Subject')).toBe('No Subject');
  });

  it('falls back when the header value is empty', () => {
    expect(parseHeaderValue([{ name: 'Subject', value: '' }], 'Subject', 'No Subject')).toBe('No Subject');
  });
});
