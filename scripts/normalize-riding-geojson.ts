/**
 * Normalize a riding boundary GeoJSON file for Riding Lookup R2 upload.
 *
 * Usage:
 *   npx tsx scripts/normalize-riding-geojson.ts --code BC --input raw.geojson --output data/ridings/bcridings-2022.geojson
 */
import { readFileSync, writeFileSync } from 'fs';

type GeoJsonFeature = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: unknown;
};

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
};

const NAME_FIELDS = [
  'ENGLISH_NAME',
  'ENGLISH_NA',
  'NAME_EN',
  'FED_NAME',
  'ED_NAMEE',
  'ED_NAME',
  'NM_CEP',
  'DIST_NAME',
  'DISTRICT',
  'DISTRICT_N',
  'DISTRICT_NAME',
  'ED',
  'ED_LABEL',
  'NAME',
] as const;

function parseArgs(argv: string[]): { code: string; input: string; output: string } {
  let code = '';
  let input = '';
  let output = '';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--code') code = argv[++i] ?? '';
    else if (arg === '--input') input = argv[++i] ?? '';
    else if (arg === '--output') output = argv[++i] ?? '';
  }
  if (!code || !input || !output) {
    console.error('Usage: npx tsx scripts/normalize-riding-geojson.ts --code BC --input in.geojson --output out.geojson');
    process.exit(1);
  }
  return { code: code.toUpperCase(), input, output };
}

function ridingNameFromProps(properties: Record<string, unknown>): string | undefined {
  for (const field of NAME_FIELDS) {
    const value = properties[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const upper = key.toUpperCase();
    if (upper.includes('NAME') || upper.includes('DISTRICT') || upper.includes('DIST')) {
      return value.trim();
    }
  }
  return undefined;
}

function main(): void {
  const { code, input, output } = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(readFileSync(input, 'utf8')) as GeoJsonFeatureCollection;
  if (raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
    throw new Error('Input must be a GeoJSON FeatureCollection');
  }

  const features: GeoJsonFeature[] = [];
  for (const feature of raw.features) {
    const props = { ...(feature.properties ?? {}) };
    const name = ridingNameFromProps(props);
    if (!name) {
      throw new Error(`Feature missing riding name; keys: ${Object.keys(props).join(', ')}`);
    }
    features.push({
      type: 'Feature',
      properties: {
        ENGLISH_NAME: name,
        PROV_TERR: code,
      },
      geometry: feature.geometry,
    });
  }

  const out: GeoJsonFeatureCollection = { type: 'FeatureCollection', features };
  writeFileSync(output, JSON.stringify(out));
  console.log(`Wrote ${output}: ${features.length} features (PROV_TERR=${code})`);
}

main();
