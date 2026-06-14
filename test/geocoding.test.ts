import { describe, it, expect } from 'vitest';
import {
  generateGeocodingCacheKey,
  generateReverseGeocodingCacheKey,
  parseGoogleAddressComponents
} from '../src/geocoding';

describe('generateGeocodingCacheKey', () => {
  it('generates a key with provider prefix', () => {
    const key = generateGeocodingCacheKey({ address: '123 Main St' }, 'google');
    expect(key.startsWith('geocoding:google:')).toBe(true);
  });

  it('normalizes address to lowercase', () => {
    const key1 = generateGeocodingCacheKey({ address: 'OTTAWA' }, 'google');
    const key2 = generateGeocodingCacheKey({ address: 'ottawa' }, 'google');
    expect(key1).toBe(key2);
  });

  it('trims whitespace in address', () => {
    const key1 = generateGeocodingCacheKey({ address: '  Ottawa  ' }, 'google');
    const key2 = generateGeocodingCacheKey({ address: 'Ottawa' }, 'google');
    expect(key1).toBe(key2);
  });

  it('removes spaces from postal code', () => {
    const key1 = generateGeocodingCacheKey({ postal: 'K1A 0B1' }, 'google');
    const key2 = generateGeocodingCacheKey({ postal: 'k1a0b1' }, 'google');
    expect(key1).toBe(key2);
  });

  it('includes all query fields in the key', () => {
    const key = generateGeocodingCacheKey({
      address: '123 Main St',
      postal: 'K1A0B1',
      city: 'Ottawa',
      state: 'ON',
      country: 'CA'
    }, 'google');
    expect(key).toContain('123 main st');
    expect(key).toContain('k1a0b1');
    expect(key).toContain('ottawa');
    expect(key).toContain('on');
    expect(key).toContain('ca');
  });

  it('different providers produce different keys', () => {
    const key1 = generateGeocodingCacheKey({ address: 'Ottawa' }, 'google');
    const key2 = generateGeocodingCacheKey({ address: 'Ottawa' }, 'nominatim');
    expect(key1).not.toBe(key2);
  });
});

describe('generateReverseGeocodingCacheKey', () => {
  it('rounds coordinates to 5 decimal places', () => {
    const key = generateReverseGeocodingCacheKey(45.4215299999, -75.6971933333);
    expect(key).toBe('reverse:google:45.42153,-75.69719');
  });

  it('handles negative coordinates', () => {
    const key = generateReverseGeocodingCacheKey(-45.0, -75.0);
    expect(key).toBe('reverse:google:-45,-75');
  });

  it('handles zero coordinates', () => {
    const key = generateReverseGeocodingCacheKey(0, 0);
    expect(key).toBe('reverse:google:0,0');
  });
});

