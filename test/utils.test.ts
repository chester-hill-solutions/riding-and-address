import { describe, it, expect } from 'vitest';
import {
  validateCoordinates,
  validatePostalCode,
  sanitizeString,
  ringContains,
  polygonContains,
  isPointInPolygon,
  generateCorrelationId,
  pickDataset,
  provincePathFromFederalProperties,
  ridingNameFromProperties,
  checkBasicAuth,
  checkAdminAuth,
  validateAndSanitizeQuery,
  parseQuery,
} from '../src/utils';

describe('validateCoordinates', () => {
  it('returns valid for correct coordinates', () => {
    const result = validateCoordinates(45.5, -75.7);
    expect(result.valid).toBe(true);
    expect(result.lat).toBe(45.5);
    expect(result.lon).toBe(-75.7);
  });

  it('returns valid when both are undefined', () => {
    const result = validateCoordinates(undefined, undefined);
    expect(result.valid).toBe(true);
  });

  it('returns error when only lat is provided', () => {
    const result = validateCoordinates(45.5, undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Both lat and lon must be provided');
  });

  it('returns error for out-of-range latitude', () => {
    const result = validateCoordinates(91, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Latitude');
  });

  it('returns error for out-of-range longitude', () => {
    const result = validateCoordinates(0, 181);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Longitude');
  });

  it('returns error for non-finite values', () => {
    const result = validateCoordinates(NaN, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('finite');
  });
});

describe('validatePostalCode', () => {
  it('validates Canadian postal codes', () => {
    const result = validatePostalCode('K1A 0B1');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('K1A 0B1');
  });

  it('formats Canadian postal codes without space', () => {
    const result = validatePostalCode('K1A0B1');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('K1A 0B1');
  });

  it('allows empty postal code', () => {
    const result = validatePostalCode('');
    expect(result.valid).toBe(true);
  });

  it('rejects invalid long postal code', () => {
    const result = validatePostalCode('A'.repeat(25));
    expect(result.valid).toBe(false);
  });
});

describe('sanitizeString', () => {
  it('removes control characters', () => {
    const result = sanitizeString('hello\x00world');
    expect(result).toBe('helloworld');
  });

  it('trims whitespace', () => {
    const result = sanitizeString('  hello  ');
    expect(result).toBe('hello');
  });

  it('limits length', () => {
    const result = sanitizeString('a'.repeat(2000), 1000);
    expect(result).toBe('a'.repeat(1000));
  });

  it('returns undefined for empty input', () => {
    expect(sanitizeString('')).toBeUndefined();
    expect(sanitizeString(undefined)).toBeUndefined();
  });
});

describe('ringContains', () => {
  it('returns true for point inside a simple square', () => {
    const ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    expect(ringContains([5, 5], ring)).toBe(true);
  });

  it('returns false for point outside a simple square', () => {
    const ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    expect(ringContains([15, 5], ring)).toBe(false);
  });

  it('returns true for point on boundary', () => {
    const ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    expect(ringContains([5, 0], ring)).toBe(true);
  });

  it('returns false for degenerate ring', () => {
    expect(ringContains([5, 5], [[0, 0], [10, 0]])).toBe(false);
  });
});

describe('polygonContains', () => {
  it('returns true for point in polygon without holes', () => {
    const polygon = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]];
    expect(polygonContains([5, 5], polygon)).toBe(true);
  });

  it('returns false for point outside polygon', () => {
    const polygon = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]];
    expect(polygonContains([15, 5], polygon)).toBe(false);
  });

  it('returns false for point in hole', () => {
    const polygon = [
      [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]],
      [[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]]
    ];
    expect(polygonContains([10, 10], polygon)).toBe(false);
  });
});

describe('isPointInPolygon', () => {
  it('handles Polygon geometry', () => {
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]
    };
    expect(isPointInPolygon(5, 5, geometry)).toBe(true);
    expect(isPointInPolygon(15, 5, geometry)).toBe(false);
  });

  it('handles MultiPolygon geometry', () => {
    const geometry = {
      type: 'MultiPolygon' as const,
      coordinates: [
        [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
        [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]]
      ]
    };
    expect(isPointInPolygon(25, 25, geometry)).toBe(true);
    expect(isPointInPolygon(15, 15, geometry)).toBe(false);
  });

  it('returns false for unsupported geometry', () => {
    const geometry = {
      type: 'Point' as const,
      coordinates: [5, 5]
    };
    expect(isPointInPolygon(5, 5, geometry as unknown)).toBe(false);
  });

  it('returns false for missing geometry', () => {
    expect(isPointInPolygon(5, 5, undefined as unknown)).toBe(false);
  });
});

