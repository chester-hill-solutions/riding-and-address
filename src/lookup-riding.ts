import { GeoJSONFeatureCollection } from './types';
import { pickDataset } from './datasets';
import { createSpatialIndex, findCandidateFeatures } from './spatial';
import { isPointInPolygon, ridingNameFromProperties } from './utils';
import type { LookupRidingFn } from './lookup-expansion';

/**
 * Point-in-polygon riding lookup against R2 GeoJSON.
 * Safe to call from the Worker and from QueueManagerDO (no isolate-global caches required).
 */
export const lookupRidingFromR2: LookupRidingFn = async (env, pathname, lon, lat) => {
  const { r2Key } = pickDataset(pathname);
  const obj = await env.RIDINGS.get(r2Key);
  if (!obj) {
    throw new Error(`R2 object not found: ${r2Key}`);
  }
  const parsed = JSON.parse(await obj.text()) as GeoJSONFeatureCollection;
  const index = createSpatialIndex(parsed);
  const candidates = findCandidateFeatures(lon, lat, index);
  for (const feature of candidates) {
    if (isPointInPolygon(lon, lat, feature.geometry)) {
      const properties = feature.properties || {};
      return {
        riding: ridingNameFromProperties(properties) ?? 'Unknown',
        properties,
      };
    }
  }
  return { properties: null };
};
