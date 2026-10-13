import { expandCityCandidates } from './oda-city-aliases';
import {
  NormalizedOdaRow,
  buildCityKey,
  buildSearchKey,
  buildStreetKey,
  normalizePostalCode,
  normalizeProvince,
  normalizeSearchToken,
} from './oda-normalize';

/**
 * StatCan National Address Register (NAR) → the same normalized shape the ODA importer uses.
 *
 * The NAR and the ODA are different vintages of overlapping reference data, not different
 * products: the whole point of importing NAR city-by-city is to replace ODA rows in the tables
 * the runtime already reads. Reusing `NormalizedOdaRow` keeps every downstream step
 * (mailing fields, search_key, street_key, centroids) identical, so a refreshed city behaves
 * exactly like an ODA city to the lookup cascade.
 *
 * Since June 2026 the address file carries no WGS84 coordinates at all — only projected
 * `BG_X`/`BF_REPPOINT_X` — and latitude/longitude live in the separate `Locations/` files keyed
 * by `LOC_GUID`. The importer therefore joins the two, passing the coordinates in. The row-level
 * keys are still read as a fallback so older vintages (December 2024 had `REPPOINT_LATITUDE` in
 * the address file) load with the same code.
 */

/**
 * Latitude columns in preference order.
 *
 * Blockface (`BF_REPPOINT`) first: it is what StatCan documents the ODA's own coordinates as
 * being derived from, and on this release it is both the more complete and the more
 * street-consistent of the two (measured on Address_35_part_1: 99.2% vs 93.5%).
 */
const LATITUDE_KEYS = ['BF_REPPOINT_LATITUDE', 'BG_LATITUDE', 'REPPOINT_LATITUDE'] as const;
const LONGITUDE_KEYS = ['BF_REPPOINT_LONGITUDE', 'BG_LONGITUDE', 'REPPOINT_LONGITUDE'] as const;

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = (value ?? '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function firstNumber(keys: readonly string[], row: Record<string, string>): number {
  for (const key of keys) {
    const raw = (row[key] ?? '').trim();
    if (!raw) continue;
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

/** `CIVIC_NO` is numeric and `CIVIC_NO_SUFFIX` carries the letter, e.g. 555 + A → `555A`. */
function joinCivicNumber(no: string | undefined, suffix: string | undefined): string {
  const base = (no ?? '').trim();
  const tail = (suffix ?? '').trim();
  if (!base) return '';
  return tail ? `${base}${tail}` : base;
}

export interface NarCoordinates {
  lat: number;
  lon: number;
}

/** WGS84 point for a NAR row, whatever the vintage: locations file first, then row columns. */
export function narCoordinates(row: Record<string, string>): NarCoordinates | undefined {
  const lat = firstNumber(LATITUDE_KEYS, row);
  const lon = firstNumber(LONGITUDE_KEYS, row);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : undefined;
}

/** The mailing municipality a NAR address row is filed under (e.g. `TORONTO`, `SCARBOROUGH`). */
export function narRowCity(row: Record<string, string>): string {
  return firstNonEmpty(row.MAIL_MUN_NAME, row.CSD_ENG_NAME);
}

/** Two-letter province for a NAR row, from the mailing abbreviation or the numeric code. */
export function narRowProvince(row: Record<string, string>): string | undefined {
  return normalizeProvince(row.MAIL_PROV_ABVN || row.PROV_CODE || '');
}

export function normalizeNarRow(
  row: Record<string, string>,
  coords?: NarCoordinates
): NormalizedOdaRow | null {
  const point = coords ?? narCoordinates(row);
  if (!point) return null;
  const { lat, lon } = point;

  const province = narRowProvince(row);
  if (!province) return null;

  const city = narRowCity(row);
  if (!city) return null;

  const civicNumber = joinCivicNumber(row.CIVIC_NO, row.CIVIC_NO_SUFFIX);
  // Mailing street wins over official street: the runtime serves and matches the Canada Post
  // form a caller actually types, and the two differ mainly in case/punctuation.
  const streetName = firstNonEmpty(row.MAIL_STREET_NAME, row.OFFICIAL_STREET_NAME);
  const streetType = firstNonEmpty(row.MAIL_STREET_TYPE, row.OFFICIAL_STREET_TYPE);
  const streetDirection = firstNonEmpty(row.MAIL_STREET_DIR, row.OFFICIAL_STREET_DIR);
  const unit = (row.APT_NO_LABEL ?? '').trim();
  const postalCode = normalizePostalCode(row.MAIL_POSTAL_CODE) || '';

  const streetLine = [civicNumber, streetName, streetType, streetDirection]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const fullAddress = [unit ? `${unit}-${streetLine}` : streetLine, city, `${province} ${postalCode}`.trim()]
    .filter(Boolean)
    .join(', ');

  return {
    civicNumber,
    streetName,
    streetType,
    streetDirection,
    unit,
    postalCode,
    city,
    province,
    cityKey: buildCityKey(city, province),
    lat,
    lon,
    fullAddress,
    searchKey: buildSearchKey({
      civic: civicNumber,
      streetName,
      streetType,
      streetDirection,
      city,
      province,
    }),
    streetKey: buildStreetKey(streetName, streetType, streetDirection),
  };
}

/**
 * The delete scope for a city refresh, in normalized terms.
 *
 * `cityKeys` is deliberately wider than the NAR's own spelling: ODA filed Toronto's addresses
 * under six pre-amalgamation municipalities, so refreshing "Toronto" has to sweep all of them
 * or the old rows survive next to the new ones. The alias expansion is the same one the lookup
 * cascade already uses, so refresh and query agree on what "Toronto" means.
 */
export interface NarCityScope {
  /** The caller's own normalized city token, e.g. `TORONTO`. Provenance keys off this. */
  canonicalToken: string;
  /** Tokens accepted from the NAR `MAIL_MUN_NAME`, e.g. TORONTO + the six former boroughs. */
  tokens: Set<string>;
  /** `city_key` values to delete, e.g. `TORONTO|ON`, `SCARBOROUGH|ON`, … */
  cityKeys: string[];
}

export function buildNarCityScope(city: string, province: string): NarCityScope {
  const tokens = expandCityCandidates(city, province);
  if (tokens.length === 0) {
    throw new Error(`City name is empty after normalization: ${JSON.stringify(city)}`);
  }
  const cityKeys = Array.from(new Set(tokens.map((token) => `${token}|${province}`)));
  return { canonicalToken: tokens[0], tokens: new Set(tokens), cityKeys };
}

export function matchesNarCity(rowCity: string | undefined, scope: NarCityScope): boolean {
  const token = normalizeSearchToken(rowCity);
  return Boolean(token) && scope.tokens.has(token);
}
