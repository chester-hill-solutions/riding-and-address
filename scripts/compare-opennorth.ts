/**
 * Riding Lookup vs OpenNorth comparison runner.
 *
 * Usage:
 *   BENCHMARK_BASIC_AUTH='user:pass' tsx scripts/compare-opennorth.ts
 *   BENCHMARK_BASIC_AUTH='user:pass' tsx scripts/compare-opennorth.ts --speed-only
 *   BENCHMARK_BASIC_AUTH='user:pass' tsx scripts/compare-opennorth.ts --robustness-only
 */
import { createReadStream, mkdirSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';

const RL_BASE = (process.env.BENCHMARK_BASE_URL ?? 'https://riding-lookup.chester-hill-solutions.workers.dev').replace(/\/$/, '');
const ON_BASE = 'https://represent.opennorth.ca';
const FED_SET = 'federal-electoral-districts-2023-representation-order';
const PAUSE_MS = Number(process.env.COMPARE_PAUSE_MS ?? 300);
const ADDRESS_PAUSE_MS = Number(process.env.COMPARE_ADDRESS_PAUSE_MS ?? 4500);
const BATCH_SIZE = Number(process.env.COMPARE_BATCH_SIZE ?? 12);
const BATCH_COOLDOWN_MS = Number(process.env.COMPARE_BATCH_COOLDOWN_MS ?? 45000);
const OUT_DIR = 'test/fixtures/comparison';
const OUT_JSON = `${OUT_DIR}/opennorth-results.json`;
const OUT_SPEED_JSON = `${OUT_DIR}/opennorth-speed.json`;
const OUT_ROBUSTNESS_JSON = `${OUT_DIR}/opennorth-robustness.json`;

type QueryParams = Record<string, string>;

type ComparisonCase = {
  id: string;
  category: string;
  label: string;
  endpoint: string;
  query: QueryParams;
  groundTruth?: string;
  groundTruthProv?: string;
  notes?: string;
  openNorthPostal?: string;
  skipOpenNorth?: boolean;
};

type ApiResult = {
  status: number;
  ms: number;
  cacheStatus?: string;
  federalRiding?: string | null;
  provincialRiding?: string | null;
  point?: { lat: number; lon: number } | null;
  errorCode?: string;
  openNorthRidings?: string[];
  openNorthConcordanceCount?: number;
  openNorthCentroidCount?: number;
  rawError?: string;
};

type CaseResult = ComparisonCase & {
  ridingLookup: ApiResult;
  openNorth: ApiResult | null;
  classification: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function authHeaders(): Record<string, string> {
  const basicAuth = process.env.BENCHMARK_BASIC_AUTH;
  if (!basicAuth) return {};
  return { Authorization: `Basic ${Buffer.from(basicAuth).toString('base64')}` };
}

function normalizeRiding(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .replace(/\u2014/g, '—')
    .replace(/-/g, '—')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractFederalRiding(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.riding === 'string') return obj.riding;
  const props = obj.properties as Record<string, unknown> | null | undefined;
  if (props && typeof props.FED_NAME === 'string') return props.FED_NAME;
  if (props && typeof props.ENGLISH_NAME === 'string') return props.ENGLISH_NAME;
  return null;
}

function extractProvincialRiding(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const pd = obj.province_data as Record<string, unknown> | null | undefined;
  if (!pd) return null;
  if (typeof pd.riding === 'string') return pd.riding;
  const props = pd.properties as Record<string, unknown> | null | undefined;
  if (props && typeof props.ENGLISH_NAME === 'string') return props.ENGLISH_NAME;
  return null;
}

function extractPoint(data: unknown): { lat: number; lon: number } | null {
  if (!data || typeof data !== 'object') return null;
  const point = (data as Record<string, unknown>).point as { lat?: number; lon?: number } | undefined;
  if (point && typeof point.lat === 'number' && typeof point.lon === 'number') {
    return { lat: point.lat, lon: point.lon };
  }
  return null;
}

function buildRlUrl(endpoint: string, query: QueryParams): string {
  const qs = new URLSearchParams(query).toString();
  return `${RL_BASE}${endpoint}${qs ? `?${qs}` : ''}`;
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<{ status: number; ms: number; headers: Headers; data: unknown }> {
  const start = performance.now();
  const response = await fetch(url, { headers: { ...authHeaders(), ...headers } });
  const ms = performance.now() - start;
  let data: unknown = null;
  const text = await response.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  return { status: response.status, ms, headers: response.headers, data };
}

async function queryRidingLookup(c: ComparisonCase): Promise<ApiResult> {
  const url = buildRlUrl(c.endpoint, c.query);
  try {
    const { status, ms, headers, data } = await fetchJson(url);
    const err = data as Record<string, unknown>;
    return {
      status,
      ms,
      cacheStatus: headers.get('x-cache-status') ?? undefined,
      federalRiding: extractFederalRiding(data),
      provincialRiding: extractProvincialRiding(data),
      point: extractPoint(data),
      errorCode: typeof err.code === 'string' ? err.code : undefined,
      rawError: typeof err.error === 'string' ? err.error : undefined,
    };
  } catch (e) {
    return { status: 0, ms: 0, rawError: e instanceof Error ? e.message : String(e) };
  }
}

function openNorthNamesFromPostcode(data: unknown, field: 'boundaries_centroid' | 'boundaries_concordance', setFilter?: string): string[] {
  if (!data || typeof data !== 'object') return [];
  const arr = (data as Record<string, unknown>)[field];
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((b) => {
      if (!setFilter || typeof b !== 'object' || !b) return true;
      const related = (b as Record<string, unknown>).related as Record<string, string> | undefined;
      const url = related?.boundary_set_url ?? '';
      return url.includes(setFilter);
    })
    .map((b) => (typeof b === 'object' && b && typeof (b as Record<string, unknown>).name === 'string' ? (b as Record<string, string>).name : ''))
    .filter(Boolean);
}

async function queryOpenNorth(c: ComparisonCase, rlPoint: { lat: number; lon: number } | null): Promise<ApiResult> {
  if (c.skipOpenNorth) return { status: 0, ms: 0 };

  const postal = c.openNorthPostal ?? c.query.postal ?? c.query.postal_code;
  const start = performance.now();

  try {
    if (rlPoint) {
      const url = `${ON_BASE}/boundaries/${FED_SET}/?contains=${rlPoint.lat},${rlPoint.lon}`;
      const { status, data } = await fetchJson(url);
      const objects = (data as { objects?: Array<{ name?: string }> })?.objects ?? [];
      return {
        status,
        ms: performance.now() - start,
        federalRiding: objects[0]?.name ?? null,
        openNorthRidings: objects.map((o) => o.name ?? '').filter(Boolean),
      };
    }

    if (postal) {
      const clean = postal.replace(/\s+/g, '').toUpperCase();
      const url = `${ON_BASE}/postcodes/${clean}/?sets=${FED_SET}`;
      const { status, data } = await fetchJson(url);
      const centroid = openNorthNamesFromPostcode(data, 'boundaries_centroid', FED_SET);
      const concordance = openNorthNamesFromPostcode(data, 'boundaries_concordance', FED_SET);
      const names = centroid.length ? centroid : concordance;
      return {
        status,
        ms: performance.now() - start,
        federalRiding: names[0] ?? null,
        openNorthRidings: names,
        openNorthConcordanceCount: concordance.length,
        openNorthCentroidCount: centroid.length,
      };
    }

    return { status: 0, ms: 0, rawError: 'no postal or point for OpenNorth' };
  } catch (e) {
    return { status: 0, ms: 0, rawError: e instanceof Error ? e.message : String(e) };
  }
}

function classify(c: ComparisonCase, rl: ApiResult, on: ApiResult | null): string {
  if (rl.status >= 400 && c.category.startsWith('E')) return 'Error handled';
  if (rl.status >= 400) return rl.status >= 500 ? 'RL error' : 'RL rejected';
  if (!on || on.status === 0) return on?.rawError ? 'OpenNorth N/A' : 'RL only';

  const rlName = normalizeRiding(rl.federalRiding);
  const onName = normalizeRiding(on.federalRiding);
  const gt = normalizeRiding(c.groundTruth);

  if (c.category === 'F' || c.notes?.includes('Expected divergence')) return 'Expected divergence';

  if (rlName && onName && rlName === onName) {
    if (gt && gt !== rlName) return 'RL=ON; ground truth differs';
    return 'Agree';
  }

  if (rlName && gt && rlName === gt && onName && onName !== gt) return 'RL=ground truth; ON differs';
  if (rlName && onName && rlName !== onName) return 'Disagree';
  if (rlName && !onName && on.status === 200) return 'ON empty';
  if (!rlName && onName) return 'RL empty';
  return 'Inconclusive';
}

function fixedCases(): ComparisonCase[] {
  const cases: ComparisonCase[] = [];

  const add = (c: ComparisonCase) => cases.push(c);

  // Category A — Postal
  add({ id: 'A1', category: 'A', label: 'Downtown Toronto', endpoint: '/api/federal', query: { postal: 'M5V2T6' }, groundTruth: 'Spadina—Harbourfront' });
  add({ id: 'A2', category: 'A', label: 'Parliament Hill', endpoint: '/api/federal', query: { postal: 'K1A0A6' } });
  add({ id: 'A3', category: 'A', label: 'Montreal', endpoint: '/api/federal', query: { postal: 'H2X1Y4' } });
  add({ id: 'A4', category: 'A', label: 'Vancouver', endpoint: '/api/federal', query: { postal: 'V6B1A1' } });
  add({ id: 'A5', category: 'A', label: 'Rural cross-boundary', endpoint: '/api/federal', query: { postal: 'K0A1K0' } });
  add({ id: 'A6', category: 'A', label: 'Halifax', endpoint: '/api/federal', query: { postal: 'B3H4R2' } });
  add({ id: 'A7', category: 'A', label: 'Calgary', endpoint: '/api/federal', query: { postal: 'T2P1J9' } });
  add({ id: 'A8', category: 'A', label: 'Postal with spaces', endpoint: '/api/federal', query: { postal: 'M5V 2T6' } });

  // Category B — Address
  add({ id: 'B1', category: 'B', label: 'Exact civic Toronto', endpoint: '/api/combined', query: { address: '123 Main St', city: 'Toronto', province: 'ON' } });
  add({ id: 'B2', category: 'B', label: 'Exact civic Ottawa', endpoint: '/api/federal', query: { address: '123 Main St', city: 'Ottawa', province: 'ON' } });
  add({ id: 'B3', category: 'B', label: 'Unit address', endpoint: '/api/federal', query: { address: 'Unit 1205, 123 Main St', city: 'Toronto', province: 'ON' } });
  add({ id: 'B4', category: 'B', label: '757 Victoria Park abbreviated', endpoint: '/api/combined', query: { address: '757 Victoria Park', city: 'Toronto', province: 'ON', include_province: 'true' }, groundTruth: 'Scarborough Southwest', notes: 'Expected divergence vs postal centroid' });
  add({ id: 'B5', category: 'B', label: '757 Victoria Park full', endpoint: '/api/combined', query: { address: '757 Victoria Park Ave', city: 'Toronto', province: 'ON', include_province: 'true' }, groundTruth: 'Scarborough Southwest' });
  add({ id: 'B6', category: 'B', label: 'Montreal accented', endpoint: '/api/qc', query: { address: '350 Rue Saint-Paul E', city: 'Montréal', province: 'QC' } });
  add({ id: 'B7', category: 'B', label: 'Montreal Saint-Denis', endpoint: '/api/qc', query: { address: '1000 Rue Saint-Denis', city: 'Montréal', province: 'QC' } });
  add({ id: 'B8', category: 'B', label: 'King St W', endpoint: '/api/on', query: { address: '456 King St W', city: 'Toronto', province: 'ON' } });
  add({ id: 'B9', category: 'B', label: 'Municipality return', endpoint: '/api/federal', query: { address: '123 Main St', city: 'Toronto', province: 'ON', return: 'municipality' } });
  add({ id: 'B10', category: 'B', label: 'Nonexistent address', endpoint: '/api/federal', query: { address: '999 Nonexistent Blvd', city: 'Toronto', province: 'ON' }, skipOpenNorth: true });
  add({ id: 'B11', category: 'B', label: 'Street only ambiguous', endpoint: '/api/federal', query: { address: 'Main Street' }, skipOpenNorth: true });
  add({ id: 'B12', category: 'B', label: 'City only weak', endpoint: '/api/federal', query: { city: 'Toronto', province: 'ON' }, skipOpenNorth: true });

  // Category C — Coordinates
  add({ id: 'C1', category: 'C', label: 'Toronto core', endpoint: '/api/federal', query: { lat: '43.6532', lon: '-79.3832' } });
  add({ id: 'C2', category: 'C', label: 'Victoria Park point', endpoint: '/api/combined', query: { lat: '43.692101', lon: '-79.288688', include_province: 'true' }, groundTruth: 'Scarborough Southwest' });
  add({ id: 'C3', category: 'C', label: 'Montreal', endpoint: '/api/qc', query: { lat: '45.5088', lon: '-73.5540' } });
  add({ id: 'C4', category: 'C', label: 'Ottawa', endpoint: '/api/federal', query: { lat: '45.4215', lon: '-75.6972' } });
  add({ id: 'C5', category: 'C', label: 'Offshore', endpoint: '/api/federal', query: { lat: '0', lon: '0' } });

  // Category D — Endpoints
  add({ id: 'D1', category: 'D', label: 'Combined default', endpoint: '/api/combined', query: { postal: 'M5V2T6' } });
  add({ id: 'D2', category: 'D', label: 'Ontario provincial', endpoint: '/api/on', query: { postal: 'M5V2T6' } });
  add({ id: 'D3', category: 'D', label: 'Quebec provincial', endpoint: '/api/qc', query: { postal: 'H2Y1H2' } });
  add({ id: 'D4', category: 'D', label: 'Province off', endpoint: '/api/combined', query: { postal: 'M5V2T6', include_province: 'false' } });

  // Category E — Errors
  add({ id: 'E1', category: 'E', label: 'Invalid postal', endpoint: '/api/federal', query: { postal: 'INVALID' }, openNorthPostal: 'INVALID' });
  add({ id: 'E2', category: 'E', label: 'Missing location', endpoint: '/api/federal', query: {}, skipOpenNorth: true });
  add({ id: 'E3', category: 'E', label: 'Lat without lon', endpoint: '/api/federal', query: { lat: '43.65' }, skipOpenNorth: true });
  add({ id: 'E4', category: 'E', label: 'BC geocode not loaded', endpoint: '/api/geocode', query: { postal: 'V6B1A1', province: 'BC' }, skipOpenNorth: true });
  add({ id: 'E5', category: 'E', label: 'International postal', endpoint: '/api/federal', query: { postal: '90210' }, openNorthPostal: '90210' });
  add({ id: 'E6', category: 'E', label: 'Victoria Park coords boundary', endpoint: '/api/federal', query: { lat: '43.692101', lon: '-79.288688' }, groundTruth: 'Scarborough Southwest' });

  // Category F — Divergence
  add({ id: 'F1', category: 'F', label: 'Postal centroid M4C1N2', endpoint: '/api/federal', query: { postal: 'M4C1N2' }, groundTruth: 'Scarborough Southwest', notes: 'Expected divergence — ON postal centroid vs RL point', openNorthPostal: 'M4C1N2' });
  add({ id: 'F2', category: 'F', label: 'OpenNorth default 2017 set', endpoint: '/api/federal', query: { postal: 'M5V2T6' }, notes: 'Compare ON 2017 default set separately', openNorthPostal: 'M5V2T6' });
  add({ id: 'F3', category: 'F', label: 'Rural K0A1K0 concordance', endpoint: '/api/federal', query: { postal: 'K0A1K0' }, openNorthPostal: 'K0A1K0' });

  // Category G — Downloads wild mix
  const gCases: Array<Omit<ComparisonCase, 'category'>> = [
    { id: 'G1', label: 'Pharmacy Ave', endpoint: '/api/combined', query: { address: '442 Pharmacy Ave', city: 'Scarborough', province: 'ON', postal: 'M1L3G6' }, groundTruth: 'Scarborough Southwest' },
    { id: 'G2', label: 'Birchmount unit dash', endpoint: '/api/federal', query: { address: '908-560 Birchmount Rd', city: 'Toronto', province: 'ON' } },
    { id: 'G3', label: 'Birchmount bare', endpoint: '/api/federal', query: { address: '560 Birchmount Road', city: 'Scarborough', province: 'ON' } },
    { id: 'G4', label: 'Mendelssohn unit', endpoint: '/api/federal', query: { address: '325-10 Mendelssohn Street', city: 'Scarborough', province: 'ON' } },
    { id: 'G5', label: 'St Clair unit tower', endpoint: '/api/combined', query: { address: '225-3560 St Clair Avenue East', city: 'Scarborough', province: 'ON', include_province: 'true' }, groundTruth: 'Scarborough Southwest' },
    { id: 'G6', label: 'St Clair bare', endpoint: '/api/combined', query: { address: '3560 St Clair Avenue East', city: 'Scarborough', province: 'ON', include_province: 'true' } },
    { id: 'G7', label: 'Blantyre 168A', endpoint: '/api/federal', query: { address: '168A Blantyre Avenue', city: 'Scarborough', province: 'ON' } },
    { id: 'G8', label: 'VP unit tower', endpoint: '/api/combined', query: { address: '605-757 Victoria Park Avenue', city: 'Scarborough', province: 'ON', include_province: 'true' }, groundTruth: 'Beaches—East York', notes: 'Voter list says BEY; RL may say SSW' },
    { id: 'G9', label: 'VP 917', endpoint: '/api/combined', query: { address: '917 Victoria Park Avenue', city: 'Scarborough', province: 'ON', include_province: 'true' } },
    { id: 'G10', label: 'Eglinton East', endpoint: '/api/combined', query: { address: '3171 Eglinton Avenue East', city: 'Scarborough', province: 'ON', include_province: 'true' } },
    { id: 'G11', label: 'Markham Rd tower', endpoint: '/api/federal', query: { address: '1404-180 Markham Road', city: 'Scarborough', province: 'ON' } },
    { id: 'G12', label: 'Anaconda incomplete', endpoint: '/api/federal', query: { address: '91 Anaconda', city: 'Scarborough', province: 'ON' } },
    { id: 'G13', label: 'Danforth east', endpoint: '/api/federal', query: { address: '3205 Danforth Avenue', city: 'Scarborough', province: 'ON' } },
    { id: 'G14', label: 'Burlington ALL CAPS period', endpoint: '/api/federal', query: { address: '668 SHERATON RD.', city: 'Burlington', province: 'ON', postal: 'L7L4B7' } },
    { id: 'G15', label: 'Burlington UNIT suffix', endpoint: '/api/federal', query: { address: '5013 PINEDALE AVE. UNIT 28', city: 'Burlington', province: 'ON' } },
    { id: 'G16', label: 'Burlington condo', endpoint: '/api/federal', query: { address: '1300 MAPLE CROSSING BLVD. UNIT 91', city: 'Burlington', province: 'ON' } },
    { id: 'G17', label: 'Burlington lakeshore', endpoint: '/api/federal', query: { address: '5194 LAKESHORE RD.', city: 'Burlington', province: 'ON' } },
    { id: 'G18', label: 'Sign ALL CAPS embedded postal', endpoint: '/api/federal', query: { address: '3376 SANDY LANE', city: 'Burlington', province: 'ON', postal: 'L7M3S8' } },
    { id: 'G19', label: 'Jardine Cres', endpoint: '/api/federal', query: { address: '2140 Jardine Cres', city: 'Burlington', province: 'ON', postal: 'L7L7K1' } },
    { id: 'G20', label: 'Rural Seaforth embedded', endpoint: '/api/federal', query: { address: '77 MARKET ST', city: 'Seaforth', province: 'ON', postal: 'N0K1W0' } },
    { id: 'G21', label: 'Dundas St E', endpoint: '/api/federal', query: { address: '314 Dundas St E', city: 'Toronto', province: 'ON' } },
    { id: 'G22', label: 'Dundas unit inline', endpoint: '/api/federal', query: { address: '312 Unit 4 Dundas St E', city: 'Toronto', province: 'ON' } },
    { id: 'G23', label: 'Broadview unit', endpoint: '/api/federal', query: { address: '105 Unit 2 Broadview Ave', city: 'Toronto', province: 'ON' } },
    { id: 'G24', label: 'Gerrard St E', endpoint: '/api/federal', query: { address: '220 Gerrard St E', city: 'Toronto', province: 'ON' } },
    { id: 'G25', label: 'Hobson no city', endpoint: '/api/federal', query: { address: '1829 Hobson Drive', province: 'ON' } },
  ];
  for (const g of gCases) add({ ...g, category: 'G' });

  // Category I — liblist hand-picked
  const iCases: Array<Omit<ComparisonCase, 'category'>> = [
    { id: 'I1', label: 'Hopkinson Crescentt typo', endpoint: '/api/federal', query: { address: '92 Hopkinson Cres - Crescentt', city: 'Ajax', province: 'ON', postal: 'L1T4E1' }, groundTruth: 'Ajax' },
    { id: 'I2', label: 'Lake Driveway W', endpoint: '/api/federal', query: { address: '211 Lake Driveway W', city: 'Ajax', province: 'ON', postal: 'L1S5A1' }, groundTruth: 'Ajax' },
    { id: 'I3', label: 'Coates Of Arms Lane', endpoint: '/api/federal', query: { address: '15 Coates Of Arms Lane', city: 'Ajax', province: 'ON', postal: 'L1T3S2' }, groundTruth: 'Ajax' },
    { id: 'I4', label: '607-132 Kingston Rd W', endpoint: '/api/federal', query: { address: '607-132 Kingston Rd W', city: 'Ajax', province: 'ON', postal: 'L1T3W5' }, groundTruth: 'Ajax' },
    { id: 'I5', label: '1612-77 Falby Crt', endpoint: '/api/federal', query: { address: '1612-77 Falby Crt', city: 'Ajax', province: 'ON', postal: 'L1S4G7' }, groundTruth: 'Ajax' },
    { id: 'I6', label: 'Edgewood Unit hash', endpoint: '/api/federal', query: { address: '90 Edgewood Ave, Unit # 132', city: 'Toronto', province: 'ON', postal: 'M4L3H1' }, groundTruth: 'Beaches—East York' },
    { id: 'I7', label: 'Woodbine Apt', endpoint: '/api/federal', query: { address: '1501 Woodbine Ave - Apt. 715', city: 'East York', province: 'ON', postal: 'M4C4H1' }, groundTruth: 'Beaches—East York' },
    { id: 'I8', label: 'Delisle unit tower', endpoint: '/api/federal', query: { address: '1105-10 Delisle Ave', city: 'Toronto', province: 'ON', postal: 'M4V3C6' }, groundTruth: "Toronto—St. Paul's" },
    { id: 'I9', label: 'Nepean Bayshore', endpoint: '/api/federal', query: { address: '23 Bayshore Dr', city: 'Nepean', province: 'ON', postal: 'K2B6M7' }, groundTruth: 'Ottawa West—Nepean' },
    { id: 'I10', label: 'London Sharon Dr', endpoint: '/api/federal', query: { address: '1616 Sharon Dr', city: 'London', province: 'ON', postal: 'N6G2R6' }, groundTruth: 'London North Centre' },
  ];
  for (const i of iCases) add({ ...i, category: 'I' });

  return cases;
}

async function sampleCsvRows(
  filePath: string,
  filter: (row: Record<string, string>) => boolean,
  limit: number
): Promise<Array<Record<string, string>>> {
  const rows: Array<Record<string, string>> = [];
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let headers: string[] = [];
  let lineNum = 0;

  for await (const line of rl) {
    if (lineNum === 0) {
      headers = parseCsvLine(line);
      lineNum++;
      continue;
    }
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    if (filter(row)) rows.push(row);
    if (rows.length >= limit) break;
    lineNum++;
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}


async function buildStratifiedCases(): Promise<ComparisonCase[]> {
  const cases: ComparisonCase[] = [];
  const libPath = '/Users/ladmin/WebProjects/canada411-scraper/data/raw/legacy/CSVs/liblist221123.csv';

  const ridingBuckets = [
    'Brampton West', 'Scarborough Southwest', 'Milton', 'Beaches—East York',
    'Ottawa West—Nepean', 'Mississauga—Erin Mills', 'Pickering—Uxbridge',
    'Eglinton—Lawrence', 'Kingston and the Islands', 'Scarborough—Guildwood',
  ];

  // Sample from liblist by riding
  for (let bi = 0; bi < ridingBuckets.length; bi++) {
    const riding = ridingBuckets[bi];
    const rows = await sampleCsvRows(
      libPath,
      (r) => r.RidingName?.trim() === riding && Boolean(r.Address?.trim()),
      2
    );
    rows.forEach((row, idx) => {
      cases.push({
        id: `I-B${bi + 1}-${idx + 1}`,
        category: 'I',
        label: `liblist ${riding} #${idx + 1}`,
        endpoint: '/api/federal',
        query: {
          address: row.Address.trim(),
          city: row.City?.trim() ?? '',
          province: row.Province?.trim() ?? 'ON',
          ...(row.PostalCode?.trim() ? { postal: row.PostalCode.trim() } : {}),
        },
        groundTruth: riding,
      });
    });
  }

  return cases;
}

type SpeedScenario = {
  name: string;
  rlPath: string;
  onPath?: string;
};

const SPEED_SCENARIOS: SpeedScenario[] = [
  { name: 'federal warm lat/lon', rlPath: '/api/federal?lat=43.6431&lon=-79.3991', onPath: `/postcodes/M5V2T6/?sets=${FED_SET}` },
  { name: 'combined warm lat/lon', rlPath: '/api/combined?lat=43.6431&lon=-79.3991' },
  { name: 'federal postal warm', rlPath: '/api/federal?postal=M5V2T6', onPath: `/postcodes/M5V2T6/?sets=${FED_SET}` },
  { name: 'combined postal', rlPath: '/api/combined?postal=M5V2T6', onPath: `/postcodes/M5V2T6/?sets=${FED_SET}` },
  { name: 'federal + municipality', rlPath: '/api/federal?postal=M5V2T6&return=municipality' },
  { name: 'VP lat/lon 2023 parity', rlPath: '/api/federal?lat=43.692101&lon=-79.288688', onPath: `/boundaries/${FED_SET}/?contains=43.692101,-79.288688` },
  { name: 'address cold VP', rlPath: '/api/combined?address=757%20Victoria%20Park&city=Toronto&province=ON&include_province=true' },
  { name: 'rural postal K0A1K0', rlPath: '/api/federal?postal=K0A1K0', onPath: '/postcodes/K0A1K0/' },
];

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index];
}

async function runSpeedBenchmarks(): Promise<Array<{ name: string; rlP50: number; rlP95: number; onP50?: number; onP95?: number; rlCache?: string }>> {
  const iterations = Number(process.env.BENCHMARK_ITERATIONS ?? 8);
  const warmup = Number(process.env.BENCHMARK_WARMUP ?? 2);
  const results = [];

  for (const scenario of SPEED_SCENARIOS) {
    const rlUrl = `${RL_BASE}${scenario.rlPath}`;
    const rlSamples: number[] = [];
    let lastCache = '';

    for (let i = 0; i < warmup + iterations; i++) {
      const { ms, headers } = await fetchJson(rlUrl);
      if (i >= warmup) rlSamples.push(ms);
      lastCache = headers.get('x-cache-status') ?? lastCache;
      await sleep(PAUSE_MS);
    }

    let onP50: number | undefined;
    let onP95: number | undefined;
    if (scenario.onPath) {
      const onUrl = `${ON_BASE}${scenario.onPath}`;
      const onSamples: number[] = [];
      for (let i = 0; i < warmup + iterations; i++) {
        const { ms } = await fetchJson(onUrl);
        if (i >= warmup) onSamples.push(ms);
        await sleep(PAUSE_MS);
      }
      onP50 = percentile(onSamples, 0.5);
      onP95 = percentile(onSamples, 0.95);
    }

    results.push({
      name: scenario.name,
      rlP50: percentile(rlSamples, 0.5),
      rlP95: percentile(rlSamples, 0.95),
      onP50,
      onP95,
      rlCache: lastCache,
    });
  }

  return results;
}

function needsGeocode(c: ComparisonCase): boolean {
  return Boolean(c.query.address) && !c.query.lat;
}

async function queryRidingLookupWithRetry(c: ComparisonCase): Promise<ApiResult> {
  let rl = await queryRidingLookup(c);
  if (rl.errorCode === 'LOOKUP_ERROR' && rl.rawError?.includes('Circuit breaker is OPEN')) {
    process.stderr.write(`\n  [cooldown 60s after circuit breaker on ${c.id}]`);
    await sleep(60_000);
    rl = await queryRidingLookup(c);
  }
  return rl;
}

async function runRobustness(cases: ComparisonCase[]): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  let addressSinceBatch = 0;

  for (const c of cases) {
    const rl = await queryRidingLookupWithRetry(c);
    const rlPause = needsGeocode(c) ? ADDRESS_PAUSE_MS : PAUSE_MS;
    await sleep(rlPause);

    let on: ApiResult | null = null;
    if (!c.skipOpenNorth) {
      const point = rl.point ?? (c.query.lat && c.query.lon ? { lat: Number(c.query.lat), lon: Number(c.query.lon) } : null);
      const usePoint = Boolean(c.query.address || c.query.lat);
      on = await queryOpenNorth(c, usePoint ? point : null);
      await sleep(PAUSE_MS);
    }

    results.push({ ...c, ridingLookup: rl, openNorth: on, classification: classify(c, rl, on) });
    process.stderr.write(`\r  ${results.length}/${cases.length} ${c.id} ${c.label.slice(0, 40).padEnd(40)}`);

    if (needsGeocode(c)) {
      addressSinceBatch++;
      if (addressSinceBatch >= BATCH_SIZE) {
        process.stderr.write(`\n  [batch cooldown ${BATCH_COOLDOWN_MS / 1000}s]\n`);
        await sleep(BATCH_COOLDOWN_MS);
        addressSinceBatch = 0;
      }
    }
  }
  process.stderr.write('\n');
  return results;
}

function loadExistingResults(): Record<string, unknown> {
  let merged: Record<string, unknown> = {};
  try {
    merged = JSON.parse(readFileSync(OUT_JSON, 'utf8')) as Record<string, unknown>;
  } catch {
    // no combined file yet
  }
  try {
    const speedFile = JSON.parse(readFileSync(OUT_SPEED_JSON, 'utf8')) as {
      runAt?: string;
      results?: unknown;
    };
    merged.speed = speedFile.results ?? speedFile;
    merged.speedRunAt = speedFile.runAt ?? merged.speedRunAt;
  } catch {
    // no speed file
  }
  try {
    const robustness = JSON.parse(readFileSync(OUT_ROBUSTNESS_JSON, 'utf8')) as {
      results: CaseResult[];
      runAt?: string;
      classificationSummary?: Record<string, number>;
    };
    merged.robustness = robustness.results;
    merged.robustnessRunAt = robustness.runAt;
    merged.classificationSummary = robustness.classificationSummary;
  } catch {
    // no robustness file
  }
  return merged;
}

function writeResults(output: Record<string, unknown>): void {
  const sidecar = loadExistingResults();
  if (!output.speed && sidecar.speed) {
    output.speed = sidecar.speed;
    output.speedRunAt = output.speedRunAt ?? sidecar.speedRunAt;
  }
  if (!output.robustness && sidecar.robustness) {
    output.robustness = sidecar.robustness;
    output.robustnessRunAt = output.robustnessRunAt ?? sidecar.robustnessRunAt;
    output.classificationSummary = output.classificationSummary ?? sidecar.classificationSummary;
  }

  writeFileSync(OUT_JSON, JSON.stringify(output, null, 2));
  if (output.speed) {
    writeFileSync(
      OUT_SPEED_JSON,
      JSON.stringify({ runAt: output.speedRunAt ?? new Date().toISOString(), results: output.speed }, null, 2)
    );
  }
  if (output.robustness) {
    writeFileSync(
      OUT_ROBUSTNESS_JSON,
      JSON.stringify(
        {
          runAt: output.robustnessRunAt ?? new Date().toISOString(),
          classificationSummary: output.classificationSummary,
          results: output.robustness,
        },
        null,
        2
      )
    );
  }
  console.log(`Wrote ${OUT_JSON}`);
}

function summarizeClassifications(results: CaseResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.classification] = (counts[r.classification] ?? 0) + 1;
  return counts;
}

