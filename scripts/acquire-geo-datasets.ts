#!/usr/bin/env npx tsx
/**
 * Acquire the municipal and sub-municipal boundary datasets from their official sources.
 *
 * Pulls each requested layer from the source's ArcGIS REST service, normalizes the
 * attributes to CanCoder's property contract, joins the French-language twin service
 * where the level has French names, and writes the result to `data/geo/<r2Key>` ready
 * for the R2 upload.
 *
 * Why ArcGIS REST and not the bulk-download zips: the official bulk hosts sit behind a
 * bot WAF (`www12.statcan.gc.ca` answers 403 "Security Check" to non-browser clients), and
 * a shapefile cannot be joined to a per-feature key without a shapefile reader. The REST
 * services serve the same geometry as GeoJSON with the source's own attributes intact.
 *
 * The dry run is the default: without `--execute` the script fetches, normalizes and
 * reports, but writes nothing. Nothing is overwritten unless `--force` is given.
 *
 * Pacing matters. The Statistics Canada service rate-limits aggressively and answers 403
 * or a disguised 500 when it decides the client is going too fast — and it keeps
 * refusing for a while afterwards. The script therefore pages in small batches, pauses
 * between pages, and backs off with multi-second delays. Do not lower these values
 * without a reason.
 *
 * Usage:
 *   npm run acquire:geo -- --level census-subdivision --level census-metropolitan
 *   npm run acquire:geo -- --source elections-canada-2025 --execute
 *   npm run acquire:geo -- --level federal-polling-division --max-features 500 --execute
 *   npm run acquire:geo -- --help
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { fetchArcGisLayer, arcgisFeaturesToGeoJSON } from '../src/arcgis';
import {
  GEO_SOURCES,
  geoLayerRef,
  getGeoSource,
  type GeoLayerSpec,
  type GeoLevel,
  type GeoSourceSpec,
} from '../src/geo-sources';
import {
  mergeFrenchProperties,
  normalizeGeoCollection,
  roundGeoCollection,
} from '../src/geo-normalize';
import { GEO_DATASETS } from '../src/geo-datasets';
import type { GeoJSONFeature } from '../src/types';

const DEFAULT_OUT_DIR = 'data/geo';
const PROVENANCE_FILE = 'PROVENANCE.json';
/**
 * Coordinate decimals kept in the written GeoJSON.
 *
 * Five decimals is about a metre — far finer than a point-in-polygon test needs — and
 * it roughly halves the size of the census layers, which are otherwise too large to
 * serve from R2 or insert into D1.
 */
const DEFAULT_PRECISION = 5;

const HELP = `
Acquire municipal and sub-municipal boundary datasets from official sources.

Usage:
  npm run acquire:geo -- [options]

Options:
  --source <id>          Only this source (repeatable). Default: all.
                         Ids: ${GEO_SOURCES.map((s) => s.id).join(', ')}
  --level <level>        Only this level (repeatable). Default: all registered levels.
  --execute              Write the output files. Without this the run is a dry run.
  --force                Overwrite an existing output file.
  --out-dir <path>       Output directory. Default: ${DEFAULT_OUT_DIR}
  --max-features <n>     Stop after n features per layer. For smoke tests.
  --precision <n>        Coordinate decimals to keep. Default: ${DEFAULT_PRECISION}
  --delay-ms <n>         Pause between pages, in milliseconds. Default: 1000
  --skip-french          Do not fetch or join the French-language service.
  --help                 Print this help.

Notes:
  - The dry run is the default; nothing is written without --execute.
  - A run also refreshes ${PROVENANCE_FILE} in the output directory, recording the
    source, licence, attribution, feature count and checksum of every dataset written.
`.trim();