describe('generateCorrelationId', () => {
  it('generates a non-empty string', () => {
    const id = generateCorrelationId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(id.startsWith('req_')).toBe(true);
  });

  it('generates unique ids', () => {
    const id1 = generateCorrelationId();
    const id2 = generateCorrelationId();
    expect(id1).not.toBe(id2);
  });
});

describe('pickDataset', () => {
  it('maps /api to federal ridings', () => {
    expect(pickDataset('/api').r2Key).toBe('federalridings-2024.geojson');
  });

  it('maps /api/federal to federal ridings', () => {
    expect(pickDataset('/api/federal').r2Key).toBe('federalridings-2024.geojson');
  });

  it('maps /api/qc to quebec ridings', () => {
    expect(pickDataset('/api/qc').r2Key).toBe('quebecridings-2025.geojson');
  });

  it('maps /api/on to ontario ridings', () => {
    expect(pickDataset('/api/on').r2Key).toBe('ontarioridings-2022.geojson');
  });

  it('defaults unknown paths to federal', () => {
    expect(pickDataset('/api/unknown').r2Key).toBe('federalridings-2024.geojson');
  });
});

describe('provincePathFromFederalProperties', () => {
  it('maps Ontario abbreviations', () => {
    expect(provincePathFromFederalProperties({ PROV_TERR: 'ON' })).toBe('/api/on');
    expect(provincePathFromFederalProperties({ PROV_TERR: 'ONT' })).toBe('/api/on');
    expect(provincePathFromFederalProperties({ PROV_TERR: 'Ontario' })).toBe('/api/on');
    expect(provincePathFromFederalProperties({ PROV_CODE: 'ON' })).toBe('/api/on');
  });

  it('maps Quebec abbreviations', () => {
    expect(provincePathFromFederalProperties({ PROV_TERR: 'QC' })).toBe('/api/qc');
    expect(provincePathFromFederalProperties({ PROV_TERR: 'QUE' })).toBe('/api/qc');
    expect(provincePathFromFederalProperties({ PROV_TERR: 'Québec' })).toBe('/api/qc');
  });

  it('returns null for unknown province', () => {
    expect(provincePathFromFederalProperties({ PROV_TERR: 'XX' })).toBeNull();
    expect(provincePathFromFederalProperties({ PROV_TERR: 'UNKNOWN' })).toBeNull();
  });

  it('returns null for missing properties', () => {
    expect(provincePathFromFederalProperties(null)).toBeNull();
    expect(provincePathFromFederalProperties(undefined)).toBeNull();
  });
});

describe('ridingNameFromProperties', () => {
  it('prefers ENGLISH_NAME then ENGLISH_NA and federal fields', () => {
    expect(ridingNameFromProperties({ ENGLISH_NAME: 'Toronto Centre' })).toBe('Toronto Centre');
    expect(ridingNameFromProperties({ ENGLISH_NA: 'Spadina—Fort York' })).toBe('Spadina—Fort York');
    expect(ridingNameFromProperties({ ED_NAMEE: 'Spadina—Harbourfront' })).toBe('Spadina—Harbourfront');
    expect(ridingNameFromProperties({ FED_NAME: 'Ottawa Centre' })).toBe('Ottawa Centre');
    expect(ridingNameFromProperties({ NM_CEP: 'Jean-Talon' })).toBe('Jean-Talon');
  });

  it('returns undefined when no name fields are present', () => {
    expect(ridingNameFromProperties({ FED_NUM: 35100 })).toBeUndefined();
    expect(ridingNameFromProperties(null)).toBeUndefined();
  });
});

function authRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api', { headers });
}