describe('parseGoogleAddressComponents', () => {
  it('returns undefined for missing address_components', () => {
    const result = parseGoogleAddressComponents({});
    expect(result).toBeUndefined();
  });

  it('returns undefined for null input', () => {
    const result = parseGoogleAddressComponents(null as unknown as Record<string, unknown>);
    expect(result).toBeUndefined();
  });

  it('extracts street_number', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: '123', short_name: '123', types: ['street_number'] }
      ]
    });
    expect(result?.street_number).toBe('123');
  });

  it('extracts route (street name)', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Main Street', short_name: 'Main St', types: ['route'] }
      ]
    });
    expect(result?.route).toBe('Main Street');
  });

  it('extracts locality (city)', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Ottawa', short_name: 'Ottawa', types: ['locality'] }
      ]
    });
    expect(result?.locality).toBe('Ottawa');
  });

  it('extracts administrative_area_level_1 (province)', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Ontario', short_name: 'ON', types: ['administrative_area_level_1'] }
      ]
    });
    expect(result?.administrative_area_level_1).toBe('Ontario');
  });

  it('extracts postal_code', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'K1A 0B1', short_name: 'K1A 0B1', types: ['postal_code'] }
      ]
    });
    expect(result?.postal_code).toBe('K1A 0B1');
  });

  it('extracts country', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Canada', short_name: 'CA', types: ['country'] }
      ]
    });
    expect(result?.country).toBe('Canada');
  });

  it('extracts formatted_address and place_id', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Ottawa', short_name: 'Ottawa', types: ['locality'] }
      ],
      formatted_address: 'Ottawa, ON, Canada',
      place_id: 'ChIJrxNRX7IFzkwR7RXdMeFRaoo',
      types: ['locality', 'political']
    });
    expect(result?.formatted_address).toBe('Ottawa, ON, Canada');
    expect(result?.place_id).toBe('ChIJrxNRX7IFzkwR7RXdMeFRaoo');
    expect(result?.types).toEqual(['locality', 'political']);
  });

  it('extracts viewport and bounds', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Ottawa', short_name: 'Ottawa', types: ['locality'] }
      ],
      geometry: {
        viewport: {
          northeast: { lat: 45.6, lng: -75.4 },
          southwest: { lat: 45.3, lng: -75.8 }
        },
        bounds: {
          northeast: { lat: 45.6, lng: -75.4 },
          southwest: { lat: 45.3, lng: -75.8 }
        }
      }
    });
    expect(result?.viewport).toEqual({
      northeast: { lat: 45.6, lng: -75.4 },
      southwest: { lat: 45.3, lng: -75.8 }
    });
    expect(result?.bounds).toEqual({
      northeast: { lat: 45.6, lng: -75.4 },
      southwest: { lat: 45.3, lng: -75.8 }
    });
  });

  it('prefers long_name over short_name', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Ontario', short_name: 'ON', types: ['administrative_area_level_1'] }
      ]
    });
    expect(result?.administrative_area_level_1).toBe('Ontario');
  });

  it('falls back to short_name when long_name is missing', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { short_name: 'ON', types: ['administrative_area_level_1'] }
      ]
    });
    expect(result?.administrative_area_level_1).toBe('ON');
  });

  it('extracts neighborhood and sublocality', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Centretown', short_name: 'Centretown', types: ['neighborhood'] }
      ]
    });
    expect(result?.neighborhood).toBe('Centretown');
  });

  it('extracts sublocality from sublocality type', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Downtown', short_name: 'Downtown', types: ['sublocality'] }
      ]
    });
    expect(result?.sublocality).toBe('Downtown');
  });

  it('returns undefined when no components are found', () => {
    const result = parseGoogleAddressComponents({
      address_components: []
    });
    expect(result).toBeUndefined();
  });

  it('extracts plus_code when present', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Ottawa', short_name: 'Ottawa', types: ['locality'] }
      ],
      plus_code: {
        compound_code: '87G6M2F3+G4',
        global_code: '87G6M2F3+G4'
      }
    });
    expect(result?.plus_code).toEqual({
      compound_code: '87G6M2F3+G4',
      global_code: '87G6M2F3+G4'
    });
  });

  it('extracts multiple components from a realistic address', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: '123', short_name: '123', types: ['street_number'] },
        { long_name: 'Main Street', short_name: 'Main St', types: ['route'] },
        { long_name: 'Ottawa', short_name: 'Ottawa', types: ['locality'] },
        { long_name: 'Ontario', short_name: 'ON', types: ['administrative_area_level_1'] },
        { long_name: 'Canada', short_name: 'CA', types: ['country'] },
        { long_name: 'K1A 0B1', short_name: 'K1A 0B1', types: ['postal_code'] }
      ],
      formatted_address: '123 Main Street, Ottawa, ON K1A 0B1, Canada',
      place_id: 'test_place_id',
      types: ['street_address']
    });

    expect(result?.street_number).toBe('123');
    expect(result?.route).toBe('Main Street');
    expect(result?.locality).toBe('Ottawa');
    expect(result?.administrative_area_level_1).toBe('Ontario');
    expect(result?.country).toBe('Canada');
    expect(result?.postal_code).toBe('K1A 0B1');
    expect(result?.formatted_address).toBe('123 Main Street, Ottawa, ON K1A 0B1, Canada');
  });
});