async function main(): Promise<void> {
  const speedOnly = process.argv.includes('--speed-only');
  const robustnessOnly = process.argv.includes('--robustness-only');

  if (!process.env.BENCHMARK_BASIC_AUTH) {
    console.error('Set BENCHMARK_BASIC_AUTH');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const fixed = fixedCases();
  const stratified = robustnessOnly || !speedOnly ? await buildStratifiedCases() : [];
  const allCases = [...fixed, ...stratified];

  const existing = loadExistingResults();

  writeFileSync(`${OUT_DIR}/opennorth-cases.json`, JSON.stringify(allCases, null, 2));

  const output: Record<string, unknown> = {
    runAt: typeof existing.runAt === 'string' ? existing.runAt : new Date().toISOString(),
    ridingLookupBase: RL_BASE,
    openNorthBase: ON_BASE,
    caseCount:
      speedOnly && typeof existing.caseCount === 'number'
        ? existing.caseCount
        : allCases.length,
  };

  if (!robustnessOnly) {
    console.log('Running speed benchmarks...');
    output.speed = await runSpeedBenchmarks();
    output.speedRunAt = new Date().toISOString();
  } else if (existing.speed) {
    output.speed = existing.speed;
    if (existing.speedRunAt) output.speedRunAt = existing.speedRunAt;
  }

  if (!speedOnly) {
    console.log(`Running robustness matrix (${allCases.length} cases)...`);
    const results = await runRobustness(allCases);
    output.robustness = results;
    output.classificationSummary = summarizeClassifications(results);
    output.robustnessRunAt = new Date().toISOString();
  } else if (existing.robustness) {
    output.robustness = existing.robustness;
    if (existing.classificationSummary) output.classificationSummary = existing.classificationSummary;
    if (existing.robustnessRunAt) output.robustnessRunAt = existing.robustnessRunAt;
  }

  writeResults(output);
}

main().catch((e) => { console.error(e); process.exit(1); });
