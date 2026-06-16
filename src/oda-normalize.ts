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
const STREET_TYPE_SEARCH: Record<string, string> = {
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
