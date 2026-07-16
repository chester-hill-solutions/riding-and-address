import { validatePostalCode } from './utils';

/** StatCan province/territory numeric ID → two-letter code */
export const PROVINCE_ID_TO_CODE: Record<string, string> = {
  '10': 'NL',
  '11': 'PE',
  '12': 'NS',
  '13': 'NB',
  '24': 'QC',
  '35': 'ON',
  '46': 'MB',
  '47': 'SK',
  '48': 'AB',
  '59': 'BC',
  '60': 'YT',
  '61': 'NT',
  '62': 'NU',
};

export const PROVINCE_NAME_TO_CODE: Record<string, string> = {
  NL: 'NL',
  NEWFOUNDLAND: 'NL',
  PE: 'PE',
  PEI: 'PE',
  'PRINCE EDWARD ISLAND': 'PE',
  NS: 'NS',
  'NOVA SCOTIA': 'NS',
  NB: 'NB',
  'NEW BRUNSWICK': 'NB',
  QC: 'QC',
  QUE: 'QC',
  QUEBEC: 'QC',
  QUÉBEC: 'QC',
  ON: 'ON',
  ONT: 'ON',
  ONTARIO: 'ON',
  MB: 'MB',
  MANITOBA: 'MB',
  SK: 'SK',
  SASKATCHEWAN: 'SK',
  AB: 'AB',
  ALBERTA: 'AB',
  BC: 'BC',
  'BRITISH COLUMBIA': 'BC',
  YT: 'YT',
  YUKON: 'YT',
  NT: 'NT',
  'NORTHWEST TERRITORIES': 'NT',
  NU: 'NU',
  NUNAVUT: 'NU',
};

/** Search normalization: expand abbreviations to canonical search tokens */
/**
 * Street types ODA stores verbatim, mapped to themselves.
 *
 * These MUST stay identity mappings. The ~10M rows already in D1 had their `search_key`
 * built by this same table, and any type absent from it fell through to an identity
 * fallback — so a row whose type is LANE is stored as `...|LANE|...`. Canonicalising
 * any of these now (LANE -> LN, say) would make every query miss the data already
 * imported. They are listed here purely so `parseStreetTail` recognises them as types
 * rather than folding them into the street name.
 *
 * Derived from the data, not guessed:
 *   SELECT street_type, COUNT(*) FROM oda_addresses WHERE province='ON' GROUP BY 1
 * Ordered by address count. Ontario only for now; Quebec's French types are unverified.
 *
 * Single letters, bare digits and UNKNOWN are deliberately excluded: treating them as
 * street types would misparse ordinary addresses for a handful of rows each.
 */
const ODA_VERBATIM_STREET_TYPES = [
  'LANE', 'WAY', 'CIR', 'TRAIL', 'LINE', 'PVT', 'TERR', 'SQ', 'GATE', 'SIDERD', 'ISLAND', 'CR',
  'LN', 'GDNS', 'RIDGE', 'GROVE', 'MEWS', 'CLOSE', 'WALK', 'BAY', 'PATH', 'HTS', 'CT', 'COMMON',
  'HILL', 'RUN', 'ROW', 'WOOD', 'VIA', 'GLEN', 'HOLLOW', 'PK', 'TLINE', 'CHASE', 'GARDENS',
  'HY', 'MANOR', 'PROM', 'CIRCT', 'GREEN', 'CROSS', 'PT', 'LI', 'VILLGE', 'HEIGHTS', 'LOOP',
  'BEACH', 'RTE', 'CONCESSION', 'CONC', 'PASS', 'COVE', 'STREETLOUTH', 'WY', 'BEND', 'FOREST',
  'LANDNG', 'CROSSING', 'PARK', 'VOIE', 'RISE', 'MALL', 'VIEW', 'QUAY', 'BRNE', 'VISTA',
  'MEADOW', 'END', 'CERCLE', 'MONTEE', 'SHORE', 'AVENUELOUTH', 'DOWNS', 'GLADE', 'GS', 'MOUNT',
  'MILLWAY', 'HT', 'LANDING', 'FARM', 'OUTLOOK', 'COUR', 'PORT', 'TSSE', 'PKWY', 'LKOUT',
  'COTE', 'HEATH', 'GD', 'KNOLL', 'CHART', 'KEY', 'WALKWAY', 'RLE', 'ACRES', 'CROIS', 'DELL',
  'VALE', 'ALLEY', 'RANG', 'CORNERS', 'HEIGHT', 'LINK', 'GV', 'WATERWAY', 'HARBOUR', 'COURS',
  'LAKEWAY', 'PINES', 'GATEWAY', 'FIELD', 'GALLERY', 'WHARF', 'CTR', 'CROFT', 'TRACE', 'PLAZA',
  'FRONT', 'TRNABT', 'MARSH', 'DALE', 'BYPASS', 'ABBEY', 'WYND', 'ORCH', 'LEA', 'GT', 'ESTATES',
  'ROUND', 'HALL', 'SRD', 'TL', 'ME', 'CURVE', 'PY', 'BYWAY', 'TOWERS', 'TOP', 'CAPE', 'WW',
  'WLK', 'PARADE', 'SIDELINE', 'PTH', 'ISLE', 'GREENWAY',
] as const;

