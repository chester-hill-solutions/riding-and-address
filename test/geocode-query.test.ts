import { describe, it, expect } from 'vitest';
import {
  parseGeocodeMethodParam,
  isPostalOnlyQuery,
  wantsPostalCentroidOnly,
} from '../src/geocode-query';

describe('parseGeocodeMethodParam', () => {
  it('defaults to auto', () => {
    expect(parseGeocodeMethodParam(undefined)).toEqual({ valid: true, value: 'auto' });
  });

  it('accepts postal_centroid', () => {
    expect(parseGeocodeMethodParam('postal_centroid')).toEqual({
      valid: true,
      value: 'postal_centroid',
    });
  });

  it('rejects unknown values', () => {
    const result = parseGeocodeMethodParam('nominatim');
    expect(result.valid).toBe(false);
  });
});

describe('isPostalOnlyQuery', () => {
  it('is true for postal without address', () => {
    expect(isPostalOnlyQuery({ postal: 'M5V2T6' })).toBe(true);
  });

  it('is false when address is present', () => {
    expect(isPostalOnlyQuery({ postal: 'M5V2T6', address: '123 Main' })).toBe(false);
  });
});

describe('wantsPostalCentroidOnly', () => {
  it('requires postal_centroid method and postal', () => {
    expect(wantsPostalCentroidOnly({ postal: 'M5V2T6', geocodeMethod: 'postal_centroid' })).toBe(
      true
    );
    expect(wantsPostalCentroidOnly({ postal: 'M5V2T6', geocodeMethod: 'auto' })).toBe(false);
  });
});
