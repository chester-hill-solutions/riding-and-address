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

/** Parse a free-form address string into civic + street components */
export function parseFreeformAddress(address: string): {
  civic?: string;
  streetName?: string;
  streetType?: string;
  streetDirection?: string;
} {
  const normalized = address.trim();
  const civicMatch = normalized.match(/^(\d+[A-Za-z]?(?:\s+\d+\/\d+)?)\s+(.+)$/);
  if (!civicMatch) {
    return { streetName: normalized };
  }

  const civic = civicMatch[1];
  const rest = civicMatch[2].trim();
  const tokens = rest.split(/\s+/);
  if (tokens.length === 0) {
    return { civic };
  }

  const last = tokens[tokens.length - 1].toUpperCase();
  const secondLast = tokens.length > 1 ? tokens[tokens.length - 2].toUpperCase() : '';

  if (STREET_DIR_SEARCH[last]) {
    const streetType = tokens.length > 2 ? normalizeStreetType(tokens[tokens.length - 2]) : '';
    const streetName = tokens.slice(0, -2).join(' ') || tokens[0];
    return {
      civic,
      streetName,
      streetType: streetType || undefined,
      streetDirection: normalizeStreetDirection(last),
    };
  }

  if (STREET_TYPE_SEARCH[last] || STREET_TYPE_SEARCH[secondLast]) {
    const streetType = normalizeStreetType(last);
    const streetName = tokens.slice(0, -1).join(' ');
    return { civic, streetName, streetType };
  }

  return { civic, streetName: rest };
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
    postal,
    city,
    province,
  };
}

export function normalizeOdaCsvRow(row: Record<string, string>): NormalizedOdaRow | null {
  const lat = parseFloat(row.Latitude || row.latitude || '');
  const lon = parseFloat(row.Longitude || row.longitude || '');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const provinceRaw = row['Province or Territory Unique Identifier'] || row.Province || '';
  const province = normalizeProvince(provinceRaw) || provinceRaw;
  const city = row['Processed City'] || row.City || '';
  const civicNumber = (row['Civic Number'] || '').trim();
  const streetName = row['Standardized Street Name'] || row['Street Name'] || '';
  const streetType = row['Standardized Street Type'] || row['Street Type'] || '';
  const streetDirection = row['Standardized Street Direction'] || row['Street Direction'] || '';
  const unit = (row.Unit || '').trim();
  const postalCode = normalizePostalCode(row['Postal Code'] || row.postal_code || '') || '';
  const fullAddress = row['Full Address'] || '';

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
