/**
 * Lookup performance benchmarks for issue #8.
 *
 * Spatial micro-benchmark (offline):
 *   npm run benchmark:lookup
 *
 * HTTP comparison vs OpenNorth (requires local wrangler dev or deployed URL):
 *   npm run benchmark:lookup -- --http
 *   BENCHMARK_BASE_URL=https://your-worker.workers.dev npm run benchmark:lookup -- --http
 */
import { createSpatialIndex, findCandidateFeatures } from '../src/spatial';
import type { GeoJSONFeature, GeoJSONFeatureCollection } from '../src/types';

const OPENNORTH_BASE = 'https://represent.opennorth.ca';
const DEFAULT_LOCAL_BASE = 'http://localhost:8787';

type HttpScenario = {
  name: string;
  path: string;
  openNorthPath?: string;
};

const HTTP_SCENARIOS: HttpScenario[] = [
  {
    name: 'federal warm (lat/lon)',
    path: '/api/federal?lat=43.6431&lon=-79.3991',
    openNorthPath: '/postcodes/M5V2T6/?sets=federal-electoral-districts',
  },
  {
    name: 'combined warm (lat/lon)',
    path: '/api/combined?lat=43.6431&lon=-79.3991',
  },
  {
    name: 'federal postal (lookup cache)',
    path: '/api/federal?postal=M5V2T6',
    openNorthPath: '/postcodes/M5V2T6/?sets=federal-electoral-districts',
  },
  {
    name: 'combined postal',
    path: '/api/combined?postal=M5V2T6',
    openNorthPath: '/postcodes/M5V2T6/',
  },
  {
    name: 'federal + municipality',
    path: '/api/federal?postal=M5V2T6&return=municipality',
  },
];

function createPolygonFeature(coords: number[][][], properties: Record<string, unknown> = {}): GeoJSONFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: coords },
    properties,
  };
}

function buildFixtureCollection(size: number): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = [];
  const grid = Math.ceil(Math.sqrt(size));
  for (let i = 0; i < size; i++) {
    const row = Math.floor(i / grid);
    const col = i % grid;
    const x = col * 0.1;
    const y = row * 0.1;
    features.push(
      createPolygonFeature(
        [[[x, y], [x + 0.08, y], [x + 0.08, y + 0.08], [x, y + 0.08], [x, y]]],
        { id: i }
      )
    );
  }
  return { type: 'FeatureCollection', features };
}

function benchmark(label: string, iterations: number, fn: () => void): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const elapsed = performance.now() - start;
  const perOp = elapsed / iterations;
  console.log(`${label}: ${perOp.toFixed(3)}ms/op (${iterations} iterations, ${elapsed.toFixed(1)}ms total)`);
  return perOp;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function timeHttpRequest(url: string): Promise<number> {
  const start = performance.now();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  await response.text();
  return performance.now() - start;
}

async function benchmarkHttpUrl(label: string, url: string, iterations: number, warmup: number): Promise<number> {
  for (let i = 0; i < warmup; i++) {
    await timeHttpRequest(url);
    await sleep(150);
  }
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    samples.push(await timeHttpRequest(url));
    await sleep(150);
  }
  const p50 = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  console.log(
    `${label}: p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms min=${Math.min(...samples).toFixed(1)}ms max=${Math.max(...samples).toFixed(1)}ms`
  );
  return p50;
}

async function runSpatialBenchmark(): Promise<void> {
  const collection = buildFixtureCollection(500);
  const index = createSpatialIndex(collection);
  const points = [
    { name: 'Toronto', lon: -79.3832, lat: 43.6532 },
    { name: '757 Victoria Park fixture', lon: -79.3124, lat: 43.6891 },
    { name: 'Montreal', lon: -73.5673, lat: 45.5017 },
  ];

  console.log('Riding lookup spatial index benchmark');
  console.log(`Features indexed: ${collection.features.length}\n`);

  for (const point of points) {
    benchmark(`candidate lookup @ ${point.name}`, 1000, () => {
      findCandidateFeatures(point.lon, point.lat, index);
    });
  }
}

async function runHttpBenchmark(): Promise<void> {
  const baseUrl = (process.env.BENCHMARK_BASE_URL ?? DEFAULT_LOCAL_BASE).replace(/\/$/, '');
  const iterations = Number(process.env.BENCHMARK_ITERATIONS ?? 10);
  const warmup = Number(process.env.BENCHMARK_WARMUP ?? 2);

  console.log(`HTTP lookup benchmark (issue #8)`);
  console.log(`Local base: ${baseUrl}`);
  console.log(`OpenNorth: ${OPENNORTH_BASE}`);
  console.log(`Iterations: ${iterations} (warmup ${warmup})\n`);

  console.log('| Scenario | Riding Lookup p50 | OpenNorth p50 |');
  console.log('|----------|-------------------|---------------|');

  for (const scenario of HTTP_SCENARIOS) {
    const localUrl = `${baseUrl}${scenario.path}`;
    let localP50 = NaN;
    let openNorthP50 = NaN;

    try {
      localP50 = await benchmarkHttpUrl(`local ${scenario.name}`, localUrl, iterations, warmup);
    } catch (error) {
      console.error(`local ${scenario.name} failed:`, error instanceof Error ? error.message : error);
    }

    if (scenario.openNorthPath) {
      try {
        openNorthP50 = await benchmarkHttpUrl(
          `opennorth ${scenario.name}`,
          `${OPENNORTH_BASE}${scenario.openNorthPath}`,
          iterations,
          warmup
        );
      } catch (error) {
        console.error(`opennorth ${scenario.name} failed:`, error instanceof Error ? error.message : error);
      }
    }

    const localCell = Number.isFinite(localP50) ? `${localP50.toFixed(1)}ms` : 'error';
    const onCell = Number.isFinite(openNorthP50) ? `${openNorthP50.toFixed(1)}ms` : '—';
    console.log(`| ${scenario.name} | ${localCell} | ${onCell} |`);
    console.log('');
  }

  console.log('Notes:');
  console.log('- Warm lat/lon requests measure lookup cache + spatial index (no geocoding).');
  console.log('- Postal requests hit lookup KV after first geocode; first request is dominated by geocoding.');
  console.log('- OpenNorth uses pre-indexed postcodes; compare warm-cache postal for parity.');
}

async function main(): Promise<void> {
  const httpMode = process.argv.includes('--http');

  if (httpMode) {
    await runHttpBenchmark();
  } else {
    await runSpatialBenchmark();
    console.log('\nRun HTTP comparison: npm run benchmark:lookup -- --http');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
