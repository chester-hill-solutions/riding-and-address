import { describe, it, expect, vi } from 'vitest';
import { lookupRidingFromR2 } from '../src/lookup-riding';
import { Env } from '../src/types';

/**
 * Guards against the historical Ottawa Centre mock in QueueManagerDO.processJob.
 * Shared lookup must use R2 GeoJSON + point-in-polygon.
 */
describe('lookupRidingFromR2', () => {
  it('returns properties from a matching polygon, not a hardcoded riding', async () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { FED_NAME: 'Test Riding', FED_NUM: 999 },
          geometry: {
            type: 'Polygon',
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

    const env = {
      RIDINGS: {
        get: vi.fn(async () => ({
          text: async () => JSON.stringify(geojson),
        })),
      },
    } as unknown as Env;

    const hit = await lookupRidingFromR2(env, '/api/federal', -75, 45);
    expect(hit.properties).toMatchObject({ FED_NAME: 'Test Riding', FED_NUM: 999 });
    expect(hit.riding).toBe('Test Riding');

    const miss = await lookupRidingFromR2(env, '/api/federal', 0, 0);
    expect(miss.properties).toBeNull();
  });

  it('throws when the R2 object is missing', async () => {
    const env = {
      RIDINGS: { get: vi.fn(async () => null) },
    } as unknown as Env;
    await expect(lookupRidingFromR2(env, '/api/federal', -75, 45)).rejects.toThrow(/not found/i);
  });
});
