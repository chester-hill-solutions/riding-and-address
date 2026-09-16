import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildNarCityScope,
  matchesNarCity,
  narCoordinates,
  narRowCity,
  narRowProvince,
  normalizeNarRow,
} from '../src/nar-normalize';

/**
 * The fixture is small enough to parse by splitting on commas: none of its values are quoted.
 * It mirrors the June 2026 address layout, with WGS84 columns added so the fixture also works
 * through `--file` (which has no Locations file to join against).
 */
function loadFixture(): Array<Record<string, string>> {
  const text = readFileSync('test/fixtures/nar/fixture.csv', 'utf-8');
  const [headerLine, ...lines] = text.split('\n').filter((line) => line.trim());
  const headers = headerLine.split(',').map((h) => h.trim());
  return lines.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? '').trim()]));
  });
}

const rows = loadFixture();
const byAddress = new Map(rows.map((row) => [row.ADDR_GUID, row]));

describe('nar-normalize', () => {
  it('reads the mailing municipality, falling back to the census subdivision', () => {
    expect(narRowCity(byAddress.get('addr-a')!)).toBe('TORONTO');
    expect(narRowCity({ CSD_ENG_NAME: 'Toronto' })).toBe('Toronto');
  });

  it('derives the province from the mailing abbreviation or the numeric code', () => {
    expect(narRowProvince(byAddress.get('addr-a')!)).toBe('ON');
    // addr-j has no MAIL_PROV_ABVN; PROV_CODE 35 must stand in.
    expect(byAddress.get('addr-j')!.MAIL_PROV_ABVN).toBe('');
    expect(narRowProvince(byAddress.get('addr-j')!)).toBe('ON');
    expect(narRowProvince(byAddress.get('addr-h')!)).toBe('QC');
  });

  it('normalizes a NAR row into the ODA row shape', () => {
    const row = normalizeNarRow(byAddress.get('addr-a')!);
    expect(row).not.toBeNull();
    expect(row!.city).toBe('TORONTO');
    expect(row!.province).toBe('ON');
    expect(row!.cityKey).toBe('TORONTO|ON');
    expect(row!.civicNumber).toBe('123');
    // validatePostalCode canonicalises to the A1A 1A1 form, as it does for ODA rows.
    expect(row!.postalCode).toBe('M5V 2T6');
    expect(row!.lat).toBeCloseTo(43.6453, 4);
  });

  it('prefers the mailing street over the official street', () => {
    // addr-a carries OFFICIAL_STREET_NAME "OFFICIAL MAIN" and MAIL_STREET_NAME "MAIN".
    expect(normalizeNarRow(byAddress.get('addr-a')!)!.streetName).toBe('MAIN');
  });

  it('joins the civic number and its suffix, and keeps the apartment label', () => {
    expect(normalizeNarRow(byAddress.get('addr-g')!)!.civicNumber).toBe('12A');
    expect(normalizeNarRow(byAddress.get('addr-f')!)!.unit).toBe('1205');
  });

  it('normalizes Quebec accents and street types', () => {
    const row = normalizeNarRow(byAddress.get('addr-h')!);
    expect(row!.cityKey).toBe('MONTREAL|QC');
    expect(row!.streetKey).toBe('SAINT-PAUL|RUE');
  });

  it('drops rows with no coordinates', () => {
    expect(normalizeNarRow(byAddress.get('addr-e')!)).toBeNull();
  });

  it('accepts coordinates from a Locations join and prefers blockface over building', () => {
    expect(narCoordinates({ BG_LATITUDE: '43.1', BG_LONGITUDE: '-79.1' })).toEqual({ lat: 43.1, lon: -79.1 });
    expect(
      narCoordinates({ BF_REPPOINT_LATITUDE: '43.2', BF_REPPOINT_LONGITUDE: '-79.2', BG_LATITUDE: '43.1', BG_LONGITUDE: '-79.1' })
    ).toEqual({ lat: 43.2, lon: -79.2 });
    expect(narCoordinates({})).toBeUndefined();
  });

  it('scopes a city to every spelling the lookup cascade will try', () => {
    const toronto = buildNarCityScope('Toronto', 'ON');
    expect(toronto.canonicalToken).toBe('TORONTO');
    expect(toronto.cityKeys).toEqual(
      expect.arrayContaining([
        'TORONTO|ON',
        'FORMER TORONTO|ON',
        'SCARBOROUGH|ON',
        'NORTH YORK|ON',
        'ETOBICOKE|ON',
        'YORK|ON',
        'EAST YORK|ON',
      ])
    );
  });

  it('scopes Quebec to Quebec City, its ODA spelling', () => {
    expect(buildNarCityScope('Quebec', 'QC').cityKeys).toContain('QUEBEC CITY|QC');
  });

  it('matches only the scoped municipality', () => {
    const toronto = buildNarCityScope('Toronto', 'ON');
    expect(matchesNarCity('TORONTO', toronto)).toBe(true);
    expect(matchesNarCity(' NORTH YORK ', toronto)).toBe(true);
    expect(matchesNarCity('SCARBOROUGH', toronto)).toBe(true);
    expect(matchesNarCity('MISSISSAUGA', toronto)).toBe(false);
    expect(matchesNarCity('MONTRÉAL', toronto)).toBe(false);
    expect(matchesNarCity('', toronto)).toBe(false);
  });

  it('classifies every fixture row by the Toronto scope', () => {
    const toronto = buildNarCityScope('Toronto', 'ON');
    const matched = rows
      .filter((row) => narRowProvince(row) === 'ON' && matchesNarCity(narRowCity(row), toronto))
      .map((row) => row.ADDR_GUID)
      .sort();
    // addr-e is in scope by municipality but has no coordinates, so the importer drops it later.
    expect(matched).toEqual(['addr-a', 'addr-b', 'addr-c', 'addr-e', 'addr-f', 'addr-g', 'addr-j']);
  });
});
