import { describe, it, expect } from 'vitest';
import { formatCanadaPostAddress } from '../src/canada-post-format';

describe('formatCanadaPostAddress', () => {
  it('formats address without unit in Canada Post style', () => {
    const result = formatCanadaPostAddress({
      civicNumber: '123',
      streetName: 'Main',
      streetType: 'ST',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M5V2T6',
    });

    expect(result.line1).toBe('123 MAIN ST');
    expect(result.municipality).toBe('TORONTO');
    expect(result.province).toBe('ON');
    expect(result.postalCode).toBe('M5V 2T6');
    expect(result.country).toBe('CANADA');
    expect(result.canadaPostCertified).toBe(false);
    expect(result.formattedMultiline).toContain('123 MAIN ST');
    expect(result.formattedMultiline).toContain('TORONTO  ON  M5V 2T6');
    expect(result.formattedMultiline).toContain('CANADA');
  });

  it('puts unit on separate line', () => {
    const result = formatCanadaPostAddress({
      civicNumber: '123',
      streetName: 'Main',
      streetType: 'ST',
      unit: '1205',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M5V 2T6',
    });

    expect(result.line1).toBe('UNIT 1205');
    expect(result.line2).toBe('123 MAIN ST');
  });

  it('abbreviates street types in mailing output', () => {
    const result = formatCanadaPostAddress({
      civicNumber: '456',
      streetName: 'King',
      streetType: 'AVENUE',
      city: 'Toronto',
      province: 'Ontario',
      postalCode: 'M5H1A1',
    });

    expect(result.line1).toBe('456 KING AVE');
    expect(result.province).toBe('ON');
  });

  it('always marks canadaPostCertified false', () => {
    const result = formatCanadaPostAddress({
      civicNumber: '1',
      streetName: 'Test',
      streetType: 'RD',
      city: 'Ottawa',
      province: 'ON',
    });
    expect(result.canadaPostCertified).toBe(false);
  });
});
