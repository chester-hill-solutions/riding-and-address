/**
 * The registry of geographic levels CanCoder serves beyond ridings.
 *
 * A "geo dataset" is any boundary set that answers "what is this point inside" for a
 * level other than a riding: a census subdivision (the municipality), a census
 * metropolitan area, a census division, a forward sortation area (the postal-code
 * region), or a federal polling division.
 *
 * The registry is deliberately separate from `PROVINCIAL_DATASETS`. A provincial dataset
 * is a riding in one province and its `aliases` feed the `PROV_TERR` -> route map; a geo
 * dataset is a national level with no province of its own. Mixing the two would make the
 * alias map lie.
 *
 * `status` follows the same rule as the riding registry: `live` means the data is in R2
 * and the route is expected to answer; `registered` means the route exists and is
 * documented but the data has not been acquired yet, in which case a lookup returns
 * `DATASET_UNAVAILABLE` rather than a 500.
 */

import type { GeoLevel } from './geo-sources';

/**
 * Whether a dataset is expected to answer.
 *
 * Defined here rather than in `./datasets` so the dependency runs one way: the riding
 * registry imports this module, never the reverse. `./datasets` re-exports the type so
 * every existing importer is unaffected.
 */
export type DatasetStatus = 'live' | 'registered';

export interface GeoDataset {
  /** Short code, used in the route (`/api/csd`) and in dataset pins. */
  code: string;
  /** R2 object key holding the normalized GeoJSON. */
  r2Key: string;
  /** Display name, reported in the `dataset` response field. */
  name: string;
  /** Data vintage. */
  year: number;
  /** Public route that answers this level. */
  path: string;
  /** Alternative spellings accepted for the level. */
  aliases: readonly string[];
  /** The geographic level this dataset represents. */
  level: GeoLevel;
  status: DatasetStatus;
}

export const GEO_DATASETS = [
  {
    code: 'csd',
    r2Key: 'census-subdivisions-2016.geojson',
    name: 'Census Subdivision',
    year: 2016,
    path: '/api/csd',
    aliases: ['CSD', 'MUNICIPALITY', 'MUNI', 'CENSUS SUBDIVISION'] as readonly string[],
    level: 'census-subdivision',
    status: 'registered' as DatasetStatus,
  },
  {
    code: 'cd',
    r2Key: 'census-divisions-2016.geojson',
    name: 'Census Division',
    year: 2016,
    path: '/api/cd',
    aliases: ['CD', 'CENSUS DIVISION'] as readonly string[],
    level: 'census-division',
    status: 'registered' as DatasetStatus,
  },
  {
    code: 'cma',
    r2Key: 'census-metropolitan-areas-2021.geojson',
    name: 'Census Metropolitan Area',
    year: 2021,
    path: '/api/cma',
    aliases: ['CMA', 'METRO', 'METROPOLITAN', 'CENSUS METROPOLITAN AREA'] as readonly string[],
    level: 'census-metropolitan',
    status: 'registered' as DatasetStatus,
  },
  {
    code: 'pd',
    r2Key: 'federal-polling-divisions-2025.geojson',
    name: 'Federal Polling Division',
    year: 2025,
    path: '/api/pd',
    aliases: ['PD', 'POLLING DIVISION', 'PRECINCT'] as readonly string[],
    level: 'federal-polling-division',
    status: 'registered' as DatasetStatus,
  },
  {
    code: 'pd2021',
    r2Key: 'federal-polling-divisions-2021.geojson',
    name: 'Federal Polling Division (2021)',
    year: 2021,
    path: '/api/pd/2021',
    aliases: ['PD2021'] as readonly string[],
    level: 'federal-polling-division',
    status: 'registered' as DatasetStatus,
  },
  {
    code: 'pd2019',
    r2Key: 'federal-polling-divisions-2019.geojson',
    name: 'Federal Polling Division (2019)',
    year: 2019,
    path: '/api/pd/2019',
    aliases: ['PD2019'] as readonly string[],
    level: 'federal-polling-division',
    status: 'registered' as DatasetStatus,
  },
  {
    code: 'pd2015',
    r2Key: 'federal-polling-divisions-2015.geojson',
    name: 'Federal Polling Division (2015)',
    year: 2015,
    path: '/api/pd/2015',
    aliases: ['PD2015'] as readonly string[],
    level: 'federal-polling-division',
    status: 'registered' as DatasetStatus,
  },
] as const satisfies readonly GeoDataset[];

/** Every geo dataset that has its data in R2 and is expected to answer. */
export function getLiveGeoDatasets(): readonly GeoDataset[] {
  return GEO_DATASETS.filter((dataset) => dataset.status === 'live');
}

/** The routes served for live geo datasets. */
export function getLiveGeoPaths(): string[] {
  return getLiveGeoDatasets().map((dataset) => dataset.path);
}

/**
 * Every geo route, live or registered.
 *
 * The route exists either way: a registered-but-unacquired level answers
 * `DATASET_UNAVAILABLE` rather than 404-not-found, so the surface is stable and
 * discoverable while the data is still being acquired.
 */
export function getAllGeoPaths(): string[] {
  return GEO_DATASETS.map((dataset) => dataset.path);
}

/** The geo dataset a path resolves to, live or registered. */
export function getGeoDatasetByPath(pathname: string): GeoDataset | undefined {
  return GEO_DATASETS.find((dataset) => dataset.path === pathname);
}

/** The geo dataset a code resolves to. */
export function getGeoDatasetByCode(code: string): GeoDataset | undefined {
  const normalized = code.trim().toLowerCase();
  return GEO_DATASETS.find(
    (dataset) => dataset.code === normalized || dataset.aliases.includes(code.trim().toUpperCase())
  );
}

/** The geo dataset an R2 key resolves to. */
export function getGeoDatasetByR2Key(key: string): GeoDataset | undefined {
  return GEO_DATASETS.find((dataset) => dataset.r2Key === key);
}

/** Every geo R2 key, live or registered. */
export function getAllGeoR2Keys(): string[] {
  return GEO_DATASETS.map((dataset) => dataset.r2Key);
}
