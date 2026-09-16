import { describe, it, expect } from 'vitest';
import { utcDay, utcMonth } from '../src/time';

describe('utcDay', () => {
  it('uses UTC, so the reset boundary does not move with the caller', () => {
    expect(utcDay(Date.parse('2026-07-15T23:59:59Z'))).toBe('2026-07-15');
    expect(utcDay(Date.parse('2026-07-16T00:00:00Z'))).toBe('2026-07-16');
  });

  it('rolls over month and year at the UTC boundary', () => {
    expect(utcDay(Date.parse('2026-01-31T23:59:59Z'))).toBe('2026-01-31');
    expect(utcDay(Date.parse('2026-02-01T00:00:00Z'))).toBe('2026-02-01');
    expect(utcDay(Date.parse('2026-12-31T23:59:59Z'))).toBe('2026-12-31');
    expect(utcDay(Date.parse('2027-01-01T00:00:00Z'))).toBe('2027-01-01');
  });

  it('handles a leap day', () => {
    expect(utcDay(Date.parse('2028-02-28T23:59:59Z'))).toBe('2028-02-28');
    expect(utcDay(Date.parse('2028-02-29T12:00:00Z'))).toBe('2028-02-29');
    expect(utcDay(Date.parse('2028-03-01T00:00:00Z'))).toBe('2028-03-01');
  });
});

describe('utcMonth', () => {
  it('rolls over at the UTC month boundary', () => {
    expect(utcMonth(Date.parse('2026-07-31T23:59:59Z'))).toBe('2026-07');
    expect(utcMonth(Date.parse('2026-08-01T00:00:00Z'))).toBe('2026-08');
    expect(utcMonth(Date.parse('2026-12-31T23:59:59Z'))).toBe('2026-12');
    expect(utcMonth(Date.parse('2027-01-01T00:00:00Z'))).toBe('2027-01');
  });

  it('treats a leap day as an ordinary February day', () => {
    expect(utcMonth(Date.parse('2028-02-29T12:00:00Z'))).toBe('2028-02');
    expect(utcMonth(Date.parse('2028-03-01T00:00:00Z'))).toBe('2028-03');
  });

  it('is UTC regardless of the local offset', () => {
    // 2026-03-01T00:30Z is still 2026-02-28 in any UTC-negative zone; UTC must say March.
    const instant = Date.parse('2026-03-01T00:30:00Z');
    expect(utcMonth(instant)).toBe('2026-03');
    expect(utcDay(instant)).toBe('2026-03-01');
  });
});
