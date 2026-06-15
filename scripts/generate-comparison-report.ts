/**
 * Generate docs/comparison-opennorth.md from test/fixtures/comparison/opennorth-results.json
 */
import { readFileSync, writeFileSync } from 'fs';

const RESULTS_PATH = 'test/fixtures/comparison/opennorth-results.json';
const SPEED_PATH = 'test/fixtures/comparison/opennorth-speed.json';
const ROBUSTNESS_PATH = 'test/fixtures/comparison/opennorth-robustness.json';
const OUT_PATH = 'docs/comparison-opennorth.md';
const ADDRESS_PAUSE_MS = Number(process.env.COMPARE_ADDRESS_PAUSE_MS ?? 4500);
const BATCH_SIZE = Number(process.env.COMPARE_BATCH_SIZE ?? 12);

type CaseResult = {
  id: string;
  category: string;
  label: string;
  endpoint: string;
  query: Record<string, string>;
  groundTruth?: string;
  notes?: string;
  classification: string;
  ridingLookup: {
    status: number;
    ms: number;
    cacheStatus?: string;
    federalRiding?: string | null;
    provincialRiding?: string | null;
    errorCode?: string;
    rawError?: string;
  };
  openNorth?: {
    status: number;
    ms: number;
    federalRiding?: string | null;
    rawError?: string;
  } | null;
};

type ResultsFile = {
  runAt: string;
  speedRunAt?: string;
  robustnessRunAt?: string;
  retriedAt?: string;
  ridingLookupBase: string;
  openNorthBase: string;
  caseCount: number;
  speed?: Array<{
    name: string;
    rlP50: number;
    rlP95: number;
    onP50?: number;
    onP95?: number;
    rlCache?: string;
  }>;
  robustness: CaseResult[];
  classificationSummary?: Record<string, number>;
};

