import { CanadaPostStyleAddress } from './types';
import {
  foldAccents,
  normalizePostalCode,
  normalizeProvince,
  normalizeStreetDirection,
  normalizeStreetType,
} from './oda-normalize';

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

/** Join non-empty address lines into the canonical comma-separated query form. */
export function joinAddressLines(parts: ReadonlyArray<string | undefined | null>): string {
  return parts.filter(Boolean).join(', ');
}

function buildCivicStreetLine(parts: AddressParts): string {
  const civic = parts.civicNumber ? foldAccents(parts.civicNumber) : '';
  const name = parts.streetName ? foldAccents(parts.streetName) : '';
  // Mailing abbreviations derive from the same canonical map the import and search paths use.
  const type = normalizeStreetType(parts.streetType);
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
  const formattedSingleLine = joinAddressLines([
    line1,
    line2,
    `${municipality} ${province}`.trim(),
    postalCode,
    'CANADA',
  ])
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
