/**
 * Lookup performance benchmarks for issue #8.
 *
 * Spatial micro-benchmark (offline):
 *   npm run benchmark:lookup
 *
 * HTTP comparison vs OpenNorth (requires local wrangler dev or deployed URL):
 *   npm run benchmark:lookup -- --http
 *   BENCHMARK_BASE_URL=https://your-worker.workers.dev npm run benchmark:lookup -- --http
 *
 * Autocomplete latency (/api/search), asserts the p95 budget:
 *   npm run benchmark:lookup -- --suggest
 *   BENCHMARK_SUGGEST_KEY=pk_live_... BENCHMARK_SUGGEST_ORIGIN=https://acme.com \
 *     BENCHMARK_BASE_URL=https://your-worker.workers.dev npm run benchmark:lookup -- --suggest
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
  const headers: Record<string, string> = {};
  const basicAuth = process.env.BENCHMARK_BASIC_AUTH;
  if (basicAuth) {
    headers.Authorization = `Basic ${Buffer.from(basicAuth).toString('base64')}`;
  }
  const start = performance.now();
  const response = await fetch(url, { headers });
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
    { name: '757 Victoria Park (geocoded)', lon: -79.288688, lat: 43.692101 },
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

/**
 * Autocomplete is the one path with a per-keystroke budget, so it gets its own mode and a hard
 * assertion. Scenarios follow the real typing ladder: the short-query short circuit, a broad
 * container query, a narrowed one, and a civic resolution (the only step that touches the 10M-row
 * address table).
 */
const SUGGEST_BUDGET_P95_MS = Number(process.env.BENCHMARK_SUGGEST_P95_MS ?? 100);

const SUGGEST_SCENARIOS: Array<{ name: string; q: string; note: string }> = [
  { name: 'below min length', q: 'ma', note: 'must not touch D1 at all' },
  { name: 'broad container', q: 'main', note: 'widest candidate window' },
  { name: 'narrowed container', q: 'main st tor', note: 'typical mid-typing state' },
  { name: 'civic resolution', q: '250 main st tor', note: 'the only step querying oda_addresses' },
  { name: 'no match', q: 'zzzz qqqq', note: 'empty result path' },
];

async function runSuggestBenchmark(): Promise<void> {
  const baseUrl = process.env.BENCHMARK_BASE_URL ?? DEFAULT_LOCAL_BASE;
  const iterations = Number(process.env.BENCHMARK_ITERATIONS ?? 10);
  const warmup = Number(process.env.BENCHMARK_WARMUP ?? 2);
  const key = process.env.BENCHMARK_SUGGEST_KEY;
  const origin = process.env.BENCHMARK_SUGGEST_ORIGIN;
  const province = process.env.BENCHMARK_SUGGEST_PROVINCE ?? 'ON';

  console.log('Autocomplete benchmark (/api/search)');
  console.log(`Base: ${baseUrl}`);
  console.log(`Budget: p95 < ${SUGGEST_BUDGET_P95_MS}ms`);
  console.log(`Iterations: ${iterations} (warmup ${warmup})\n`);

  // The KV cache makes a repeated query trivially fast and the number meaningless, so every
  // sample carries a cache-busting nonce. This measures the real path, not the cache.
  const failures: string[] = [];
  console.log('| Scenario | p50 | p95 | budget |');
  console.log('|----------|-----|-----|--------|');

  for (const scenario of SUGGEST_SCENARIOS) {
    const samples: number[] = [];
    let status = 0;

    for (let i = 0; i < warmup + iterations; i++) {
      const url = new URL(`${baseUrl}/api/search`);
      url.searchParams.set('q', scenario.q);
      url.searchParams.set('province', province);
      url.searchParams.set('_n', String(Date.now()) + i);
      if (key) url.searchParams.set('key', key);

      const started = performance.now();
      try {
        const response = await fetch(url.toString(), {
          headers: origin ? { Origin: origin } : {},
        });
        await response.arrayBuffer();
        status = response.status;
      } catch (error) {
        console.error(`  ${scenario.name} failed:`, error instanceof Error ? error.message : error);
        break;
      }
      if (i >= warmup) samples.push(performance.now() - started);
      await sleep(50);
    }

    if (!samples.length) {
      console.log(`| ${scenario.name} | error | error | — |`);
      failures.push(`${scenario.name}: no samples`);
      continue;
    }
    if (status >= 400) {
      console.log(`| ${scenario.name} | — | — | HTTP ${status} |`);
      failures.push(`${scenario.name}: HTTP ${status}`);
      continue;
    }

    const p50 = percentile(samples, 0.5);
    const p95 = percentile(samples, 0.95);
    const withinBudget = p95 < SUGGEST_BUDGET_P95_MS;
    if (!withinBudget) failures.push(`${scenario.name}: p95 ${p95.toFixed(1)}ms`);
    console.log(
      `| ${scenario.name} | ${p50.toFixed(1)}ms | ${p95.toFixed(1)}ms | ${withinBudget ? 'ok' : 'OVER'} |`
    );
  }

  console.log('\nNotes:');
  console.log('- Every request carries a nonce, so the KV cache never serves a sample.');
  console.log('- Against a deployed worker this measures RTT + D1, and RTT usually dominates:');
  console.log('  D1 has a single-region primary, so distance to it can exceed the whole budget.');

  if (failures.length) {
    console.error(`\nFAILED the p95 budget:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`\nAll scenarios within the ${SUGGEST_BUDGET_P95_MS}ms p95 budget.`);
}

async function main(): Promise<void> {
  const httpMode = process.argv.includes('--http');
  const suggestMode = process.argv.includes('--suggest');

  if (suggestMode) {
    await runSuggestBenchmark();
  } else if (httpMode) {
    await runHttpBenchmark();
  } else {
    await runSpatialBenchmark();
    console.log('\nRun HTTP comparison:   npm run benchmark:lookup -- --http');
    console.log('Run autocomplete p95:  npm run benchmark:lookup -- --suggest');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
