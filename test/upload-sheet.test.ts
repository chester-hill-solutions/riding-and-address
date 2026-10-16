import { describe, it, expect } from 'vitest';
import { parseSheet, quoteUpload, csvCell } from '../src/upload-sheet';

describe('spreadsheet preparation', () => {
  it('preserves quoted commas/newlines and source columns while recognizing column aliases', () => {
    const sheet = parseSheet('\uFEFFName,Street Address,Postal Code\r\n"A, B","123 Main\nUnit 2",M5V2T6\r\nEmpty,,');
    expect(sheet.validRows).toBe(1); expect(sheet.invalidRows).toBe(1);
    expect(sheet.rows[0].source.Name).toBe('A, B');
    expect(sheet.rows[0].query).toMatchObject({ address: '123 Main\nUnit 2', postal: 'M5V2T6' });
  });
  it('fails closed on malformed files and ambiguous columns', () => {
    for (const csv of ['address\n"unfinished', 'address,postal\n123', 'address,address\n123,123', 'postal code,postal_code\nX,X'])
      expect(() => parseSheet(csv)).toThrow();
  });
  it('does not count invalid coordinates or empty rows as billable', () => {
    const sheet = parseSheet('name,latitude,longitude\nGood,43,-79\nBad,900,-79\nMissing,,');
    expect(sheet.validRows).toBe(1); expect(sheet.invalidRows).toBe(2);
  });
  it('prevents exported formulas from executing', () => {
    for (const cell of ['=HYPERLINK("x")', '+1', '-1', '@SUM(A1)', '  =1', '\tformula']) expect(csvCell(cell)).toMatch(/^"'/);
    expect(csvCell('123 Main, Unit 2')).toBe('"123 Main, Unit 2"');
  });
});
describe('upload pricing', () => {
  it('shares the monthly free allowance regardless of browser or file splitting', () => {
    expect(quoteUpload(600, 0, 0).freeRows).toBe(600);
    expect(quoteUpload(600, 600, 0)).toMatchObject({ freeRows: 400, chargeCents: 100 });
    expect(quoteUpload(600, 1200, 0).freeRows).toBe(0);
  });
  it('carries the card minimum and fractional cents as exact row credits', () => {
    expect(quoteUpload(1, 1000, 0)).toMatchObject({ chargeCents: 50, extraCreditRows: 99 });
    expect(quoteUpload(3, 1000, 3)).toMatchObject({ chargeCents: 0, creditsUsed: 3 });
    expect(quoteUpload(101, 1000, 0)).toMatchObject({ chargeCents: 51, extraCreditRows: 1 });
  });
});