/**
 * Types that canonicalise to a different token. Import applied these too, so a row whose
 * raw type is DRIVE is stored as `...|DR|...` — changing a target here would strand data.
 */
const STREET_TYPE_CANONICAL: Record<string, string> = {
  ST: 'ST',
  STREET: 'ST',
  AVE: 'AVE',
  AV: 'AVE',
  AVENUE: 'AVE',
  RD: 'RD',
  ROAD: 'RD',
  BLVD: 'BLVD',
  BOULEVARD: 'BLVD',
  CRES: 'CRES',
  CRESCENT: 'CRES',
  DR: 'DR',
  DRIVE: 'DR',
  CRT: 'CRT',
  COURT: 'CRT',
  PL: 'PL',
  PLACE: 'PL',
  PKY: 'PKY',
  PARKWAY: 'PKY',
  HWY: 'HWY',
  HIGHWAY: 'HWY',
  RUE: 'RUE',
  CH: 'CH',
  CHEMIN: 'CH',
};

const STREET_TYPE_SEARCH: Record<string, string> = {
  ...Object.fromEntries(ODA_VERBATIM_STREET_TYPES.map((type) => [type, type])),
  // Canonical mappings win: a token in both tables must canonicalise, not self-map.
  ...STREET_TYPE_CANONICAL,
};

const STREET_DIR_SEARCH: Record<string, string> = {
  N: 'N',
  S: 'S',
  E: 'E',
  W: 'W',
  NE: 'NE',
  NW: 'NW',
  SE: 'SE',
  SW: 'SW',
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W',
};

export interface ParsedCivicNumber {
  raw: string;
  numeric: number | null;
  suffix: string;
}

export interface ParsedAddressQuery {
  civic?: string;
  civicParsed?: ParsedCivicNumber;
  streetName?: string;
  streetType?: string;
  streetDirection?: string;
  unit?: string;
  postal?: string;
  city?: string;
  province?: string;
}

export interface NormalizedOdaRow {
  civicNumber: string;
  streetName: string;
  streetType: string;
  streetDirection: string;
  unit: string;
  postalCode: string;
  city: string;
  province: string;
  cityKey: string;
  lat: number;
  lon: number;
  fullAddress: string;
  searchKey: string;
  streetKey: string;
}

export function foldAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase();
}

