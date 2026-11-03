import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { geocodeBatchPostalCentroidsWithOda, geocodePostalCentroidWithOda, geocodeWithOda } from '../src/oda-geocoding';
import { createOdaFixtureEnv } from './helpers/oda-sqlite';
import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';

let directory: string;
let sql: string;
let report: Record<string, number>;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'nar-postal-test-'));
  // Real split-archive input: join across parts, repeated locations, BOM/quoted CSV,
  // building-coordinate fallback, invalid points, missing locations and province isolation.
  execFileSync('python3', ['-c', `
import csv, io, sys, zipfile
from pathlib import Path
folder = Path(sys.argv[1])
def csv_text(headers, rows):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream)
    writer.writerow(headers)
    writer.writerows(rows)
    return '\\ufeff' + stream.getvalue()
with zipfile.ZipFile(folder / '202606.zip', 'w') as archive:
    for part, rows in enumerate([
        [('a', 'L7P2R5'), ('a', 'L7P 2R5'), ('b', 'L7P2R6'), ('missing', 'L7P2Z9')],
        [('c', 'K1R6P0'), ('d', 'P7B5E1'), ('e', 'N0H1G0'), ('missing', 'L9Z9Z9'), ('x', 'INVALID')],
    ], 1):
        archive.writestr(f'Addresses/Address_35_part_{part}.csv', csv_text(['LOC_GUID', 'MAIL_POSTAL_CODE'], rows))
    for part, rows in enumerate([
        [('b', 'nan', '-79', '43.4', '-79.8'), ('c', '', '', '45.4', '-75.7'), ('bad', '999', '-79', '', '')],
        [('a', '43.3', '-79.9', '50', '-80'), ('d', '48.4', '-89.2', '', ''), ('e', '44.7', '-81.1', '', '')],
    ], 1):
        archive.writestr(f'Locations/Location_35_part_{part}.csv', csv_text(
            ['LOC_GUID', 'BF_REPPOINT_LATITUDE', 'BF_REPPOINT_LONGITUDE', 'BG_LATITUDE', 'BG_LONGITUDE'], rows))
    archive.writestr('Addresses/Address_24.csv', 'LOC_GUID,MAIL_POSTAL_CODE\\nqc,H2X1Y4\\n')
    archive.writestr('Locations/Location_24.csv', 'LOC_GUID,BG_LATITUDE,BG_LONGITUDE\\nqc,45.5,-73.5\\n')
`, directory]);
  execFileSync('python3', ['scripts/build-nar-postal-centroids.py', '--zip', join(directory, '202606.zip'),
    '--output', join(directory, 'centroids.sql'), '--report', join(directory, 'report.json')]);
  sql = readFileSync(join(directory, 'centroids.sql'), 'utf8');
  report = JSON.parse(readFileSync(join(directory, 'report.json'), 'utf8'));
});

afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

function fixture() {
  const data = createOdaFixtureEnv();
  data.sqlite.exec(sql);
  return { ...data, env: { ...createLookupTestEnv(), ODA_DB: data.d1,
    ODA_GEOCODING_ENABLED: 'true', ODA_PROVINCES: 'ON,QC' } };
}

const zoneMatch = {
  requestedPostalCode: 'L7P 2Z9', matchedPrefix: 'L7P 2', matchedPostalCodes: [],
};

