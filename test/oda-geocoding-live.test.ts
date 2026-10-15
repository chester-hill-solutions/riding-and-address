import { describe, it, expect } from 'vitest';

const runLive = process.env.ODA_LIVE === '1';
const baseUrl = (process.env.ODA_LIVE_BASE_URL ?? 'https://riding-lookup.chester-hill-solutions.workers.dev').replace(/\/$/, '');
const basicAuth = process.env.ODA_LIVE_BASIC_AUTH ?? process.env.BENCHMARK_BASIC_AUTH;
const serverKey = process.env.ODA_LIVE_SERVER_KEY;
// Keyless demos use the same handlers and data; optional credentials exercise customer routes.
const api = basicAuth || serverKey ? '/api' : '/api/demo';

type LiveCase = {
  name: string;
  path: string;
  status: number;
  code?: string;
  method?: string;
  lat?: number;
  lon?: number;
  unit?: string | null;
  provinceData?: boolean;
};

function geocode(params: Record<string, string>): string {
  return `${api}/geocode?${new URLSearchParams(params)}`;
}

const toronto = { address: '757 Victoria Park Ave', city: 'Toronto', province: 'ON' };
const point = 'lat=43.6426&lon=-79.3871';
const cases: LiveCase[] = [
  { name: 'Toronto building, without selecting an apartment', path: geocode(toronto), status: 200, method: 'exact', lat: 43.69279, lon: -79.288914, unit: null },
  { name: 'loaded postal centroid', path: geocode({ postal: 'M4C5N8', province: 'ON' }), status: 200, method: 'postal_centroid', lat: 43.69279, lon: -79.288914 },
  { name: 'missing postal code uses nearby siblings', path: geocode({ postal: 'M5V2T6', province: 'ON' }), status: 200, method: 'postal_prefix', lat: 43.64543705042017, lon: -79.3997076302521 },
  { name: 'French prefix street type', path: geocode({ address: '350 Rue Saint-Paul E', city: 'Montréal', province: 'QC' }), status: 200, method: 'exact', lat: 45.509162, lon: -73.551579, unit: null },
  { name: 'French suffix street type', path: geocode({ address: '350 Saint-Paul RUE E', city: 'Montréal', province: 'QC' }), status: 200, method: 'exact', lat: 45.509162, lon: -73.551579, unit: null },
  { name: 'explicit unit', path: geocode({ ...toronto, address: '757 Victoria Park Ave Unit PH11' }), status: 200, method: 'exact', unit: 'PH11' },
  { name: 'street takes precedence over conflicting postal', path: geocode({ ...toronto, postal: 'M5V3L9' }), status: 200, method: 'exact', lat: 43.69279, lon: -79.288914, unit: null },
  { name: 'postal riding approximation', path: '/api/demo/federal?postal=M5V2T6&province=ON', status: 200, method: 'postal_prefix' },
  { name: 'unsupported ODA province', path: geocode({ postal: 'A1C1A1', province: 'NL' }), status: 404, code: 'PROVINCE_NOT_LOADED' },
  { name: 'ambiguous street', path: geocode({ address: 'Main Street' }), status: 422, code: 'AMBIGUOUS_LOCATION' },
  { name: 'combined defaults', path: `/api/demo/combined?${point}`, status: 200, provinceData: true },
  { name: 'combined explicit opt-out', path: `/api/demo/combined?${point}&include_province=false`, status: 200, provinceData: false },
  { name: 'unknown demo route', path: `/api/demo/not-a-route?${point}`, status: 404, code: 'NOT_FOUND' },
  { name: 'invalid coordinates', path: '/api/demo/federal?lat=999&lon=-79', status: 400, code: 'INVALID_QUERY' },
];

describe.skipIf(!runLive)('production API smoke checks (ODA_LIVE=1)', () => {
  for (const c of cases) {
    it(c.name, async () => {
      const headers: Record<string, string> = {};
      if (serverKey) headers.Authorization = `Bearer ${serverKey}`;
      else if (basicAuth) headers.Authorization = `Basic ${Buffer.from(basicAuth).toString('base64')}`;
      const response = await fetch(`${baseUrl}${c.path}`, { headers, signal: AbortSignal.timeout(30_000) });
      expect(response.status).toBe(c.status);
      const body = await response.json() as {
        code?: string;
        geocodeMethod?: string;
        geocode?: { method?: string };
        point?: { lat: number; lon: number };
        addressComponents?: { unit?: string };
        normalizedAddress?: string;
        province_data?: { riding?: string } | null;
      };
      if (c.code) expect(body.code).toBe(c.code);
      if (c.method) expect(body.geocodeMethod ?? body.geocode?.method).toBe(c.method);
      if (c.lat !== undefined) expect(body.point?.lat).toBeCloseTo(c.lat, 4);
      if (c.lon !== undefined) expect(body.point?.lon).toBeCloseTo(c.lon, 4);
      if (c.unit === null) {
        expect(body.addressComponents?.unit).toBeUndefined();
        expect(body.normalizedAddress).not.toMatch(/\bUNIT\b/);
      } else if (c.unit !== undefined) expect(body.addressComponents?.unit).toBe(c.unit);
      if (c.provinceData === true) expect(body.province_data?.riding).toBeTruthy();
      if (c.provinceData === false) expect(body.province_data).toBeUndefined();
    });
  }
});
