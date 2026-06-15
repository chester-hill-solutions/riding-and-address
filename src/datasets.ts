import { Env } from './types';

export type DatasetStatus = 'live' | 'registered';

export interface FederalDataset {
  code: string;
  r2Key: string;
  name: string;
  year: number;
  path: string;
  aliases: readonly string[];
  status: DatasetStatus;
}

export interface ProvincialDataset {
  code: string;
  r2Key: string;
  name: string;
  year: number;
  path: string;
  aliases: readonly string[];
  status: DatasetStatus;
}

export type ProvincialPath = (typeof PROVINCIAL_DATASETS)[number]['path'];

export const FEDERAL_DATASET: FederalDataset = {
  code: 'federal',
  r2Key: 'federalridings-2024.geojson',
  name: 'Federal',
  year: 2024,
  path: '/api/federal',
  aliases: [],
  status: 'live',
};

export const PROVINCIAL_DATASETS: readonly ProvincialDataset[] = [
  { code: 'on', r2Key: 'ontarioridings-2022.geojson', name: 'Ontario', year: 2022, path: '/api/on', aliases: ['ON', 'ONT', 'ONTARIO'], status: 'live' },
  { code: 'qc', r2Key: 'quebecridings-2025.geojson', name: 'Quebec', year: 2025, path: '/api/qc', aliases: ['QC', 'QUE', 'QUEBEC', 'QUÉBEC'], status: 'live' },
  { code: 'bc', r2Key: 'bcridings-2022.geojson', name: 'British Columbia', year: 2022, path: '/api/bc', aliases: ['BC', 'B.C.', 'BRITISH COLUMBIA'], status: 'live' },
  { code: 'ab', r2Key: 'abridings-2022.geojson', name: 'Alberta', year: 2022, path: '/api/ab', aliases: ['AB', 'ALBERTA'], status: 'live' },
  { code: 'ns', r2Key: 'nsridings-2022.geojson', name: 'Nova Scotia', year: 2022, path: '/api/ns', aliases: ['NS', 'NOVA SCOTIA'], status: 'live' },
  { code: 'nb', r2Key: 'nbridings-2022.geojson', name: 'New Brunswick', year: 2022, path: '/api/nb', aliases: ['NB', 'NEW BRUNSWICK'], status: 'live' },
  { code: 'mb', r2Key: 'mbridings-2022.geojson', name: 'Manitoba', year: 2022, path: '/api/mb', aliases: ['MB', 'MANITOBA'], status: 'live' },
  { code: 'sk', r2Key: 'skridings-2022.geojson', name: 'Saskatchewan', year: 2022, path: '/api/sk', aliases: ['SK', 'SASKATCHEWAN'], status: 'live' },
  { code: 'nl', r2Key: 'nlridings-2022.geojson', name: 'Newfoundland and Labrador', year: 2022, path: '/api/nl', aliases: ['NL', 'NEWFOUNDLAND', 'NEWFOUNDLAND AND LABRADOR', 'LABRADOR'], status: 'live' },
  { code: 'pe', r2Key: 'peridings-2022.geojson', name: 'Prince Edward Island', year: 2022, path: '/api/pe', aliases: ['PE', 'PEI', 'PRINCE EDWARD ISLAND'], status: 'live' },
  { code: 'nt', r2Key: 'ntridings-2022.geojson', name: 'Northwest Territories', year: 2022, path: '/api/nt', aliases: ['NT', 'NWT', 'NORTHWEST TERRITORIES'], status: 'live' },
  { code: 'nu', r2Key: 'nuridings-2022.geojson', name: 'Nunavut', year: 2022, path: '/api/nu', aliases: ['NU', 'NUNAVUT'], status: 'live' },
  { code: 'yt', r2Key: 'ytridings-2022.geojson', name: 'Yukon', year: 2022, path: '/api/yt', aliases: ['YT', 'YUKON', 'YUKON TERRITORY'], status: 'live' },
];

export type RidingDatasetKey = typeof FEDERAL_DATASET.r2Key | (typeof PROVINCIAL_DATASETS)[number]['r2Key'];

export type WarmTarget = {
  pathname: string;
  r2Key: string;
};

function buildProvincePathMap(): Record<string, ProvincialPath> {
  const map: Record<string, ProvincialPath> = {};
  for (const dataset of PROVINCIAL_DATASETS) {
    for (const alias of dataset.aliases) {
      map[alias.toUpperCase()] = dataset.path;
    }
  }
  return map;
}

