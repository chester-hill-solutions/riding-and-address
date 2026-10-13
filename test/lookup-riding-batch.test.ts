import { describe, it, expect } from 'vitest';
import { inMemoryDatasetSource } from '../src/dataset-source';
import { lookupRidingFromSource } from '../src/riding-lookup';
import { Env } from '../src/types';

/**
 * Guards against the historical Ottawa Centre mock in QueueManagerDO.processJob.
 * The shared lookup must use a DatasetSource's GeoJSON + point-in-polygon, never a hardcoded riding.
 *
 * The in-memory adapter replaces the deleted test-only `lookupRidingFromR2` loader, so production
 * and tests now exercise the same port.
 */
describe('lookupRidingFromSource (in-memory DatasetSource)', () => {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: { FED_NAME: 'Test Riding', FED_NUM: 999 },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [-80, 40],
              [-70, 40],
              [-70, 50],
              [-80, 50],
              [-80, 40],
            ],
          ],
        },
      },
    ],
  };

  function sourceWithFederal() {
    return inMemoryDatasetSource({ 'federalridings-2024.geojson': geojson });
  }

  it('returns properties from a matching polygon, not a hardcoded riding', async () => {
    const source = sourceWithFederal();

    const hit = await lookupRidingFromSource(source, {} as Env, '/api/federal', -75, 45);
    expect(hit.properties).toMatchObject({ FED_NAME: 'Test Riding', FED_NUM: 999 });
    expect(hit.riding).toBe('Test Riding');

    const miss = await lookupRidingFromSource(source, {} as Env, '/api/federal', 0, 0);
    expect(miss.properties).toBeNull();
  });

  it('throws when the dataset object is missing', async () => {
    const source = inMemoryDatasetSource({});
    await expect(lookupRidingFromSource(source, {} as Env, '/api/federal', -75, 45)).rejects.toThrow(
      /not found/i
    );
  });
});
