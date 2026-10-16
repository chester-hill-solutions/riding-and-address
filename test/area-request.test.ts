import { describe, it, expect } from 'vitest';
import {
  buildAreaEnvelope,
  hasAddressCoverage,
  provinceFromFeature,
  resolveRiding,
  ridingMatches,
  ridingRefFromFeature,
  type RidingRef,
} from '../src/area-request';
import type { DatasetSource } from '../src/dataset-source';
import type { Env, GeoJSONFeatureCollection } from '../src/types';

/**
 * W7 §2/§5/§9: naming a riding, finding it in its dataset, deciding whether addresses exist for it,
 * and shaping the envelope. All pure, so none of it needs a Worker, a database or a payment path.
 */

const OTTAWA: RidingRef = {
  datasetId: 'federalridings-2024.geojson',
  datasetYear: 2024,
  id: '35079',
  name: 'Ottawa Centre',
};

function collection(features: GeoJSONFeatureCollection['features']): GeoJSONFeatureCollection {
  return { type: 'FeatureCollection', features };
}

function sourceReturning(value: GeoJSONFeatureCollection): DatasetSource {
  return {
    load: async () => value,
    getSpatialIndex: async () => ({ entries: [], boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
    head: async () => null,
    querySpatial: async () => null,
  } as unknown as DatasetSource;
}

const SQUARE = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-76, 45],
      [-75, 45],
      [-75, 46],
      [-76, 46],
      [-76, 45],
    ],
  ],
};

describe('ridingRefFromFeature', () => {
  it('reads the numeric id from the federal or provincial field', () => {
    expect(ridingRefFromFeature({ FED_NUM: 35079, ED_NAMEE: 'Ottawa Centre' }, 'd', 2024)).toEqual({
      datasetId: 'd',
      datasetYear: 2024,
      id: '35079',
      name: 'Ottawa Centre',
    });
    expect(ridingRefFromFeature({ PR_NUM: '082', ENGLISH_NA: 'Toronto Centre' }, 'd', 2022).id).toBe('082');
  });

  it('reports a null id when the dataset has no numeric field', () => {
    expect(ridingRefFromFeature({ ENGLISH_NAME: 'Somewhere' }, 'd', 2022)).toMatchObject({
      id: null,
      name: 'Somewhere',
    });
  });
});

describe('ridingMatches', () => {
  it('matches on the id or the name, case-insensitively', () => {
    expect(ridingMatches(OTTAWA, '35079')).toBe(true);
    expect(ridingMatches(OTTAWA, 'ottawa centre')).toBe(true);
    expect(ridingMatches(OTTAWA, '  OTTAWA CENTRE  ')).toBe(true);
    expect(ridingMatches(OTTAWA, 'Ottawa West')).toBe(false);
    expect(ridingMatches(OTTAWA, '')).toBe(false);
  });

  it('does not match a null id against an empty string', () => {
    expect(ridingMatches({ ...OTTAWA, id: null }, '')).toBe(false);
  });
});

describe('provinceFromFeature', () => {
  it('reads PROV_TERR or PROV_CODE and normalises case', () => {
    expect(provinceFromFeature({ PROV_TERR: 'on' })).toBe('ON');
    expect(provinceFromFeature({ PROV_CODE: 'QC' })).toBe('QC');
  });

  it('rejects anything that is not a two-letter code', () => {
    expect(provinceFromFeature({ PROV_TERR: 'Ontario' })).toBeNull();
    expect(provinceFromFeature({})).toBeNull();
  });
});

describe('resolveRiding', () => {
  const options = { r2Key: 'federalridings-2024.geojson', datasetId: 'federalridings-2024.geojson', datasetYear: 2024, riding: 'Ottawa Centre' };

  it('returns the identity, geometry and province', async () => {
    const result = await resolveRiding(
      sourceReturning(collection([
        { type: 'Feature', geometry: SQUARE, properties: { FED_NUM: 35079, ED_NAMEE: 'Ottawa Centre', PROV_TERR: 'ON' } },
      ])),
      options
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ref).toEqual(OTTAWA);
    expect(result.province).toBe('ON');
    expect(result.geometry).toEqual(SQUARE);
  });

  it('reports RIDING_NOT_FOUND rather than guessing', async () => {
    const result = await resolveRiding(
      sourceReturning(collection([
        { type: 'Feature', geometry: SQUARE, properties: { FED_NUM: 1, ED_NAMEE: 'Elsewhere', PROV_TERR: 'ON' } },
      ])),
      options
    );
    expect(result).toEqual({ ok: false, code: 'RIDING_NOT_FOUND' });
  });

  it('reports PROVINCE_UNKNOWN when the feature carries no usable code', async () => {
    const result = await resolveRiding(
      sourceReturning(collection([
        { type: 'Feature', geometry: SQUARE, properties: { FED_NUM: 35079, ED_NAMEE: 'Ottawa Centre' } },
      ])),
      options
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('PROVINCE_UNKNOWN');
  });
});

describe('hasAddressCoverage', () => {
  it('is true only for provinces in ODA_PROVINCES', () => {
    const env = { ODA_PROVINCES: 'AB,BC,MB,NB,NT,NS,ON,PE,QC,SK' } as Env;
    expect(hasAddressCoverage(env, 'ON')).toBe(true);
    // NL, NU and YT have no imported address rows today.
    expect(hasAddressCoverage(env, 'NL')).toBe(false);
    expect(hasAddressCoverage(env, 'NU')).toBe(false);
    expect(hasAddressCoverage(env, 'YT')).toBe(false);
  });
});

describe('buildAreaEnvelope', () => {
  const record = {
    id: 7,
    province: 'ON',
    civic_number: '111',
    street_name: 'WELLINGTON',
    street_type: 'ST',
    street_direction: '',
    unit: '',
    postal_code: 'K1A 0A6',
    city: 'Ottawa',
    lat: 45.4236,
    lon: -75.7008,
    full_address: '111 Wellington St',
  };

  it('labels an exact count as exact and an unknown one as estimated', () => {
    const exact = buildAreaEnvelope({
      ref: OTTAWA,
      query: { dataset: 'federal', riding: 'Ottawa Centre' },
      records: [record],
      page: { cursor: 'c', hasMore: true, truncated: false },
      total: 812,
      attribution: ['a'],
    });
    expect(exact.count).toEqual({ returned: 1, total: 812, exact: true });

    const estimated = buildAreaEnvelope({
      ref: OTTAWA,
      query: { dataset: 'federal', riding: 'Ottawa Centre' },
      records: [record],
      page: { cursor: null, hasMore: false, truncated: false },
      total: null,
      attribution: ['a'],
    });
    // An unavailable count is never presented as an exact zero.
    expect(estimated.count).toEqual({ returned: 1, total: null, exact: false });
  });

  it('carries the dataset vintage and the riding on every record', () => {
    const envelope = buildAreaEnvelope({
      ref: OTTAWA,
      query: { dataset: 'federal', riding: 'Ottawa Centre' },
      records: [record],
      page: { cursor: null, hasMore: false, truncated: false },
      total: 1,
      attribution: ['a'],
    });
    expect(envelope.datasetId).toBe('federalridings-2024.geojson');
    expect(envelope.datasetYear).toBe(2024);
    const [first] = envelope.records as Array<Record<string, unknown>>;
    expect(first.riding).toEqual(OTTAWA);
    expect(first.civicNumber).toBe('111');
    expect(first.lat).toBe(45.4236);
  });
});