interface AcquireOptions {
  sources: string[];
  levels: string[];
  execute: boolean;
  force: boolean;
  outDir: string;
  maxFeatures?: number;
  precision: number;
  delayMs: number;
  skipFrench: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): AcquireOptions {
  const options: AcquireOptions = {
    sources: [],
    levels: [],
    execute: false,
    force: false,
    outDir: DEFAULT_OUT_DIR,
    precision: DEFAULT_PRECISION,
    delayMs: 1000,
    skipFrench: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--source':
        options.sources.push(requireValue(argv, ++i, '--source'));
        break;
      case '--level':
        options.levels.push(requireValue(argv, ++i, '--level'));
        break;
      case '--execute':
        options.execute = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--out-dir':
        options.outDir = requireValue(argv, ++i, '--out-dir');
        break;
      case '--max-features': {
        const raw = requireValue(argv, ++i, '--max-features');
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error(`--max-features must be a positive integer, got '${raw}'`);
        }
        options.maxFeatures = parsed;
        break;
      }
      case '--precision': {
        const raw = requireValue(argv, ++i, '--precision');
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9) {
          throw new Error(`--precision must be between 0 and 9, got '${raw}'`);
        }
        options.precision = parsed;
        break;
      }
      case '--delay-ms': {
        const raw = requireValue(argv, ++i, '--delay-ms');
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error(`--delay-ms must be zero or more, got '${raw}'`);
        }
        options.delayMs = parsed;
        break;
      }
      case '--skip-french':
        options.skipFrench = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

/**
 * The levels or dataset codes to acquire.
 *
 * A level matches every vintage of it; a dataset code matches one specific vintage
 * (for example `pd2019`). An empty list means everything.
 */
function targetFilters(options: AcquireOptions): string[] {
  if (options.levels.length === 0) return [];
  const known = new Set<string>();
  for (const source of GEO_SOURCES) {
    for (const spec of source.layers) {
      known.add(spec.level);
      known.add(spec.datasetCode);
    }
  }
  for (const raw of options.levels) {
    const normalized = raw.trim().toLowerCase();
    if (!known.has(normalized)) {
      throw new Error(`Unknown level or dataset code '${raw}'. Known: ${[...known].sort().join(', ')}`);
    }
  }
  return options.levels.map((raw) => raw.trim().toLowerCase());
}

function selectedSources(options: AcquireOptions): GeoSourceSpec[] {
  if (options.sources.length === 0) return [...GEO_SOURCES];
  return options.sources.map((id) => {
    const source = getGeoSource(id);
    if (!source) {
      throw new Error(`Unknown source '${id}'. Known sources: ${GEO_SOURCES.map((s) => s.id).join(', ')}`);
    }
    return source;
  });
}

/**
 * The R2 key a dataset code is published under, taken from the serving registry.
 *
 * Returns `undefined` for a layer that has no registered dataset — for example a
 * level CanCoder already serves under a different code.
 */
function r2KeyForCode(code: string): string | undefined {
  return GEO_DATASETS.find((entry) => entry.code === code)?.r2Key;
}

interface AcquiredDataset {
  r2Key: string;
  level: GeoLevel;
  sourceId: string;
  sourceName: string;
  licenceId: string;
  licenceName: string;
  licenceUrl: string;
  attribution: string;
  features: number;
  bytes: number;
  sha256: string;
  fetchedAt: string;
}

