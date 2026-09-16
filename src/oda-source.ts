import { Env } from './types';
import type { OdaGeocodeResult } from './oda-geocoding';
import { buildCityKey } from './oda-normalize';

interface CacheEntry {
  version: string | undefined;
  expires: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

/**
 * The NAR vintage for a `city_key`, or undefined when the city is still ODA-sourced.
 *
 * The migration is per city, so a result's provenance depends on which city its row came from.
 * `nar_city_keys` (written by the importer) records that. It is cached per Worker isolate so the
 * hot path pays one indexed read per city per TTL, not one per request.
 */
export async function resolveNarVersion(
  env: Env,
  province: string,
  cityKey: string | undefined
): Promise<string | undefined> {
  if (!env.ODA_DB || !cityKey) return undefined;

  const key = `${province}|${cityKey}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expires > now) return cached.version;

  let version: string | undefined;
  try {
    const row = await env.ODA_DB.prepare(
      `SELECT nar_version FROM nar_city_keys WHERE province = ? AND city_key = ? LIMIT 1`
    )
      .bind(province, cityKey)
      .first<{ nar_version: string }>();
    version = row?.nar_version ?? undefined;
  } catch {
    // The table is created by the NAR importer; treat a missing table as "not migrated".
    version = undefined;
  }

  cache.set(key, { version, expires: now + CACHE_TTL_MS });
  return version;
}

/**
 * Stamp a result with the NAR vintage when its city has been refreshed. A no-op for ODA-sourced
 * cities, so the response never overstates how current its data is.
 */
export async function withCitySource(
  env: Env,
  result: OdaGeocodeResult,
  city: string | undefined,
  province: string | undefined
): Promise<OdaGeocodeResult> {
  if (!city || !province || !result.dataSource) return result;
  const version = await resolveNarVersion(env, province, buildCityKey(city, province));
  if (!version) return result;
  return { ...result, dataSource: { ...result.dataSource, provider: 'statcan-nar', version } };
}
