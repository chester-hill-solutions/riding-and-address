import { Env } from './types';

/** R2 object keys for boundary GeoJSON datasets. */
export const RIDING_DATASET_KEYS = [
  'federalridings-2024.geojson',
  'quebecridings-2025.geojson',
  'ontarioridings-2022.geojson',
] as const;

export type RidingDatasetKey = (typeof RIDING_DATASET_KEYS)[number];

export const RIDING_DATASET_ROUTES: Record<RidingDatasetKey, string> = {
  'federalridings-2024.geojson': '/api/federal',
  'quebecridings-2025.geojson': '/api/qc',
  'ontarioridings-2022.geojson': '/api/on',
};

export type DatasetAvailability = {
  key: RidingDatasetKey;
  route: string;
  present: boolean;
};

/**
 * Head-check each required riding dataset in R2 (does not download full GeoJSON).
 */
export async function checkRidingDatasets(env: Env): Promise<DatasetAvailability[]> {
  const results: DatasetAvailability[] = [];

  for (const key of RIDING_DATASET_KEYS) {
    let present = false;
    try {
      const head = await env.RIDINGS.head(key);
      present = head !== null;
    } catch {
      present = false;
    }
    results.push({
      key,
      route: RIDING_DATASET_ROUTES[key],
      present,
    });
  }

  return results;
}

export function allRequiredDatasetsPresent(datasets: DatasetAvailability[]): boolean {
  return datasets.every((d) => d.present);
}

export function missingDatasetKeys(datasets: DatasetAvailability[]): RidingDatasetKey[] {
  return datasets.filter((d) => !d.present).map((d) => d.key);
}
