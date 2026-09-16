import { describe, it, expect } from 'vitest';
import {
  buildGeocodeQueryString,
  expandStreetAddress,
  geocodeLabelMatchesRegion,
  selectGeoGratisResult,
} from '../src/geocode-region';
import { STREET_TYPE_CANONICAL, STREET_TYPE_QUERY_TOKENS } from '../src/oda-normalize';

describe('expandStreetAddress', () => {
  it('appends Ave when civic address has no street type', () => {
    expect(expandStreetAddress('757 Victoria Park')).toBe('757 Victoria Park Ave');
  });

  it('does not modify addresses that already include a type', () => {
    expect(expandStreetAddress('757 Victoria Park Ave')).toBe('757 Victoria Park Ave');
  });

  it('recognises every token derived from the canonical vocabulary', () => {
    // Both suffix patterns are generated from STREET_TYPE_QUERY_TOKENS, so this fails if either
    // drifts from the shared vocabulary.
    for (const token of STREET_TYPE_QUERY_TOKENS) {
      expect(expandStreetAddress(`123 Main ${token}`)).toBe(`123 Main ${token}`);
    }
    for (const alias of Object.keys(STREET_TYPE_CANONICAL)) {
      expect(STREET_TYPE_QUERY_TOKENS).toContain(alias);
    }
  });

  it('treats the circle aliases as types in both patterns', () => {
    // Regression: STREET_TYPE_ANY accepted CRCL/CIRCL while STREET_TYPE_SUFFIX did not.
    expect(expandStreetAddress('2 Welby CRCL')).toBe('2 Welby CRCL');
    expect(expandStreetAddress('2 Welby CIRCL')).toBe('2 Welby CIRCL');
  });
});

describe('buildGeocodeQueryString', () => {
  it('expands province code to full name', () => {
    expect(
      buildGeocodeQueryString({
        address: '757 Victoria Park',
        city: 'Toronto',
        state: 'ON',
      })
    ).toBe('757 Victoria Park Ave, Toronto, Ontario, Canada');
  });
});

describe('selectGeoGratisResult', () => {
  const results = [
    {
      title: '757 Victoria Park Avenue, City Of Toronto, Ontario',
      qualifier: 'INTERPOLATED_POSITION',
      geometry: { coordinates: [-79.288688, 43.692101] },
    },
    {
      title: '757 Highway & Route 757, Parkland County, Alberta',
      qualifier: 'LOCATION',
      geometry: { coordinates: [-114.869564, 53.715415] },
    },
  ];

  it('prefers Ontario match over Alberta when city and province are provided', () => {
    const selected = selectGeoGratisResult(
      { address: '757 Victoria Park', city: 'Toronto', state: 'ON' },
      results
    );
    expect(selected?.title).toContain('Victoria Park');
    expect(selected?.geometry?.coordinates?.[0]).toBeCloseTo(-79.288688, 3);
  });

  it('prefers Victoria Park Avenue over Victoria Avenue East in Toronto', () => {
    const selected = selectGeoGratisResult(
      { address: '757 Victoria Park', city: 'Toronto', state: 'ON' },
      [
        ...results,
        {
          title: 'Victoria Avenue East, City Of Toronto, Ontario',
          qualifier: 'LOCATION',
          geometry: { coordinates: [-79.508832, 43.697448] },
        },
      ]
    );
    expect(selected?.title).toContain('Victoria Park');
  });

  it('matches region labels', () => {
    expect(
      geocodeLabelMatchesRegion(
        { city: 'Toronto', state: 'ON' },
        '757 Victoria Park Avenue, City Of Toronto, Ontario'
      )
    ).toBe(true);
    expect(
      geocodeLabelMatchesRegion(
        { city: 'Toronto', state: 'ON' },
        '757 Highway & Route 757, Parkland County, Alberta'
      )
    ).toBe(false);
  });
});
