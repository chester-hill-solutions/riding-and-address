import { describe, it, expect } from 'vitest';
import {
  checkRidingDatasets,
  allRequiredDatasetsPresent,
  missingDatasetKeys,
  RIDING_DATASET_KEYS,
} from '../src/datasets';
import { Env } from '../src/types';

function mockR2(present: Set<string>): Env['RIDINGS'] {
  return {
    head: async (key: string) => (present.has(key) ? ({} as R2Object) : null),
    get: async () => null,
    put: async () => ({} as R2Object),
    delete: async () => {},
    list: async () => ({ objects: [], truncated: false, delimitedPrefixes: [] }),
  } as R2Bucket;
}

describe('checkRidingDatasets', () => {
  it('reports all datasets when present in R2', async () => {
    const env = { RIDINGS: mockR2(new Set(RIDING_DATASET_KEYS)) } as Env;
    const datasets = await checkRidingDatasets(env);
    expect(allRequiredDatasetsPresent(datasets)).toBe(true);
    expect(missingDatasetKeys(datasets)).toEqual([]);
  });

  it('reports missing quebec dataset', async () => {
    const present = new Set(RIDING_DATASET_KEYS.filter((k) => k !== 'quebecridings-2025.geojson'));
    const env = { RIDINGS: mockR2(present) } as Env;
    const datasets = await checkRidingDatasets(env);
    expect(allRequiredDatasetsPresent(datasets)).toBe(false);
    expect(missingDatasetKeys(datasets)).toEqual(['quebecridings-2025.geojson']);
  });
});