describe('validateAndSanitizeQuery return selector', () => {
  it('parses valid return tokens', () => {
    const result = validateAndSanitizeQuery(
      {
        postal: 'M5V 2T6',
        return: 'municipality',
      },
      '/api/federal'
    );
    expect(result.valid).toBe(true);
    expect(result.sanitized?.returnFields).toEqual(['municipality']);
  });

  it('rejects province_data in return selector', () => {
    const result = validateAndSanitizeQuery(
      {
        postal: 'M5V 2T6',
        return: 'province_data',
      },
      '/api/federal'
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown return field');
  });

  it('rejects unknown return tokens', () => {
    const result = validateAndSanitizeQuery(
      {
        postal: 'M5V 2T6',
        return: 'invalid_token',
      },
      '/api/federal'
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown return field');
  });
});

describe('validateAndSanitizeQuery include_province', () => {
  it('parses include_province=true', () => {
    const result = validateAndSanitizeQuery(
      {
        postal: 'M5V 2T6',
        include_province: 'true',
      },
      '/api/federal'
    );
    expect(result.valid).toBe(true);
    expect(result.sanitized?.includeProvince).toBe(true);
  });

  it('rejects invalid include_province values', () => {
    const result = validateAndSanitizeQuery(
      {
        postal: 'M5V 2T6',
        include_province: 'maybe',
      },
      '/api/federal'
    );
    expect(result.valid).toBe(false);
  });

  it('defaults province inclusion for combined endpoint', () => {
    const result = validateAndSanitizeQuery({ postal: 'M5V 2T6' }, '/api/combined');
    expect(result.valid).toBe(true);
    expect(result.sanitized?.includeProvince).toBe(true);
  });

  it('treats presence-only include_province query flag as true', () => {
    const request = new Request(
      'http://localhost/api/federal?postal=M5V%202T6&include_province'
    );
    const { validation } = parseQuery(request);
    expect(validation.valid).toBe(true);
    expect(validation.sanitized?.includeProvince).toBe(true);
  });

  it('requires explicit flag on federal endpoint', () => {
    const result = validateAndSanitizeQuery({ postal: 'M5V 2T6' }, '/api/federal');
    expect(result.valid).toBe(true);
    expect(result.sanitized?.includeProvince).toBe(false);

    const explicit = validateAndSanitizeQuery(
      { postal: 'M5V 2T6', include_province: 'true' },
      '/api/federal'
    );
    expect(explicit.sanitized?.includeProvince).toBe(true);
  });

  it('defaults returnFields to empty array', () => {
    const result = validateAndSanitizeQuery({ postal: 'M5V 2T6' }, '/api/federal');
    expect(result.valid).toBe(true);
    expect(result.sanitized?.returnFields).toEqual([]);
  });

  it('does not default province on combined when return selector is present', () => {
    const result = validateAndSanitizeQuery(
      { postal: 'M5V 2T6', return: 'municipality' },
      '/api/combined'
    );
    expect(result.valid).toBe(true);
    expect(result.sanitized?.returnFields).toEqual(['municipality']);
    expect(result.sanitized?.includeProvince).toBe(false);
  });

  it('honors explicit include_province when return selector is present', () => {
    const result = validateAndSanitizeQuery(
      { postal: 'M5V 2T6', return: 'municipality', include_province: 'true' },
      '/api/combined'
    );
    expect(result.valid).toBe(true);
    expect(result.sanitized?.includeProvince).toBe(true);
  });
});

describe('checkBasicAuth', () => {
  it('allows BYOK lookup access when BASIC_AUTH is configured', () => {
    const request = authRequest({ 'X-Google-API-Key': 'test-key' });
    expect(checkBasicAuth(request, { BASIC_AUTH: 'admin:secret' } as never)).toBe(true);
  });
});

describe('checkAdminAuth', () => {
  it('rejects BYOK header for admin routes', () => {
    const request = authRequest({ 'X-Google-API-Key': 'test-key' });
    expect(checkAdminAuth(request, { BASIC_AUTH: 'admin:secret' } as never)).toBe(false);
  });

  it('accepts valid basic auth credentials', () => {
    const request = authRequest({ Authorization: `Basic ${btoa('admin:secret')}` });
    expect(checkAdminAuth(request, { BASIC_AUTH: 'admin:secret' } as never)).toBe(true);
  });
});