const PROV_TERR_TO_PROVINCE_PATH: Record<string, ProvincialPath> = buildProvincePathMap();

export function getAllR2Keys(): RidingDatasetKey[] {
  return [FEDERAL_DATASET.r2Key, ...PROVINCIAL_DATASETS.map((d) => d.r2Key)];
}

export function getLiveR2Keys(): RidingDatasetKey[] {
  const keys: RidingDatasetKey[] = [];
  if (FEDERAL_DATASET.status === 'live') {
    keys.push(FEDERAL_DATASET.r2Key);
  }
  for (const dataset of PROVINCIAL_DATASETS) {
    if (dataset.status === 'live') {
      keys.push(dataset.r2Key);
    }
  }
  return keys;
}

export function getLiveWarmTargets(): WarmTarget[] {
  const targets: WarmTarget[] = [];
  if (FEDERAL_DATASET.status === 'live') {
    targets.push({ pathname: FEDERAL_DATASET.path, r2Key: FEDERAL_DATASET.r2Key });
  }
  for (const dataset of PROVINCIAL_DATASETS) {
    if (dataset.status === 'live') {
      targets.push({ pathname: dataset.path, r2Key: dataset.r2Key });
    }
  }
  return targets;
}

export function getRouteForR2Key(key: RidingDatasetKey): string {
  if (key === FEDERAL_DATASET.r2Key) {
    return FEDERAL_DATASET.path;
  }
  const provincial = PROVINCIAL_DATASETS.find((d) => d.r2Key === key);
  return provincial?.path ?? FEDERAL_DATASET.path;
}

export function pickDataset(pathname: string): { r2Key: string } {
  if (pathname === '/api' || pathname === '/api/federal' || pathname === '/api/combined') {
    return { r2Key: FEDERAL_DATASET.r2Key };
  }
  const dataset = PROVINCIAL_DATASETS.find((d) => d.path === pathname);
  if (dataset) {
    return { r2Key: dataset.r2Key };
  }
  return { r2Key: FEDERAL_DATASET.r2Key };
}

export function getProvincialDatasetByPath(pathname: string): ProvincialDataset | undefined {
  return PROVINCIAL_DATASETS.find((d) => d.path === pathname);
}

export function getProvincialDatasetByCode(code: string): ProvincialDataset | undefined {
  return PROVINCIAL_DATASETS.find((d) => d.code === code.toLowerCase());
}

export function getAllProvincialPaths(): ProvincialPath[] {
  return PROVINCIAL_DATASETS.map((d) => d.path);
}

export function getAllProvincialDatasets(): readonly ProvincialDataset[] {
  return PROVINCIAL_DATASETS;
}

/**
 * Maps federal feature province field (PROV_TERR or PROV_CODE) to a provincial lookup path.
 */
export function provincePathFromFederalProperties(
  properties: Record<string, unknown> | null | undefined
): ProvincialPath | null {
  if (!properties) return null;
  const raw = properties.PROV_TERR ?? properties.PROV_CODE;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const key = raw
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return PROV_TERR_TO_PROVINCE_PATH[key] ?? null;
}

export type DatasetAvailability = {
  key: RidingDatasetKey;
  route: string;
  status: DatasetStatus;
  present: boolean;
};

/**
 * Head-check each registered riding dataset in R2 (does not download full GeoJSON).
 */
export async function checkRidingDatasets(env: Env): Promise<DatasetAvailability[]> {
  const results: DatasetAvailability[] = [];

  const entries: Array<{ key: RidingDatasetKey; route: string; status: DatasetStatus }> = [
    { key: FEDERAL_DATASET.r2Key, route: FEDERAL_DATASET.path, status: FEDERAL_DATASET.status },
    ...PROVINCIAL_DATASETS.map((d) => ({ key: d.r2Key, route: d.path, status: d.status })),
  ];

  for (const entry of entries) {
    let present = false;
    try {
      const head = await env.RIDINGS.head(entry.key);
      present = head !== null;
    } catch {
      present = false;
    }
    results.push({
      key: entry.key,
      route: entry.route,
      status: entry.status,
      present,
    });
  }

  return results;
}

export function allRequiredDatasetsPresent(datasets: DatasetAvailability[]): boolean {
  return datasets.filter((d) => d.status === 'live').every((d) => d.present);
}

export function missingDatasetKeys(datasets: DatasetAvailability[]): RidingDatasetKey[] {
  return datasets.filter((d) => d.status === 'live' && !d.present).map((d) => d.key);
}