async function acquireLayer(
  source: GeoSourceSpec,
  spec: GeoLayerSpec,
  options: AcquireOptions
): Promise<{ features: GeoJSONFeature[]; report: Omit<AcquiredDataset, 'r2Key' | 'level' | 'sourceId' | 'sourceName'> }> {
  const englishRef = geoLayerRef(spec, false);
  if (!englishRef) {
    throw new Error(`No English layer reference for ${spec.datasetCode}`);
  }

  const englishRaw = await fetchArcGisLayer(englishRef, {
    maxFeatures: options.maxFeatures,
    delayBetweenPagesMs: options.delayMs,
  });
  const english = arcgisFeaturesToGeoJSON(englishRaw);
  let features = normalizeGeoCollection(english.features, {
    level: spec.level,
    fields: spec.fields,
    nameProperty: spec.nameProperty,
  });

  if (spec.frenchFields && !options.skipFrench) {
    const frenchRef = geoLayerRef(spec, true);
    if (frenchRef) {
      const frenchRaw = await fetchArcGisLayer(frenchRef, {
        maxFeatures: options.maxFeatures,
        delayBetweenPagesMs: options.delayMs,
      });
      const french = arcgisFeaturesToGeoJSON(frenchRaw);
      features = mergeFrenchProperties(features, french.features, spec.frenchFields, spec.joinKey);
    }
  }

  features = roundGeoCollection(features, options.precision);

  const serialized = JSON.stringify({ type: 'FeatureCollection' as const, features });
  const report = {
    licenceId: source.licence.id,
    licenceName: source.licence.name,
    licenceUrl: source.licence.url,
    attribution: spec.attribution ?? source.licence.attribution,
    features: features.length,
    bytes: Buffer.byteLength(serialized, 'utf8'),
    sha256: createHash('sha256').update(serialized).digest('hex'),
    fetchedAt: new Date().toISOString(),
  };

  return { features, report };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(HELP);
    return;
  }

  const sources = selectedSources(options);
  const levels = targetFilters(options);
  const outDir = options.outDir;
  const acquired: AcquiredDataset[] = [];
  const failures: string[] = [];

  console.log(`source directories : ${GEO_SOURCES.map((s) => s.id).join(', ')}`);
  console.log(`selected sources   : ${sources.map((s) => s.id).join(', ')}`);
  console.log(`selected levels    : ${levels.join(', ')}`);
  console.log(`mode               : ${options.execute ? 'WRITE' : 'DRY RUN'}`);
  console.log(`output directory   : ${outDir}`);
  if (options.maxFeatures) {
    console.log(`feature cap        : ${options.maxFeatures} per layer`);
  }
  console.log('');

  for (const source of sources) {
    for (const spec of source.layers) {
      if (levels.length > 0 && !levels.includes(spec.level.toLowerCase()) && !levels.includes(spec.datasetCode.toLowerCase())) {
        continue;
      }

      const label = `${source.id}/${spec.datasetCode} (${spec.year})`;
      const r2Key = r2KeyForCode(spec.datasetCode);
      if (!r2Key) {
        console.log(`  SKIP  ${label.padEnd(44)} no dataset registered in src/geo-datasets.ts`);
        continue;
      }

      try {
        const { features, report } = await acquireLayer(source, spec, options);
        const payload = `${JSON.stringify({ type: 'FeatureCollection', features })}\n`;

        const target = join(outDir, r2Key);
        const exists = existsSync(target);
        if (exists && !options.force && options.execute) {
          console.log(`  SKIP  ${label} -> ${target} exists (use --force)`);
          continue;
        }

        if (options.execute) {
          mkdirSync(outDir, { recursive: true });
          writeFileSync(target, payload, { mode: 0o600 });
        }

        acquired.push({
          r2Key,
          level: spec.level,
          sourceId: source.id,
          sourceName: source.name,
          ...report,
        });

        console.log(
          `  ${options.execute ? 'WROTE' : 'READ '} ${label.padEnd(44)} ${String(report.features).padStart(7)} features  ` +
            `${(report.bytes / 1048576).toFixed(1).padStart(6)} MB  ${r2Key}`
        );
      } catch (error) {
        failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`  FAIL  ${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (options.execute && acquired.length > 0) {
    const provenancePath = join(outDir, PROVENANCE_FILE);
    const existing = existsSync(provenancePath)
      ? (JSON.parse(readFileSync(provenancePath, 'utf8')) as { datasets?: AcquiredDataset[] })
      : { datasets: [] };
    const merged = new Map<string, AcquiredDataset>();
    for (const entry of existing.datasets ?? []) merged.set(entry.r2Key, entry);
    for (const entry of acquired) merged.set(entry.r2Key, entry);
    const provenance = {
      schema: 1,
      generatedAt: new Date().toISOString(),
      datasets: [...merged.values()].sort((a, b) => a.r2Key.localeCompare(b.r2Key)),
    };
    mkdirSync(outDir, { recursive: true });
    writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, { mode: 0o600 });
    console.log('');
    console.log(`  provenance written to ${provenancePath}`);
  }

  console.log('');
  if (failures.length > 0) {
    console.error(`${failures.length} layer(s) failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  if (!options.execute) {
    console.log('Dry run complete. Re-run with --execute to write the output files.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
