import { describe, it, expect } from 'vitest';
import {
  parseReturnSelector,
  parseIncludeProvince,
  resolveIncludeProvince,
  resolveLookupPath,
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

describe('resolveLookupPath', () => {
  it('maps /api to federal dataset path', () => {
    expect(resolveLookupPath('/api')).toEqual({
      lookupPathname: '/api/federal',
      datasetPath: '/api/federal',
      isFederal: true,
    });
  });

  it('maps /api/combined to federal dataset with combined semantics', () => {
    expect(resolveLookupPath('/api/combined')).toEqual({
      lookupPathname: '/api/combined',
      datasetPath: '/api/federal',
      isFederal: true,
    });
  });

  it('passes provincial paths through unchanged', () => {
    expect(resolveLookupPath('/api/on')).toEqual({
      lookupPathname: '/api/on',
      datasetPath: '/api/on',
      isFederal: false,
    });
  });
});
