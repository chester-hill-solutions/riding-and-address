import { CanadaPostStyleAddress } from './types';
import { foldAccents, normalizePostalCode, normalizeProvince, normalizeStreetDirection } from './oda-normalize';

/** Mailing display: abbreviate street types for Canada Post-style output */
const STREET_TYPE_MAILING: Record<string, string> = {
  ST: 'ST',
  STREET: 'ST',
  AVE: 'AVE',
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

export interface AddressParts {
  civicNumber?: string;
  streetName?: string;
  streetType?: string;
  streetDirection?: string;
  unit?: string;
  city?: string;
  province?: string;
  postalCode?: string;
}

function mailingStreetType(type: string | undefined): string {
  if (!type) return '';
  const key = foldAccents(type).replace(/[^A-Z]/g, '');
  return STREET_TYPE_MAILING[key] || key;
}

function buildCivicStreetLine(parts: AddressParts): string {
  const civic = parts.civicNumber ? foldAccents(parts.civicNumber) : '';
  const name = parts.streetName ? foldAccents(parts.streetName) : '';
  const type = mailingStreetType(parts.streetType);
  const dir = parts.streetDirection ? normalizeStreetDirection(parts.streetDirection) : '';
  return [civic, name, type, dir].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function formatUnitLine(unit: string | undefined): string | undefined {
  if (!unit) return undefined;
  const cleaned = foldAccents(unit).trim();
  if (/^(UNIT|APT|SUITE|#)/.test(cleaned)) {
    return cleaned;
  }
  return `UNIT ${cleaned}`;
}

export function formatCanadaPostAddress(parts: AddressParts): CanadaPostStyleAddress {
  const province = normalizeProvince(parts.province || '') || (parts.province ? foldAccents(parts.province) : '');
  const municipality = parts.city ? foldAccents(parts.city) : '';
  const postalCode = normalizePostalCode(parts.postalCode || '');
  const civicStreet = buildCivicStreetLine(parts);
  const unitLine = formatUnitLine(parts.unit);

  let line1: string;
  let line2: string | undefined;
  if (unitLine) {
    line1 = unitLine;
    line2 = civicStreet || undefined;
  } else {
    line1 = civicStreet;
  }

  const cityProvincePostal = [municipality, province, postalCode].filter(Boolean).join('  ');
  const formattedMultiline = [line1, line2, cityProvincePostal, 'CANADA'].filter(Boolean).join('\n');
  const formattedSingleLine = [line1, line2, `${municipality} ${province}`.trim(), postalCode, 'CANADA']
    .filter(Boolean)
    .join(', ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    line1,
    line2,
    municipality,
    province,
    postalCode,
    country: 'CANADA',
    formattedSingleLine,
    formattedMultiline,
    canadaPostCertified: false,
  };
}

export function formatFromOdaRow(row: {
  civic_number?: string;
  street_name?: string;
  street_type?: string;
  street_direction?: string;
  unit?: string;
  city?: string;
  province?: string;
  postal_code?: string;
}): CanadaPostStyleAddress {
  return formatCanadaPostAddress({
    civicNumber: row.civic_number,
    streetName: row.street_name,
    streetType: row.street_type,
    streetDirection: row.street_direction,
    unit: row.unit,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
  });
}