describe('NAR province-wide postal centroids', () => {
  it('refuses a missing province without emitting a destructive SQL file', () => {
    const output = join(directory, 'missing-province.sql');
    expect(() => execFileSync('python3', ['scripts/build-nar-postal-centroids.py',
      '--zip', join(directory, '202606.zip'), '--province', 'YT', '--output', output],
    { stdio: 'pipe' })).toThrow();
    expect(existsSync(output)).toBe(false);
  });

  it('joins all archive parts and weights zones by addresses, with coordinate fallback', () => {
    const data = fixture();
    try {
      const zone = data.sqlite.prepare("SELECT * FROM oda_postal_centroids WHERE postal_code='L7P 2'").get();
      expect(zone).toMatchObject({ address_count: 3 });
      expect(zone?.lat).toBeCloseTo((43.3 * 2 + 43.4) / 3, 8);
      expect(zone?.lon).toBeCloseTo((-79.9 * 2 - 79.8) / 3, 8);
      expect(data.sqlite.prepare("SELECT * FROM oda_postal_centroids WHERE postal_code='K1R 6P0'").get()).toMatchObject({ lat: 45.4, lon: -75.7 });
      expect(report).toMatchObject({ joined_postal_rows: 6, unresolved_postal_rows: 2,
        full_centroids: 5, zone_centroids: 4, invalid_location_rows: 1, source_postal_codes: 7 });
      expect(report.full_code_coverage).toBeCloseTo(5 / 7);
      expect(report.full_or_zone_coverage).toBeCloseTo(6 / 7);
      expect(sql).not.toContain('H2X');
      // Replaying the import preserves existing ODA full codes and is idempotent.
      data.sqlite.exec("INSERT INTO oda_postal_centroids VALUES ('ON', 'L9Z 9', 44, -80, 1), ('QC', 'H2X 1', 45.5, -73.5, 1)");
      data.sqlite.exec(sql);
      expect(data.sqlite.prepare("SELECT address_count FROM oda_postal_centroids WHERE postal_code='L7P 2'").get()).toMatchObject({ address_count: 3 });
      expect(data.sqlite.prepare("SELECT * FROM oda_postal_centroids WHERE postal_code='M5V 2T6'").get()).toBeDefined();
      expect(data.sqlite.prepare("SELECT * FROM oda_postal_centroids WHERE postal_code='L9Z 9'").get()).toBeUndefined();
      expect(data.sqlite.prepare("SELECT * FROM oda_postal_centroids WHERE postal_code='H2X 1'").get()).toBeDefined();
    } finally { data.close(); }
  });

  it.each([
    ['L7P2R5', 43.3, -79.9], ['K1R6P0', 45.4, -75.7],
    ['P7B5E1', 48.4, -89.2], ['N0H1G0', 44.7, -81.1],
  ] as const)('resolves %s through full NAR centroids', async (postal, lat, lon) => {
    const data = fixture();
    try {
      expect(await geocodePostalCentroidWithOda(data.env, { postal })).toMatchObject({
        geocodeMethod: 'postal_centroid', confidence: 0.85, lat, lon,
      });
    } finally { data.close(); }
  });

  it('uses a zone before prefix siblings without claiming an exact postal match', async () => {
    const data = fixture();
    try {
      for (const geocode of [geocodePostalCentroidWithOda, geocodeWithOda]) {
        const result = await geocode(data.env, { postal: 'l7p 2z9' });
        expect(result).toMatchObject({ geocodeMethod: 'postal_centroid', confidence: 0.75, postalMatch: zoneMatch });
        expect(result.lat).toBeCloseTo((43.3 * 2 + 43.4) / 3);
        expect(result.addressComponents?.postal_code).toBeUndefined();
        expect(result.mailingAddress?.postalCode).toBeUndefined();
      }
    } finally { data.close(); }
  });

  it('respects province, strict mode and confidence thresholds in batch and single requests', async () => {
    const data = fixture();
    try {
      const query = { postal: 'L7P2Z9' };
      const results = await geocodeBatchPostalCentroidsWithOda(data.env, [query,
        { ...query, geocodeMethod: 'postal_centroid' }, { ...query, state: 'QC' }, { postal: 'L9Z9Z9' }]);
      expect(results.map((result) => result.success)).toEqual([true, false, false, false]);
      expect(results[0]).toMatchObject({ postalMatch: zoneMatch, confidence: 0.75 });
      await expect(geocodePostalCentroidWithOda({ ...data.env, ODA_MIN_CONFIDENCE: '0.8' }, query))
        .rejects.toMatchObject({ code: 'LOW_CONFIDENCE_GEOCODE' });
    } finally { data.close(); }
  });

  it('serves the issue repro and preserves zone metadata through cached HTTP responses', async () => {
    const data = fixture();
    try {
      const exact = await fetchLookup(data.env, '/api/demo/geocode?postal=L7P2R5');
      expect(exact.status).toBe(200);
      expect(await exact.json()).toMatchObject({ geocodeMethod: 'postal_centroid', confidence: 0.85 });
      const first = await fetchLookup(data.env, '/api/demo/geocode?postal=L7P2Z9');
      expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({ postalMatch: zoneMatch, confidence: 0.75 });
      // Riding lookups use the existing edge KV cache. Seed a zone inside the Toronto
      // riding fixture, then remove it to prove the cache retains approximation metadata.
      data.sqlite.exec("INSERT INTO oda_postal_centroids VALUES ('ON', 'M5V 9', 43.64, -79.4, 1)");
      const cachedMatch = { requestedPostalCode: 'M5V 9Z9', matchedPrefix: 'M5V 9', matchedPostalCodes: [] };
      const lookup = await fetchLookup(data.env, '/api/demo/federal?postal=M5V9Z9');
      expect(lookup.status).toBe(200);
      expect(await lookup.json()).toMatchObject({ geocode: { method: 'postal_centroid', postalMatch: cachedMatch, confidence: 0.75 } });
      data.sqlite.exec("DELETE FROM oda_postal_centroids WHERE postal_code='M5V 9'");
      const second = await fetchLookup(data.env, '/api/demo/federal?postal=M5V9Z9');
      expect(second.status).toBe(200);
      expect(await second.json()).toMatchObject({ geocode: { method: 'postal_centroid', postalMatch: cachedMatch, confidence: 0.75 } });
    } finally { data.close(); }
  });
});
