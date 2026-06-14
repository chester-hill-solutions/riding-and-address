import { formatCanadaPostAddress } from './canada-post-format';
import { NormalizedOdaRow, buildCityKey } from './oda-normalize';
import { ODA_DEFAULTS } from './oda-config';

export interface OdaInsertRow extends NormalizedOdaRow {
  mailingLine1: string;
  mailingLine2?: string;
  municipality: string;
  provinceCode: string;
  mailingPostalCode: string;
}

export function prepareOdaInsertRow(row: NormalizedOdaRow): OdaInsertRow {
  const mailing = formatCanadaPostAddress({
    civicNumber: row.civicNumber,
    streetName: row.streetName,
    streetType: row.streetType,
    streetDirection: row.streetDirection,
    unit: row.unit,
    city: row.city,
    province: row.province,
    postalCode: row.postalCode,
  });

  return {
    ...row,
    mailingLine1: mailing.line1,
    mailingLine2: mailing.line2,
    municipality: mailing.municipality,
    provinceCode: mailing.province,
    mailingPostalCode: mailing.postalCode || '',
  };
}

export function escapeSql(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "''";
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function buildAddressInsertSql(row: OdaInsertRow, id: number): string {
  return `INSERT INTO oda_addresses (
    id, province, civic_number, street_name, street_type, street_direction, unit,
    postal_code, city, city_key, lat, lon, full_address,
    mailing_line1, mailing_line2, municipality, province_code, mailing_postal_code,
    search_key, street_key
  ) VALUES (
    ${id}, ${escapeSql(row.province)}, ${escapeSql(row.civicNumber)}, ${escapeSql(row.streetName)},
    ${escapeSql(row.streetType)}, ${escapeSql(row.streetDirection)}, ${escapeSql(row.unit)},
    ${escapeSql(row.postalCode)}, ${escapeSql(row.city)}, ${escapeSql(row.cityKey)},
    ${row.lat}, ${row.lon}, ${escapeSql(row.fullAddress)},
    ${escapeSql(row.mailingLine1)}, ${escapeSql(row.mailingLine2 ?? '')}, ${escapeSql(row.municipality)},
    ${escapeSql(row.provinceCode)}, ${escapeSql(row.mailingPostalCode)},
    ${escapeSql(row.searchKey)}, ${escapeSql(row.streetKey)}
  );`;
}

export interface CentroidAccumulator {
  latSum: number;
  lonSum: number;
  count: number;
  minCivic: number | null;
  maxCivic: number | null;
}

export function accumulateCentroid(
  acc: CentroidAccumulator,
  lat: number,
  lon: number,
  civicNumber?: string
): CentroidAccumulator {
  const civic = civicNumber ? parseInt(civicNumber.replace(/[^0-9].*$/, ''), 10) : NaN;
  return {
    latSum: acc.latSum + lat,
    lonSum: acc.lonSum + lon,
    count: acc.count + 1,
    minCivic: Number.isFinite(civic)
      ? acc.minCivic === null
        ? civic
        : Math.min(acc.minCivic, civic)
      : acc.minCivic,
    maxCivic: Number.isFinite(civic)
      ? acc.maxCivic === null
        ? civic
        : Math.max(acc.maxCivic, civic)
      : acc.maxCivic,
  };
}

export function buildCentroidSqlStatements(
  province: string,
  postalCentroids: Map<string, CentroidAccumulator>,
  cityCentroids: Map<string, CentroidAccumulator & { city: string }>,
  streetRanges: Map<string, CentroidAccumulator & { streetKey: string; cityKey: string }>
): string[] {
  const statements: string[] = [];

  for (const [postal, acc] of postalCentroids) {
    statements.push(
      `INSERT OR REPLACE INTO oda_postal_centroids (province, postal_code, lat, lon, address_count) VALUES (${escapeSql(province)}, ${escapeSql(postal)}, ${acc.latSum / acc.count}, ${acc.lonSum / acc.count}, ${acc.count});`
    );
  }

  for (const [cityKey, acc] of cityCentroids) {
    statements.push(
      `INSERT OR REPLACE INTO oda_city_centroids (province, city_key, city, lat, lon, address_count) VALUES (${escapeSql(province)}, ${escapeSql(cityKey)}, ${escapeSql(acc.city)}, ${acc.latSum / acc.count}, ${acc.lonSum / acc.count}, ${acc.count});`
    );
  }

  for (const [, acc] of streetRanges) {
    statements.push(
      `INSERT OR REPLACE INTO oda_street_ranges (province, city_key, street_key, min_civic, max_civic, lat, lon, address_count) VALUES (${escapeSql(province)}, ${escapeSql(acc.cityKey)}, ${escapeSql(acc.streetKey)}, ${acc.minCivic ?? 'NULL'}, ${acc.maxCivic ?? 'NULL'}, ${acc.latSum / acc.count}, ${acc.lonSum / acc.count}, ${acc.count});`
    );
  }

  return statements;
}

export function trackCentroidsFromRow(
  row: NormalizedOdaRow,
  postalCentroids: Map<string, CentroidAccumulator>,
  cityCentroids: Map<string, CentroidAccumulator & { city: string }>,
  streetRanges: Map<string, CentroidAccumulator & { streetKey: string; cityKey: string }>
): void {
  if (row.postalCode) {
    const key = row.postalCode;
    postalCentroids.set(key, accumulateCentroid(postalCentroids.get(key) || { latSum: 0, lonSum: 0, count: 0, minCivic: null, maxCivic: null }, row.lat, row.lon));
  }

  const cityKey = buildCityKey(row.city, row.province);
  const cityAcc = cityCentroids.get(cityKey) || { latSum: 0, lonSum: 0, count: 0, minCivic: null, maxCivic: null, city: row.city };
  cityCentroids.set(cityKey, { ...accumulateCentroid(cityAcc, row.lat, row.lon), city: row.city });

  const streetRangeKey = `${cityKey}|${row.streetKey}`;
  const streetAcc = streetRanges.get(streetRangeKey) || {
    latSum: 0,
    lonSum: 0,
    count: 0,
    minCivic: null,
    maxCivic: null,
    streetKey: row.streetKey,
    cityKey,
  };
  streetRanges.set(streetRangeKey, {
    ...accumulateCentroid(streetAcc, row.lat, row.lon, row.civicNumber),
    streetKey: row.streetKey,
    cityKey,
  });
}

export const PROVINCE_DOWNLOAD_URLS: Record<string, string> = {
  ON: 'https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001/ODA_ON_v1.zip',
  QC: 'https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001/ODA_QC_v1.zip',
  AB: 'https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001/ODA_AB_v1.zip',
  BC: 'https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001/ODA_BC_v1.zip',
  MB: 'https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001/ODA_MB_v1.zip',
  NB: 'https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001/ODA_NB_v1.zip',
  NT: 'https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001/ODA_NT_v1.zip',
  NS: 'https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001/ODA_NS_v1.zip',
  PE: 'https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001/ODA_PE_v1.zip',
  SK: 'https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001/ODA_SK_v1.zip',
};

export { ODA_DEFAULTS };