export function normalizeSearchToken(value: string | undefined): string {
  if (!value) return '';
  return foldAccents(value)
    .replace(/[^A-Z0-9\s/-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeProvince(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    return PROVINCE_ID_TO_CODE[trimmed];
  }
  const key = foldAccents(trimmed);
  return PROVINCE_NAME_TO_CODE[key];
}

export function normalizeStreetType(type: string | undefined): string {
  if (!type) return '';
  const key = normalizeSearchToken(type);
  return STREET_TYPE_SEARCH[key] || key;
}

export function normalizeStreetDirection(dir: string | undefined): string {
  if (!dir) return '';
  const key = normalizeSearchToken(dir);
  return STREET_DIR_SEARCH[key] || key;
}

export function normalizePostalCode(postal: string | undefined): string | undefined {
  if (!postal) return undefined;
  const result = validatePostalCode(postal);
  return result.valid ? result.sanitized : undefined;
}

export function parseCivicNumber(raw: string | undefined): ParsedCivicNumber | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().toUpperCase();
  const match = cleaned.match(/^(\d+(?:\s+\d+\/\d+)?)([A-Z]?)$/);
  if (!match) {
    return { raw: cleaned, numeric: null, suffix: '' };
  }
  const numericPart = match[1].replace(/\s+\d+\/\d+$/, '');
  const numeric = parseInt(numericPart, 10);
  return {
    raw: cleaned,
    numeric: Number.isFinite(numeric) ? numeric : null,
    suffix: match[2] || '',
  };
}

export function buildCityKey(city: string, province: string): string {
  return `${normalizeSearchToken(city)}|${province}`;
}

export function buildStreetKey(
  streetName: string,
  streetType: string,
  streetDirection: string
): string {
  return [
    normalizeSearchToken(streetName),
    normalizeStreetType(streetType),
    normalizeStreetDirection(streetDirection),
  ]
    .filter(Boolean)
    .join('|');
}

/** Canonical outputs of normalizeStreetType / normalizeStreetDirection. Disjoint sets. */
const STREET_TYPE_VALUES: ReadonlySet<string> = new Set(Object.values(STREET_TYPE_SEARCH));
const STREET_DIR_VALUES: ReadonlySet<string> = new Set(Object.values(STREET_DIR_SEARCH));

export interface ParsedStreetKey {
  streetName: string;
  streetType: string;
  streetDirection: string;
}

/**
 * Inverse of buildStreetKey. Since buildStreetKey drops empty parts, position alone is
 * ambiguous (`MAIN|N` is name+direction, `MAIN|ST` is name+type), so parts are classified
 * from the end against the canonical value sets rather than by index.
 *
 * Unknown street types survive buildStreetKey unmapped, so they fold back into streetName
 * rather than round-tripping. That is lossless for display, which is the only consumer.
 */
export function parseStreetKey(streetKey: string): ParsedStreetKey {
  const parts = streetKey.split('|').filter(Boolean);
  if (parts.length === 0) {
    return { streetName: '', streetType: '', streetDirection: '' };
  }
  // A lone part is always the name — a street genuinely named "ST" must not parse as a bare type.
  if (parts.length === 1) {
    return { streetName: parts[0], streetType: '', streetDirection: '' };
  }

  let streetDirection = '';
  if (STREET_DIR_VALUES.has(parts[parts.length - 1])) {
    streetDirection = parts.pop()!;
  }

  let streetType = '';
  if (parts.length > 1 && STREET_TYPE_VALUES.has(parts[parts.length - 1])) {
    streetType = parts.pop()!;
  }

  return { streetName: parts.join(' '), streetType, streetDirection };
}

/** Display label for a street container, e.g. `MAIN|ST|N` -> "Main St N". */
export function formatStreetLabel(streetKey: string): string {
  const { streetName, streetType, streetDirection } = parseStreetKey(streetKey);
  return [titleCaseStreet(streetName), titleCaseStreet(streetType), streetDirection]
    .filter(Boolean)
    .join(' ');
}

function titleCaseStreet(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s/-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function buildSearchKey(parts: {
  civic?: string;
  streetName?: string;
  streetType?: string;
  streetDirection?: string;
  city?: string;
  province?: string;
}): string {
  return [
    normalizeSearchToken(parts.civic),
    normalizeSearchToken(parts.streetName),
    normalizeStreetType(parts.streetType),
    normalizeStreetDirection(parts.streetDirection),
    normalizeSearchToken(parts.city),
    parts.province || '',
  ].join('|');
}

/** Parse street tokens after civic number is extracted */
function parseStreetTail(rest: string): {
  streetName?: string;
  streetType?: string;
  streetDirection?: string;
} {
  const tokens = rest.trim().split(/\s+/);
  if (tokens.length === 0) {
    return {};
  }

  const last = tokens[tokens.length - 1].toUpperCase();
  const secondLast = tokens.length > 1 ? tokens[tokens.length - 2].toUpperCase() : '';

  if (STREET_DIR_SEARCH[last]) {
    const streetType = tokens.length > 2 ? normalizeStreetType(tokens[tokens.length - 2]) : '';
    const streetName = tokens.slice(0, -2).join(' ') || tokens[0];
    return {
      streetName,
      streetType: streetType || undefined,
      streetDirection: normalizeStreetDirection(last),
    };
  }

  if (STREET_TYPE_SEARCH[last] || STREET_TYPE_SEARCH[secondLast]) {
    const streetType = normalizeStreetType(last);
    const streetName = tokens.slice(0, -1).join(' ');
    return { streetName, streetType };
  }

  return { streetName: rest.trim() };
}

/** Normalize unit identifiers for DB comparison */
export function normalizeUnit(unit: string | undefined): string {
  if (!unit) return '';
  return normalizeSearchToken(unit.replace(/^#/, ''));
}

/** Parse a free-form address string into civic, unit, and street components */
export function parseFreeformAddress(address: string): {
  civic?: string;
  streetName?: string;
  streetType?: string;
  streetDirection?: string;
  unit?: string;
} {
  let normalized = address.trim();
  let unit: string | undefined;

  const unitCommaSuffixMatch = normalized.match(/^(.+?),\s*Unit\s+#?\s*(\S+)\s*$/i);
  if (unitCommaSuffixMatch) {
    normalized = unitCommaSuffixMatch[1].trim();
    unit = unitCommaSuffixMatch[2].replace(/[,;]+$/, '');
  }

  const unitSuffixMatch = normalized.match(/^(.+?)\s+UNIT\s+(\S+)\s*$/i);
  if (unitSuffixMatch) {
    normalized = unitSuffixMatch[1].trim();
    unit = unitSuffixMatch[2];
  }

  const unitPrefixMatch = normalized.match(/^Unit\s+(\S+)\s*,?\s+(.+)$/i);
  if (unitPrefixMatch) {
    unit = unitPrefixMatch[1].replace(/[,;]+$/, '');
    normalized = unitPrefixMatch[2].trim();
  }

  const inlineUnitMatch = normalized.match(/^(\d+)\s+Unit\s+(\S+)\s+(.+)$/i);
  if (inlineUnitMatch) {
    unit = inlineUnitMatch[2];
    normalized = `${inlineUnitMatch[1]} ${inlineUnitMatch[3]}`;
  }

  // Canadian condo format: unit-civic dash (e.g. 901-560 Birchmount Rd)
  const unitCivicMatch = normalized.match(/^(\d+)-(\d+)\s+(.+)$/);
  if (unitCivicMatch) {
    unit = unitCivicMatch[1];
    normalized = `${unitCivicMatch[2]} ${unitCivicMatch[3]}`;
  }

  const civicMatch = normalized.match(/^(\d+[A-Za-z]?(?:\s+\d+\/\d+)?)\s+(.+)$/);
  if (!civicMatch) {
    return { streetName: normalized, unit };
  }

  const street = parseStreetTail(civicMatch[2]);
  return { civic: civicMatch[1], unit, ...street };
}

export function parseAddressQuery(input: {
  address?: string;
  postal?: string;
  city?: string;
  state?: string;
}): ParsedAddressQuery {
  const province = normalizeProvince(input.state);
  const postal = normalizePostalCode(input.postal);
  const city = input.city ? normalizeSearchToken(input.city) : undefined;

  if (!input.address) {
    return { postal, city, province };
  }

  const parsed = parseFreeformAddress(input.address);
  return {
    civic: parsed.civic,
    civicParsed: parseCivicNumber(parsed.civic),
    streetName: parsed.streetName ? normalizeSearchToken(parsed.streetName) : undefined,
    streetType: parsed.streetType,
    streetDirection: parsed.streetDirection,
    unit: parsed.unit ? normalizeUnit(parsed.unit) : undefined,
    postal,
    city,
    province,
  };
}

export function normalizeOdaCsvRow(row: Record<string, string>): NormalizedOdaRow | null {
  const lat = parseFloat(row.Latitude || row.latitude || '');
  const lon = parseFloat(row.Longitude || row.longitude || '');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const provinceRaw =
    row['Province or Territory Unique Identifier'] ||
    row.Province ||
    row.pruid ||
    '';
  const province = normalizeProvince(provinceRaw) || provinceRaw;
  if (!province || province.length !== 2) return null;

  const city = row['Processed City'] || row.city_pcs || row.City || row.city || '';
  const civicNumber = (row['Civic Number'] || row.street_no || '').trim();
  const streetName =
    row['Standardized Street Name'] ||
    row.str_name_pcs ||
    row['Street Name'] ||
    row.str_name ||
    '';
  const streetType =
    row['Standardized Street Type'] ||
    row.str_type_pcs ||
    row['Street Type'] ||
    row.str_type ||
    '';
  const streetDirection =
    row['Standardized Street Direction'] ||
    row.str_dir_pcs ||
    row['Street Direction'] ||
    row.str_dir ||
    '';
  const unit = (row.Unit || row.unit || '').trim();
  const postalCode = normalizePostalCode(row['Postal Code'] || row.postal_code || '') || '';
  const fullAddress = row['Full Address'] || row.full_addr || '';

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
