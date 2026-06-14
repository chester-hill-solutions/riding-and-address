import { QueryParams, GoogleAddressComponents } from './types';
import { normalizeProvince, normalizeSearchToken } from './oda-normalize';

const PROVINCE_CODE_TO_NAME: Record<string, string> = {
  NL: 'Newfoundland',
  PE: 'Prince Edward Island',
  NS: 'Nova Scotia',
  NB: 'New Brunswick',
  QC: 'Quebec',
  ON: 'Ontario',
  MB: 'Manitoba',
  SK: 'Saskatchewan',
  AB: 'Alberta',
  BC: 'British Columbia',
  YT: 'Yukon',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
};

const STREET_TYPE_SUFFIX =
  /\b(ST|STREET|AVE|AV|AVENUE|RD|ROAD|BLVD|BOULEVARD|DR|DRIVE|CRES|CRESCENT|CRT|COURT|PL|PLACE|PKY|PARKWAY|HWY|HIGHWAY|RUE|CH|CHEMIN|WAY|LANE|LN|TRAIL|TL|CIR|CIRCLE)\b\.?$/i;

/** Tokens used to match geocoder results against requested province/city. */
export function regionHintTokens(qp: QueryParams): string[] {
  const tokens = new Set<string>();

  if (qp.state) {
    const code = normalizeProvince(qp.state) || qp.state.trim().toUpperCase();
    tokens.add(code);
    const name = PROVINCE_CODE_TO_NAME[code];
    if (name) {
      tokens.add(name.toUpperCase());
      tokens.add(normalizeSearchToken(name));
    }
    tokens.add(normalizeSearchToken(qp.state));
  }

  if (qp.city) {
    tokens.add(normalizeSearchToken(qp.city));
  }

  return [...tokens].filter(Boolean);
}

function haystackIncludesToken(haystack: string, token: string): boolean {
  if (!token) return false;
  return haystack.includes(token);
}

/** Whether a free-text geocoder label matches requested province/city hints. */
export function geocodeLabelMatchesRegion(qp: QueryParams, label: string | undefined): boolean {
  if (!label) return false;
  const hints = regionHintTokens(qp);
  if (hints.length === 0) return true;

  const haystack = label.toUpperCase();
  const provinceHints = qp.state
    ? hints.filter((t) => t.length > 2 || /^[A-Z]{2}$/.test(t))
    : hints;

  if (qp.state && provinceHints.length > 0) {
    const provinceMatch = provinceHints.some((token) => haystackIncludesToken(haystack, token));
    if (!provinceMatch) return false;
  }

  if (qp.city) {
    const cityToken = normalizeSearchToken(qp.city);
    if (!haystackIncludesToken(haystack, cityToken)) return false;
  }

  return true;
}

export function googleResultMatchesRegion(
  qp: QueryParams,
  components?: GoogleAddressComponents,
  formattedAddress?: string
): boolean {
  const label = [formattedAddress, components?.administrative_area_level_1, components?.locality]
    .filter(Boolean)
    .join(', ');
  return geocodeLabelMatchesRegion(qp, label);
}

/** Append a street type when users omit one (e.g. "757 Victoria Park"). */
export function expandStreetAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed || STREET_TYPE_SUFFIX.test(trimmed)) return trimmed;
  if (!/^\d+\s+\S/.test(trimmed)) return trimmed;
  return `${trimmed} Ave`;
}

/** Build a comma-separated geocode query with province names expanded. */
export function buildGeocodeQueryString(qp: QueryParams): string {
  const parts: string[] = [];
  if (qp.address) parts.push(expandStreetAddress(qp.address));
  if (qp.postal) parts.push(qp.postal);
  if (qp.city) parts.push(qp.city);
  if (qp.state) {
    const code = normalizeProvince(qp.state);
    parts.push(code ? PROVINCE_CODE_TO_NAME[code] || qp.state : qp.state);
  }
  parts.push(qp.country || 'Canada');
  return parts.filter(Boolean).join(', ');
}

export function provinceNameForGoogleComponent(state: string | undefined): string | undefined {
  if (!state) return undefined;
  const code = normalizeProvince(state);
  if (code && PROVINCE_CODE_TO_NAME[code]) return PROVINCE_CODE_TO_NAME[code];
  return state;
}

export type GeoGratisCandidate = {
  title?: string;
  qualifier?: string;
  score?: number;
  geometry?: { coordinates?: number[] };
};

function geogratisResultScore(qp: QueryParams, result: GeoGratisCandidate): number {
  let score = 0;
  const title = (result.title || '').toUpperCase();

  if (qp.address) {
    const civic = qp.address.trim().match(/^(\d+)/)?.[1];
    if (civic && title.includes(civic)) score += 20;

    const streetPart = expandStreetAddress(qp.address).replace(/^\d+\s*/, '');
    for (const token of streetPart.split(/\s+/)) {
      const normalized = normalizeSearchToken(token);
      if (normalized.length > 2 && title.includes(normalized)) {
        score += 5;
      }
    }
  }

  if (result.qualifier === 'INTERPOLATED_POSITION') score += 2;
  if (title.includes('HIGHWAY') || title.includes('ROUTE')) score -= 10;

  return score;
}

/** Prefer results in the requested province/city; fall back to the first hit. */
export function selectGeoGratisResult(
  qp: QueryParams,
  results: GeoGratisCandidate[]
): GeoGratisCandidate | null {
  if (results.length === 0) return null;

  const hasRegionHints = !!(qp.state || qp.city);
  if (hasRegionHints) {
    const regional = results.filter((r) => geocodeLabelMatchesRegion(qp, r.title));
    if (regional.length > 0) {
      return [...regional].sort(
        (a, b) => geogratisResultScore(qp, b) - geogratisResultScore(qp, a)
      )[0];
    }
  }

  return results[0];
}