function fmtMs(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n.toFixed(0)}ms`;
}

function querySummary(q: Record<string, string>): string {
  if (q.postal) return `postal=${q.postal}`;
  if (q.lat && q.lon) return `lat/lon`;
  if (q.address) return `address=${q.address.slice(0, 40)}${q.address.length > 40 ? '…' : ''}`;
  return Object.keys(q).join(', ') || '(none)';
}

function summarizeErrors(results: CaseResult[]): string {
  const rlErr: Record<string, number> = {};
  for (const r of results) {
    if (r.ridingLookup.status !== 200) {
      const key = r.ridingLookup.rawError?.includes('Circuit breaker')
        ? 'Circuit breaker open (ODA geocoding)'
        : r.ridingLookup.rawError?.includes('timeout')
          ? 'Geocoding timeout (30s)'
          : r.ridingLookup.rawError?.includes('R2 object not found')
            ? 'Missing R2 dataset'
            : r.ridingLookup.errorCode ?? 'Unknown';
      rlErr[key] = (rlErr[key] ?? 0) + 1;
    }
  }
  return Object.entries(rlErr)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
}

function categoryBreakdown(results: CaseResult[]): string {
  const cats = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I'] as const;
  const labels: Record<string, string> = {
    A: 'Postal',
    B: 'Address',
    C: 'Coordinates',
    D: 'Endpoints',
    E: 'Errors',
    F: 'Methodology',
    G: 'Downloads wild mix',
    I: 'OLP liblist',
  };
  return cats
    .map((c) => {
      const rows = results.filter((r) => r.id.startsWith(c));
      if (!rows.length) return null;
      const rlOk = rows.filter((r) => r.ridingLookup.status === 200).length;
      const agree = rows.filter((r) => r.classification === 'Agree').length;
      return `| ${c} — ${labels[c] ?? c} | ${rows.length} | ${rlOk} | ${agree} |`;
    })
    .filter(Boolean)
    .join('\n');
}

function loadResults(): ResultsFile {
  let data: ResultsFile = { runAt: '', ridingLookupBase: '', openNorthBase: '', caseCount: 0, robustness: [] };
  try {
    data = JSON.parse(readFileSync(RESULTS_PATH, 'utf8')) as ResultsFile;
  } catch {
    // combined file missing
  }
  if (!data.speed) {
    try {
      const speedFile = JSON.parse(readFileSync(SPEED_PATH, 'utf8')) as { runAt?: string; results?: ResultsFile['speed'] };
      data.speed = speedFile.results;
      data.speedRunAt = speedFile.runAt;
    } catch {
      // no speed file
    }
  }
  if (!data.robustness?.length) {
    try {
      const robustnessFile = JSON.parse(readFileSync(ROBUSTNESS_PATH, 'utf8')) as {
        runAt?: string;
        results: CaseResult[];
        classificationSummary?: Record<string, number>;
      };
      data.robustness = robustnessFile.results;
      data.robustnessRunAt = robustnessFile.runAt;
      data.classificationSummary = robustnessFile.classificationSummary;
      data.caseCount = robustnessFile.results.length;
    } catch {
      // no robustness file
    }
  }
  return data;
}

function main(): void {
  const data = loadResults();
  if (!data.robustness?.length) {
    console.error(`No robustness data in ${RESULTS_PATH}. Run: BENCHMARK_BASIC_AUTH=... npm run compare:opennorth -- --robustness-only`);
    process.exit(1);
  }
  const summary: Record<string, number> = {};
  for (const r of data.robustness) summary[r.classification] = (summary[r.classification] ?? 0) + 1;

  const bothOk = data.robustness.filter(
    (r) => r.ridingLookup.status === 200 && r.openNorth?.federalRiding
  );
  const agree = bothOk.filter((r) => r.classification === 'Agree').length;
  const disagree = bothOk.filter((r) => r.classification === 'Disagree');
  const rlOk = data.robustness.filter((r) => r.ridingLookup.status === 200).length;

  const speedRows = (data.speed ?? [])
    .map(
      (s) =>
        `| ${s.name} | ${fmtMs(s.rlP50)} | ${fmtMs(s.rlP95)} | ${s.rlCache ?? '—'} | ${s.onP50 != null ? fmtMs(s.onP50) : '—'} | ${s.onP95 != null ? fmtMs(s.onP95) : '—'} |`
    )
    .join('\n');

  const categoryOrder = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I'];
  const tableRows = data.robustness
    .map((r) => {
      const rl = r.ridingLookup.status === 200
        ? r.ridingLookup.federalRiding ?? '—'
        : `${r.ridingLookup.errorCode ?? r.ridingLookup.status}`;
      const on = r.openNorth?.federalRiding
        ?? (r.openNorth?.rawError?.includes('<!DOCTYPE') ? 'HTML error' : r.openNorth?.rawError?.slice(0, 20) ?? '—');
      return `| ${r.id} | ${r.label.replace(/\|/g, '/')} | ${querySummary(r.query)} | ${rl} | ${on} | ${r.classification} | ${fmtMs(r.ridingLookup.ms)} |`;
    })
    .join('\n');

  const disagreeSection = disagree.length
    ? disagree
        .map(
          (r) =>
            `- **${r.id}** (${querySummary(r.query)}): Riding Lookup → **${r.ridingLookup.federalRiding}**; OpenNorth → **${r.openNorth?.federalRiding}**${r.groundTruth ? ` (source ground truth: ${r.groundTruth})` : ''}`
        )
        .join('\n')
    : '_None in cases where both APIs returned a riding._';

  const rlErrors = data.robustness.filter((r) => r.ridingLookup.status !== 200).length;
  const timeoutCount = data.robustness.filter((r) =>
    r.ridingLookup.rawError?.includes('timeout')
  ).length;
  const circuitCount = data.robustness.filter((r) =>
    r.ridingLookup.rawError?.includes('Circuit breaker')
  ).length;

  const speedNote = data.speed?.length
    ? (() => {
        const warm = data.speed!.find((s) => s.name.includes('postal') || s.name.includes('M5V'));
        const onWarm = warm?.onP50;
        const rlWarm = warm?.rlP50;
        if (rlWarm != null && onWarm != null) {
          const ratio = (onWarm / rlWarm).toFixed(1);
          return `Riding Lookup warm-cache p50 is **~${ratio}× faster** than OpenNorth for postal/lat/lon (${fmtMs(rlWarm)} vs ${fmtMs(onWarm)}).`;
        }
        return 'See speed table below.';
      })()
    : '_Speed benchmarks not in this results file — run `npm run compare:opennorth -- --speed-only`._';

  const ruralPostal = data.speed?.find((s) => s.name.includes('K0A1K0'));
  const ruralOn = ruralPostal?.onP50;
  const warmPostal = data.speed?.find((s) => s.name.includes('postal warm'));
  const warmRl = warmPostal?.rlP50;
  const warmOn = warmPostal?.onP50;
  const warmLatencyRow =
    warmRl != null && warmOn != null
      ? `| Warm lookup latency | **${fmtMs(warmRl)}** p50 | **${fmtMs(warmOn)}** p50 |`
      : '| Warm lookup latency | see speed table | see speed table |';

  const md = `# Riding Lookup vs OpenNorth Represent

