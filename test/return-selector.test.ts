import { describe, it, expect } from 'vitest';
import {
  parseReturnSelector,
  parseIncludeProvince,
  resolveIncludeProvince,
  isFederalLookupPath,
  wantsReturnField,
} from '../src/return-selector';

describe('parseReturnSelector', () => {
  it('returns empty fields for undefined', () => {
    expect(parseReturnSelector(undefined)).toEqual({ valid: true, fields: [] });
  });

  it('parses municipality token', () => {
    expect(parseReturnSelector('municipality')).toEqual({
      valid: true,
      fields: ['municipality'],
    });
  });

  it('rejects province_data as a return token', () => {
    const result = parseReturnSelector('province_data');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown return field');
  });

  it('rejects unknown tokens', () => {
    const result = parseReturnSelector('foo');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown return field');
  });
});

describe('parseIncludeProvince', () => {
  it('returns undefined when omitted', () => {
    expect(parseIncludeProvince(undefined)).toEqual({ valid: true, value: undefined });
  });

  it('parses true values', () => {
    expect(parseIncludeProvince('true').value).toBe(true);
    expect(parseIncludeProvince('1').value).toBe(true);
  });

  it('parses false values', () => {
    expect(parseIncludeProvince('false').value).toBe(false);
    expect(parseIncludeProvince('0').value).toBe(false);
  });

  it('rejects invalid values', () => {
    const result = parseIncludeProvince('maybe');
    expect(result.valid).toBe(false);
  });
});

describe('resolveIncludeProvince', () => {
  it('defaults combined endpoint to true', () => {
    expect(resolveIncludeProvince('/api/combined', undefined)).toBe(true);
  });

  it('defaults federal endpoint to false', () => {
    expect(resolveIncludeProvince('/api/federal', undefined)).toBe(false);
  });

  it('honors explicit false on combined', () => {
    expect(resolveIncludeProvince('/api/combined', false)).toBe(false);
  });

  it('honors explicit true on federal', () => {
    expect(resolveIncludeProvince('/api/federal', true)).toBe(true);
  });
});

describe('isFederalLookupPath', () => {
  it('matches federal and combined paths', () => {
    expect(isFederalLookupPath('/api')).toBe(true);
    expect(isFederalLookupPath('/api/federal')).toBe(true);
    expect(isFederalLookupPath('/api/combined')).toBe(true);
    expect(isFederalLookupPath('/api/on')).toBe(false);
  });
});

describe('wantsReturnField', () => {
  it('checks membership', () => {
    expect(wantsReturnField(['municipality'], 'municipality')).toBe(true);
    expect(wantsReturnField([], 'municipality')).toBe(false);
  });
});
