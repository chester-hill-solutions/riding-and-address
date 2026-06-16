import { describe, it, expect } from 'vitest';
import {
  extractMunicipality,
  applyMunicipalityToProperties,
  buildExpandedLookupPayload,
} from '../src/lookup-expansion';

describe('extractMunicipality', () => {
  it('prefers ODA mailing address municipality', () => {
    expect(
      extractMunicipality(
        { locality: 'Toronto' },
        { municipality: 'TORONTO', line1: '123 MAIN ST', province: 'ON', country: 'CANADA', formattedSingleLine: '', formattedMultiline: '', canadaPostCertified: false }
      )
    ).toBe('TORONTO');
  });

  it('falls back to Google locality', () => {
    expect(extractMunicipality({ locality: 'Ottawa' })).toBe('Ottawa');
  });

  it('falls back to query city', () => {
    expect(extractMunicipality(undefined, undefined, 'Toronto')).toBe('Toronto');
  });
});

describe('applyMunicipalityToProperties', () => {
  it('adds MUNICIPALITY without mutating source object', () => {
    const source = { FED_NUM: '35075' };
    const result = applyMunicipalityToProperties(source, 'TORONTO');
    expect(result).toEqual({ FED_NUM: '35075', MUNICIPALITY: 'TORONTO' });
    expect(source).toEqual({ FED_NUM: '35075' });
  });

  it('returns original properties when municipality is absent', () => {
    const source = { FED_NUM: '35075' };
    expect(applyMunicipalityToProperties(source)).toBe(source);
  });
});

describe('buildExpandedLookupPayload', () => {
  it('includes province_data for federal paths when include_province is true', () => {
    const payload = buildExpandedLookupPayload(
      { properties: { PROV_TERR: 'ON' }, riding: 'Toronto—Danforth' },
      [],
      '/api/federal',
      {
        includeProvince: true,
        provinceData: {
          riding: 'Beaches—East York',
          properties: { PR_NUM: '001' },
          dataset: 'ontarioridings-2022',
        },
      }
    );

    expect(payload.province_data?.riding).toBe('Beaches—East York');
    expect(payload.municipality).toBeUndefined();
  });

  it('omits province_data when include_province is false', () => {
    const payload = buildExpandedLookupPayload(
      { properties: { PROV_TERR: 'ON' }, riding: 'Toronto Centre' },
      [],
      '/api/federal',
      {
        includeProvince: false,
        provinceData: {
          riding: 'Beaches—East York',
          properties: { PR_NUM: '001' },
          dataset: 'ontarioridings-2022',
        },
      }
    );

    expect(payload.province_data).toBeUndefined();
  });

  it('includes municipality when requested', () => {
    const payload = buildExpandedLookupPayload(
      { properties: { FED_NUM: '35075' }, riding: 'Toronto Centre' },
      ['municipality'],
      '/api/federal',
      {
        addressContext: {
          mailingAddress: {
            municipality: 'TORONTO',
            line1: '123 MAIN ST',
            province: 'ON',
            country: 'CANADA',
            formattedSingleLine: '',
            formattedMultiline: '',
            canadaPostCertified: false,
          },
        },
      }
    );

    expect(payload.municipality).toBe('TORONTO');
    expect(payload.properties?.MUNICIPALITY).toBe('TORONTO');
  });

  it('does not include province_data on provincial endpoints', () => {
    const payload = buildExpandedLookupPayload(
      { properties: { PR_NUM: '082' }, riding: 'Scarborough Southwest' },
      [],
      '/api/on',
      { includeProvince: true }
    );

    expect(payload.province_data).toBeUndefined();
  });

  it('includes normalized address fields when present on base or address context', () => {
    const payload = buildExpandedLookupPayload(
      {
        properties: { FED_NUM: '35075' },
        riding: 'Toronto Centre',
        normalizedAddress: '123 MAIN ST, TORONTO ON, CANADA',
        addressComponents: { locality: 'TORONTO' },
      },
      [],
      '/api/federal',
      {
        addressContext: {
          normalizedAddress: '456 OTHER ST, TORONTO ON, CANADA',
          addressComponents: { locality: 'TORONTO' },
          mailingAddress: {
            line1: '456 OTHER ST',
            municipality: 'TORONTO',
            province: 'ON',
            country: 'CANADA',
            formattedSingleLine: '456 OTHER ST, TORONTO ON, CANADA',
            formattedMultiline: '456 OTHER ST\nTORONTO ON\nCANADA',
            canadaPostCertified: false,
          },
          geocodeMethod: 'exact',
          geocodeConfidence: 1,
        },
      }
    );

    expect(payload.normalizedAddress).toBe('456 OTHER ST, TORONTO ON, CANADA');
    expect(payload.addressComponents?.locality).toBe('TORONTO');
    expect(payload.mailingAddress?.line1).toBe('456 OTHER ST');
    expect(payload.geocode?.method).toBe('exact');
  });

  it('falls back to base normalized address when address context has none', () => {
    const payload = buildExpandedLookupPayload(
      {
        properties: { FED_NUM: '35075' },
        riding: 'Toronto Centre',
        normalizedAddress: '123 MAIN ST, TORONTO ON, CANADA',
      },
      [],
      '/api/federal',
      { addressContext: {} }
    );

    expect(payload.normalizedAddress).toBe('123 MAIN ST, TORONTO ON, CANADA');
  });
});