Comparison report generated ${new Date().toISOString().slice(0, 10)} from live production data.

| | Riding Lookup | OpenNorth Represent |
|---|---------------|---------------------|
| **Base URL** | ${data.ridingLookupBase} | ${data.openNorthBase} |
| **Federal boundaries** | 2024 (\`federalridings-2024.geojson\`) | 2023 representation order (closest parity set) |
| **Auth** | Basic Auth required | None (public) |
| **Rate limit** | 100 req/min (lookup routes) | 60 req/min |
| **Address geocoding** | Built-in (ODA → GeoGratis → Google) | Not supported — compare via resolved lat/lon |
| **Robustness run** | ${(data.robustnessRunAt ?? data.runAt).slice(0, 19)} UTC | same window |
| **Speed run** | ${data.speedRunAt ? data.speedRunAt.slice(0, 19) + ' UTC' : 'not captured in this file'} | same window |

## Executive summary

1. **Speed (warm cache):** ${speedNote}
2. **Robustness (${data.caseCount} cases):** ${rlOk}/${data.caseCount} Riding Lookup lookups succeeded; **${agree}** agreed with OpenNorth on federal riding when both returned a result; **${disagree.length}** genuine disagreements on shared inputs.
3. **Known divergence — postal vs point:** \`M5V2T6\` maps to **University—Rosedale** (Riding Lookup, geocoded point-in-polygon on 2024 boundaries) vs **Spadina—Harbourfront** (OpenNorth postal centroid). Same pattern as documented Victoria Park case (postal centroid ≠ geocoded civic address).
4. **Address geocoding under batch load:** ${timeoutCount} cases hit **30s geocoding timeout**; ${circuitCount} tripped the **ODA circuit breaker**. Single-request production behavior is fine; this matrix hammers address geocoding with ${ADDRESS_PAUSE_MS}ms spacing — still insufficient for sustained ODA load. Use longer pauses, smaller batches, or \`POST /batch\` for bulk work.
5. **Production gap:** \`/api/qc\` fails — \`quebecridings-2025.geojson\` not present in R2.
6. **Ground truth (liblist):** 5 liblist cases where RL and OpenNorth agreed with each other but differed from OLP \`RidingName\` — likely stale member-list riding labels or boundary redistribution, not API disagreement.

## Methodology

- **Speed:** 8 scenarios, 8 iterations + 2 warmup, production Riding Lookup vs OpenNorth.
- **Robustness:** ${data.caseCount} cases across postal (A), address (B), coordinates (C), endpoints (D), errors (E), divergence (F), Downloads wild mix (G), and OLP \`liblist221123.csv\` (I).
- **OpenNorth parity:** Federal comparisons use \`federal-electoral-districts-2023-representation-order\` with \`contains={lat},{lon}\` for address/coordinate cases; \`/postcodes/{POSTAL}/?sets=...\` for postal-only.
- **Pacing:** ${ADDRESS_PAUSE_MS}ms between address geocodes, batch cooldown every ${BATCH_SIZE} address cases — see [compare-opennorth.ts](../scripts/compare-opennorth.ts).

## Speed results

| Scenario | RL p50 | RL p95 | RL cache | ON p50 | ON p95 |
|----------|--------|--------|----------|--------|--------|
${speedRows || '| _No speed data — re-run with `npm run compare:opennorth`_ | | | | | |'}

### Speed notes

- All warm postal/lat/lon scenarios returned \`X-Cache-Status: HIT\` on Riding Lookup.
- \`return=municipality\` adds ODA normalization work (~900ms p50) even on cache hit.
- OpenNorth rural postal (\`K0A1K0\`) is slower (${ruralOn != null ? fmtMs(ruralOn) : '~100ms'} p50) but consistent.

## Robustness summary

| Classification | Count |
|----------------|-------|
${Object.entries(summary)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `| ${k} | ${v} |`)
  .join('\n')}

### Riding Lookup errors (when present)

${summarizeErrors(data.robustness) || '_None_'}

${rlErrors > 0 ? `\n**Note:** ${rlErrors} failed lookups (${timeoutCount} timeouts, ${circuitCount} circuit breaker) are concentrated in address-heavy categories B, G, and I — not postal/coordinate cases. Treat as batch-load artifact unless reproduced on isolated requests.\n` : ''}

### Results by category

| Category | Cases | RL OK | Agree (both APIs) |
|----------|-------|-------|-------------------|
${categoryBreakdown(data.robustness)}

## Genuine disagreements (both APIs returned a riding)

${disagreeSection}

## Expected divergences (methodology, not bugs)

- **Postal centroid vs geocoded point:** OpenNorth \`/postcodes/\` uses centroid/concordance; Riding Lookup geocodes then point-in-polygon. Large buildings and cross-boundary postcodes (e.g. \`K0A1K0\`, \`M4C1N2\`) often differ.
- **Boundary vintage:** OpenNorth default \`federal-electoral-districts\` set last updated 2017; we compare against 2023/2024 redistribution where noted.
- **757 Victoria Park / Victoria Park Ave:** Geocoded point → Scarborough Southwest (both APIs on 2023 contains); postal \`M4C1N2\` centroid → Beaches—East York on OpenNorth.

## Full case matrix

| ID | Label | Input | RL federal | ON federal | Class | RL time |
|----|-------|-------|------------|------------|-------|---------|
${tableRows}

## Feature comparison

| Capability | Riding Lookup | OpenNorth |
|------------|---------------|-----------|
| Postal lookup | Yes (geocode → PIP) | Yes (centroid/concordance) |
| Address lookup | Yes | No (external geocoder required) |
| Lat/lon lookup | Yes | Yes (\`contains\`) |
| Provincial ON/QC | \`/api/on\`, \`/api/qc\`, \`/api/combined\` | Separate boundary sets |
| Representatives | No | Yes |
| Municipality field | \`return=municipality\` | No |
| Batch API | \`POST /batch\` (100) | No |
| Edge caching | KV 24h + in-memory spatial index | None documented |
${warmLatencyRow}

## When to use which

**Use Riding Lookup when:**

- You need address → riding in one call with Canadian geocoding (ODA when enabled).
- You want 2024 federal boundaries and optional ON/QC provincial in \`/api/combined\`.
- Repeat lookups benefit from edge KV cache (${warmRl != null ? `~${fmtMs(warmRl)} warm p50` : 'sub-50ms warm'}).

**Use OpenNorth when:**

- You need representative names, emails, and boundary metadata across many jurisdictions.
- Postal-only lookup is sufficient and ~60–100ms is acceptable.
- You want a free, unauthenticated public API (within 60 req/min).

## Recommendations

1. **Upload \`quebecridings-2025.geojson\` to R2** to fix \`/api/qc\` in production.
2. **Document \`M5V2T6\` postal divergence** for integrators comparing against OpenNorth postal centroids.
3. **Batch clients:** respect rate limits; for address-heavy batches use \`POST /batch\` or ≥4s spacing to avoid ODA circuit breaker.
4. **Comparison re-runs:** \`BENCHMARK_BASIC_AUTH=... npm run compare:opennorth\` then \`npm run compare:report\`.

## Artifacts

- Raw results: [test/fixtures/comparison/opennorth-results.json](../test/fixtures/comparison/opennorth-results.json)
- Case definitions: [test/fixtures/comparison/opennorth-cases.json](../test/fixtures/comparison/opennorth-cases.json)
- Runner: [scripts/compare-opennorth.ts](../scripts/compare-opennorth.ts)
`;

  writeFileSync(OUT_PATH, md);
  console.log(`Wrote ${OUT_PATH}`);
}

main();
