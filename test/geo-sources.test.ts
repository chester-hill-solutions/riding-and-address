import { describe, it, expect } from 'vitest';
import {
  GOC_SHARED_SOURCE,
  GEO_SOURCES,
  PROV_NUM_TO_CODE,
  STATCAN_2021_CENSUS_SOURCE,
  geoLayerRef,
  getAllGeoLayerSpecs,
  getGeoLayerSpecByCode,
  getGeoSource,
  provinceCodeFromProvNum,
} from '../src/geo-sources';
import { GEO_DATASETS } from '../src/geo-datasets';

describe('geo source registry', () => {
  it('exposes the official sources', () => {
    expect(GEO_SOURCES.map((source) => source.id)).toEqual([
      'goc-shared-arcgis',
      'statcan-2021-census',
    ]);
    expect(getGeoSource('goc-shared-arcgis')).toBe(GOC_SHARED_SOURCE);
    expect(getGeoSource('nope')).toBeUndefined();
  });

  it('licenses every source for redistribution', () => {
    for (const source of GEO_SOURCES) {
      expect(source.licence.redistributable, source.id).toBe(true);
      expect(source.licence.attribution.length, source.id).toBeGreaterThan(10);
      expect(source.licence.url, source.id).toMatch(/^https:\/\//);
    }
  });

  it('gives every layer a join key that the field maps actually populate', () => {
    for (const spec of getAllGeoLayerSpecs()) {
      const populated = new Set([
        ...Object.values(spec.fields),
        ...Object.values(spec.frenchFields ?? {}),
      ]);
      expect(populated.has(spec.joinKey), `${spec.datasetCode}`).toBe(true);
    }
  });

  it('resolves a layer reference in both languages', () => {
    const spec = getGeoLayerSpecByCode('csd')!;
    const english = geoLayerRef(spec, false)!;
    const french = geoLayerRef(spec, true)!;

    expect(english.serviceUrl).toBe(spec.serviceUrl);
    expect(english.layerId).toBe(spec.layerId);
    expect(french.serviceUrl).toBe(spec.frenchServiceUrl);
    expect(french.layerId).toBe(spec.frenchLayerId);
  });

  it('gives every layer a French twin where the source has one', () => {
    for (const spec of getAllGeoLayerSpecs()) {
      if (!spec.frenchFields) continue;
      expect(spec.frenchServiceUrl, spec.datasetCode).toBeDefined();
      expect(spec.frenchLayerId, spec.datasetCode).toBeDefined();
    }
  });

  it('gives every layer a dataset code', () => {
    const codes = getAllGeoLayerSpecs().map((spec) => spec.datasetCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('carries the census metropolitan area only on the 2021 census source', () => {
    const cma = getGeoLayerSpecByCode('cma')!;
    expect(cma.serviceUrl).toContain('geo.statcan.gc.ca');
    expect(cma.year).toBe(2021);
    expect(STATCAN_2021_CENSUS_SOURCE.layers.map((l) => l.datasetCode)).toContain('cma');
  });

  it('carries four federal polling division vintages on the shared host', () => {
    const years = GOC_SHARED_SOURCE.layers
      .filter((spec) => spec.level === 'federal-polling-division')
      .map((spec) => spec.year)
      .sort();
    expect(years).toEqual([2015, 2019, 2021, 2025]);
  });
});

describe('provinceCodeFromProvNum', () => {
  it('maps a Statistics Canada PRUID', () => {
    expect(provinceCodeFromProvNum('35')).toBe('ON');
    expect(provinceCodeFromProvNum('24')).toBe('QC');
    expect(provinceCodeFromProvNum(59)).toBe('BC');
  });

  it('maps the leading digits of a federal district number', () => {
    expect(provinceCodeFromProvNum('24037')).toBe('QC');
    expect(provinceCodeFromProvNum('35093')).toBe('ON');
    expect(provinceCodeFromProvNum(48001)).toBe('AB');
  });

  it('returns undefined for an unmapped or malformed value', () => {
    expect(provinceCodeFromProvNum('99')).toBeUndefined();
    expect(provinceCodeFromProvNum('')).toBeUndefined();
    expect(provinceCodeFromProvNum(null)).toBeUndefined();
    expect(provinceCodeFromProvNum(undefined)).toBeUndefined();
  });

  it('covers every province Statistics Canada publishes', () => {
    const expected = ['NL', 'PE', 'NS', 'NB', 'QC', 'ON', 'MB', 'SK', 'AB', 'BC', 'YT', 'NT', 'NU'];
    expect(Object.values(PROV_NUM_TO_CODE).sort()).toEqual(expected.sort());
  });
});

describe('geo dataset registry', () => {
  it('gives every dataset a unique route, key and code', () => {
    const paths = GEO_DATASETS.map((d) => d.path);
    const keys = GEO_DATASETS.map((d) => d.r2Key);
    const codes = GEO_DATASETS.map((d) => d.code);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('names every R2 key with its vintage so a pin can be read off the key', () => {
    for (const dataset of GEO_DATASETS) {
      expect(dataset.r2Key, dataset.code).toContain(String(dataset.year));
      expect(dataset.r2Key.endsWith('.geojson'), dataset.code).toBe(true);
    }
  });

  it('serves only levels the acquisition pipeline can produce', () => {
    const acquirable = new Set(getAllGeoLayerSpecs().map((spec) => spec.level));
    for (const dataset of GEO_DATASETS) {
      expect(acquirable.has(dataset.level), dataset.code).toBe(true);
    }
  });

  it('has an acquisition layer for every dataset it serves', () => {
    const acquirable = new Set(getAllGeoLayerSpecs().map((spec) => spec.datasetCode));
    for (const dataset of GEO_DATASETS) {
      expect(acquirable.has(dataset.code), dataset.code).toBe(true);
    }
  });
});
