/**
 * Normalization from upstream boundary attributes to CanCoder's property contract.
 *
 * Every dataset CanCoder serves answers the same question in the same shape, so the
 * normalizer has one job: turn whatever the source published into a flat property bag
 * that carries, at minimum,
 *
 *   - `ENGLISH_NAME` — the display name of the unit, which is what the lookup's `riding`
 *     field reports and what `ridingNameFromProperties` resolves;
 *   - `PROV_TERR` — the two-letter province code, which is what
 *     `provincePathFromFederalProperties` uses to route a federal result to its
 *     provincial dataset;
 *   - the level's own identity fields (`CSDUID`, `CMAUID`, `FED_NUM`, `PD_NUM`, …).
 *
 * French names are a second pass: the English census layers carry none, so the French
 * service is joined on `DGUID` and the French name is attached as `<NAME>_FR`.
 *
 * Everything here is pure — no network, no filesystem — so the rules are unit-testable
 * without touching the acquisition pipeline.
 */

import type { GeoJSONFeature, GeoJSONGeometry } from './types';
import { provinceCodeFromProvNum, type GeoLevel } from './geo-sources';

export interface NormalizeGeoOptions {
  /** The level being normalized. */
  level: GeoLevel;
  /** Source attribute -> CanCoder property. */
  fields: Readonly<Record<string, string>>;
  /** CanCoder property the unit's own name lives in. */
  nameProperty: string;
}

/**
 * Normalizes one feature's attributes.
 *
 * The province is derived rather than copied: the census layers carry `PRUID` and the
 * electoral layers carry `FED_NUM`, and both encode the province in the leading digits.
 */
export function normalizeGeoProperties(
  source: Record<string, unknown>,
  options: NormalizeGeoOptions
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  for (const [sourceField, targetField] of Object.entries(options.fields)) {
    if (!(sourceField in source)) continue;
    const value = source[sourceField];
    if (value === null || value === undefined) continue;
    properties[targetField] = value;
  }

  const province = provinceCodeFromProvNum(properties.PRUID ?? properties.FED_NUM);
  if (province) {
    properties.PROV_TERR = province;
  }

  const displayName = displayNameFor(properties, options);
  if (displayName) {
    properties.ENGLISH_NAME = displayName;
  }

  return properties;
}

/**
 * The display name for a normalized unit.
 *
 * A polling division is the awkward case: it has no name of its own, only a number that
 * is unique inside its electoral district. The useful label is the riding name qualified
 * by the division number — "Ajax — PD 20-083" — because a bare "20-083" means nothing
 * without the riding.
 */
export function displayNameFor(
  properties: Record<string, unknown>,
  options: NormalizeGeoOptions
): string | undefined {
  const ownName = properties[options.nameProperty];

  if (options.level === 'federal-polling-division') {
    const division = typeof ownName === 'string' ? ownName.trim() : '';
    const riding = typeof properties.ED_NAMEE === 'string' ? properties.ED_NAMEE.trim() : '';
    if (riding && division) return `${riding} — PD ${division}`;
    if (division) return `PD ${division}`;
    if (riding) return riding;
    return undefined;
  }

  if (typeof ownName === 'string' && ownName.trim()) {
    return ownName.trim();
  }
  return undefined;
}

/**
 * Attaches French-language properties to the English features.
 *
 * The French service publishes the same layers under French field names, so the French
 * features are translated through `frenchFields` first — French source attribute ->
 * CanCoder property — and the two sets are then joined on the CanCoder join key.
 *
 * Only properties that are not already present are copied, so the English feature's own
 * values are never overwritten by a French-service value that means something subtly
 * different. A join key that is missing or duplicated is skipped rather than guessed: a
 * wrong French name is worse than no French name.
 */
export function mergeFrenchProperties(
  features: GeoJSONFeature[],
  frenchFeatures: GeoJSONFeature[],
  frenchFields: Readonly<Record<string, string>>,
  joinKey: string
): GeoJSONFeature[] {
  if (Object.keys(frenchFields).length === 0) return features;

  const index = new Map<string, Record<string, unknown>>();
  for (const frenchFeature of frenchFeatures) {
    const translated: Record<string, unknown> = {};
    for (const [sourceField, targetField] of Object.entries(frenchFields)) {
      const value = frenchFeature.properties?.[sourceField];
      if (value === null || value === undefined) continue;
      translated[targetField] = value;
    }
    const key = translated[joinKey];
    if (typeof key !== 'string' || !key.trim()) continue;
    const normalized = key.trim();
    if (index.has(normalized)) continue;
    index.set(normalized, translated);
  }

  return features.map((feature) => {
    const key = feature.properties?.[joinKey];
    if (typeof key !== 'string' || !key.trim()) return feature;
    const french = index.get(key.trim());
    if (!french) return feature;

    const merged: Record<string, unknown> = { ...feature.properties };
    let changed = false;
    for (const [targetField, value] of Object.entries(french)) {
      if (merged[targetField] !== undefined) continue;
      merged[targetField] = value;
      changed = true;
    }
    return changed ? { ...feature, properties: merged } : feature;
  });
}

/**
 * Normalizes a whole feature collection.
 *
 * The `nameProperty` is resolved from the level's field map, so the caller does not have
 * to repeat it.
 */
export function normalizeGeoCollection(
  features: GeoJSONFeature[],
  options: NormalizeGeoOptions
): GeoJSONFeature[] {
  return features.map((feature) => ({
    ...feature,
    properties: normalizeGeoProperties(feature.properties ?? {}, options),
  }));
}

/**
 * Rounds every coordinate in a geometry to `decimals` places.
 *
 * The census boundary layers are large: the full census-subdivision layer is a few
 * hundred megabytes of GeoJSON, which is too big to serve comfortably from R2 and too
 * big to insert into D1. At five decimal places a coordinate is about a metre — far finer
 * than the point-in-polygon test needs, since a point more than a metre from a
 * municipality boundary is inside the same municipality either way — and the file drops
 * by roughly half.
 */
export function roundGeometryCoordinates(geometry: GeoJSONGeometry, decimals: number): GeoJSONGeometry {
  const factor = 10 ** decimals;
  const round = (value: unknown): unknown => {
    if (typeof value === 'number') return Math.round(value * factor) / factor;
    if (Array.isArray(value)) return value.map(round);
    return value;
  };
  return {
    ...geometry,
    coordinates: round(geometry.coordinates) as typeof geometry.coordinates,
  };
}

/** Rounds every feature's geometry. */
export function roundGeoCollection(
  features: GeoJSONFeature[],
  decimals: number
): GeoJSONFeature[] {
  return features.map((feature) => ({
    ...feature,
    geometry: roundGeometryCoordinates(feature.geometry, decimals),
  }));
}

/** A human label for a level, used in logs, docs and the `dataset` response field. */
export function geoLevelLabel(level: GeoLevel): string {
  switch (level) {
    case 'census-division':
      return 'Census Division';
    case 'census-division-subdivision':
      return 'Census Division Subdivision';
    case 'census-subdivision':
      return 'Census Subdivision';
    case 'census-metropolitan':
      return 'Census Metropolitan Area';
    case 'forward-sortation-area':
      return 'Forward Sortation Area';
    case 'dissemination-area':
      return 'Dissemination Area';
    case 'federal-electoral-district':
      return 'Federal Electoral District';
    case 'federal-polling-division':
      return 'Federal Polling Division';
  }
}
