/**
 * Resolving an area request and shaping its response — the W7 contract's §2, §5, §8 and §9.
 *
 * Kept apart from the route on purpose: resolving a riding, naming its province, deciding whether
 * addresses exist for it, and building the envelope are all pure functions over data the caller
 * already has, so they can be tested without a Worker, a database, or a payment path.
 */

import { ridingNameFromProperties } from './utils';
import { getOdaConfig } from './oda-config';
import type { DatasetSource } from './dataset-source';
import type { AddressRecord } from './address-store';
import type { Env, GeoJSONGeometry } from './types';

/** A riding's identity, per contract §2. `id` is null when the dataset has no numeric field. */
export interface RidingRef {
  datasetId: string;
  datasetYear: number;
  id: string | null;
  name: string;
}

export function ridingRefFromFeature(
  properties: Record<string, unknown>,
  datasetId: string,
  datasetYear: number
): RidingRef {
  const rawId = properties.FED_NUM ?? properties.PR_NUM ?? properties.ED_NUM ?? null;
  return {
    datasetId,
    datasetYear,
    id: rawId === null || rawId === undefined ? null : String(rawId),
    name: ridingNameFromProperties(properties) ?? 'Unknown',
  };
}

/** A query's `riding` matches on the numeric id or the name, case-insensitively. */
export function ridingMatches(ref: RidingRef, wanted: string): boolean {
  const needle = wanted.trim().toLowerCase();
  if (!needle) return false;
  return (ref.id !== null && ref.id.toLowerCase() === needle) || ref.name.toLowerCase() === needle;
}

/**
 * The province the address rows for this riding are stored under. Normalised features carry
 * `PROV_TERR`; raw federal ones carry `PROV_CODE`/`PROV_TERR`.
 */
export function provinceFromFeature(properties: Record<string, unknown>): string | null {
  const raw = properties.PROV_TERR ?? properties.PROV_CODE;
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return code.length === 2 ? code : null;
}

export type RidingResolution =
  | { ok: true; ref: RidingRef; geometry: GeoJSONGeometry; province: string }
  | { ok: false; code: 'RIDING_NOT_FOUND' }
  | { ok: false; code: 'PROVINCE_UNKNOWN'; ref: RidingRef };

/** Find a riding's feature in its dataset and read the geometry, province and identity off it. */
export async function resolveRiding(
  source: DatasetSource,
  options: { r2Key: string; datasetId: string; datasetYear: number; riding: string }
): Promise<RidingResolution> {
  const collection = await source.load(options.r2Key);

  for (const feature of collection.features) {
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    const ref = ridingRefFromFeature(properties, options.datasetId, options.datasetYear);
    if (!ridingMatches(ref, options.riding)) continue;

    const province = provinceFromFeature(properties);
    if (!province) return { ok: false, code: 'PROVINCE_UNKNOWN', ref };

    return { ok: true, ref, geometry: feature.geometry as GeoJSONGeometry, province };
  }

  return { ok: false, code: 'RIDING_NOT_FOUND' };
}

/**
 * Whether the address table has any rows for a province. `ODA_PROVINCES` is the allowlist the
 * lookup path is gated on, so a province absent from it is one whose addresses were never imported
 * — NL, NU and YT today. An area query there must say so rather than return an empty page that
 * reads as "no addresses here".
 */
export function hasAddressCoverage(env: Env, province: string): boolean {
  return getOdaConfig(env).provinces.includes(province.toUpperCase());
}

/**
 * The attribution notices the address sources require (W0 §4). Both are included because a result
 * set can mix ODA and NAR rows — NAR migrates city by city — so a per-record split would need the
 * source on every row and still not reduce what must be shown.
 */
export const AREA_ATTRIBUTION = [
  'Contains information licensed under the Open Government Licence – Canada.',
  'Adapted from Statistics Canada, National Address Register, 2026-06-26. This does not constitute an endorsement by Statistics Canada of this product.',
];

export interface AreaEnvelopeInput {  ref: RidingRef;
  query: { dataset: string; riding: string };
  records: AddressRecord[];
  page: { cursor: string | null; hasMore: boolean; truncated: boolean };
  /** Total matching records, or null when no exact count was affordable. */
  total: number | null;
  attribution: string[];
}

/**
 * The response body, per contract §5. `count.total` is labelled exact or estimated — never an
 * estimate presented as exact.
 */
export function buildAreaEnvelope(input: AreaEnvelopeInput): Record<string, unknown> {
  return {
    query: input.query,
    riding: input.ref,
    count: {
      returned: input.records.length,
      total: input.total,
      exact: input.total !== null,
    },
    records: input.records.map((record) => ({
      id: record.id,
      civicNumber: record.civic_number,
      streetName: record.street_name,
      streetType: record.street_type,
      streetDirection: record.street_direction,
      unit: record.unit,
      city: record.city,
      province: record.province,
      postalCode: record.postal_code,
      lat: record.lat,
      lon: record.lon,
      riding: input.ref,
    })),
    page: input.page,
    attribution: input.attribution,
    datasetId: input.ref.datasetId,
    datasetYear: input.ref.datasetYear,
  };
}
