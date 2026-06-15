import { describe, it, expect } from 'vitest';
import {
  PROVINCIAL_DATASETS,
  pickDataset,
  provincePathFromFederalProperties,
  getAllProvincialPaths,
  FEDERAL_DATASET,
} from '../src/datasets';

describe('provincial route registry', () => {
  it('lists every provincial path from the registry', () => {
    expect(getAllProvincialPaths()).toEqual(PROVINCIAL_DATASETS.map((d) => d.path));
  });

  it.each(PROVINCIAL_DATASETS.map((d) => [d.path, d.r2Key, d.name]))(
    'pickDataset resolves %s to %s',
    (path, r2Key) => {
      expect(pickDataset(path).r2Key).toBe(r2Key);
    }
  );

  it.each(PROVINCIAL_DATASETS.flatMap((d) => d.aliases.map((alias) => [alias, d.path])))(
    'alias %s maps to %s',
    (alias, path) => {
      expect(provincePathFromFederalProperties({ PROV_TERR: alias })).toBe(path);
    }
  );

  it('maps federal paths to federal dataset', () => {
    expect(pickDataset('/api').r2Key).toBe(FEDERAL_DATASET.r2Key);
    expect(pickDataset('/api/federal').r2Key).toBe(FEDERAL_DATASET.r2Key);
    expect(pickDataset('/api/combined').r2Key).toBe(FEDERAL_DATASET.r2Key);
  });

  it('returns null for unknown province codes', () => {
    expect(provincePathFromFederalProperties({ PROV_TERR: 'XX' })).toBeNull();
    expect(provincePathFromFederalProperties({ PROV_TERR: 'UNKNOWN' })).toBeNull();
  });

  it('returns null for missing properties', () => {
    expect(provincePathFromFederalProperties(null)).toBeNull();
    expect(provincePathFromFederalProperties(undefined)).toBeNull();
  });

  it('defaults unknown paths to federal dataset', () => {
    expect(pickDataset('/api/unknown').r2Key).toBe(FEDERAL_DATASET.r2Key);
  });
});
