import { describe, it, expect } from 'vitest';
import {
  checkRidingDatasets,
  allRequiredDatasetsPresent,
  missingDatasetKeys,
  getAllR2Keys,
  getLiveR2Keys,
  getLiveWarmTargets,
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
  it('reports all live datasets when present in R2', async () => {
    const env = { RIDINGS: mockR2(new Set(getLiveR2Keys())) } as Env;
    const datasets = await checkRidingDatasets(env);
    expect(allRequiredDatasetsPresent(datasets)).toBe(true);
    expect(missingDatasetKeys(datasets)).toEqual([]);
  });

  it('reports missing live provincial dataset as unhealthy', async () => {
    const present = new Set(getLiveR2Keys().filter((k) => k !== 'bcridings-2022.geojson'));
    const env = { RIDINGS: mockR2(present) } as Env;
    const datasets = await checkRidingDatasets(env);
    expect(allRequiredDatasetsPresent(datasets)).toBe(false);
    expect(missingDatasetKeys(datasets)).toEqual(['bcridings-2022.geojson']);
  });

  it('treats all provinces as live datasets required for health', async () => {
    const env = { RIDINGS: mockR2(new Set(getLiveR2Keys())) } as Env;
    const datasets = await checkRidingDatasets(env);
    expect(datasets.filter((d) => d.status === 'registered')).toHaveLength(0);
    expect(allRequiredDatasetsPresent(datasets)).toBe(true);
  });

  it('head-checks every registered R2 key', async () => {
    const env = { RIDINGS: mockR2(new Set()) } as Env;
    const datasets = await checkRidingDatasets(env);
    expect(datasets.map((d) => d.key)).toEqual(getAllR2Keys());
  });
});

describe('getLiveWarmTargets', () => {
  it('includes only live federal and provincial datasets', () => {
    const targets = getLiveWarmTargets();
    expect(targets.map((t) => t.r2Key)).toEqual(getLiveR2Keys());
    expect(targets.every((t) => t.pathname.startsWith('/api/')));
  });
});
