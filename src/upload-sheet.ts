import { DEFAULT_FREE_MONTHLY_ALLOWANCE } from './customer';
import { parseCsv } from './csv';
import type { QueryParams } from './types';

export const UPLOAD_ROW_PRICE_USD = 0.005;
const ROW_PRICE_CENTS = UPLOAD_ROW_PRICE_USD * 100;

export const MAX_SHEET_BYTES = 1024 * 1024;
export const MAX_SHEET_ROWS = 10000;
export interface SheetRow { source: Record<string, string>; query: QueryParams; error?: string }
export interface Sheet { headers: string[]; rows: SheetRow[]; validRows: number; invalidRows: number }

/** CSV exported from a spreadsheet. Never evaluate cells or formulas. */
export function parseSheet(text: string): Sheet {
  if (new TextEncoder().encode(text).length > MAX_SHEET_BYTES) throw new Error('Use a CSV file smaller than 1 MiB.');
  const source = parseCsv(text);
  if (!source.length || source.length > MAX_SHEET_ROWS) throw new Error('Upload between 1 and 10,000 rows.');
  const headers = Object.keys(source[0]);
  if (headers.length > 50) throw new Error('Use at most 50 columns.');
  const columns = new Map(headers.map(h => [h.trim().toLowerCase().replace(/[ _-]/g, ''), h]));
  if (columns.size !== headers.length) throw new Error('Column names must be distinct after removing spaces.');
  const rows = source.map((record): SheetRow => {
    if (new TextEncoder().encode(JSON.stringify(record)).length > 4000) throw new Error('Each row must be smaller than 4,000 bytes.');
    const field = (...names: string[]) => names.map(name => record[columns.get(name) ?? '']?.trim()).find(Boolean) ?? '';
    const address = field('address', 'streetaddress', 'fulladdress');
    const postal = field('postal', 'postalcode', 'postcode');
    const city = field('city', 'municipality');
    const state = field('province', 'state');
    const latText = field('lat', 'latitude'), lonText = field('lon', 'lng', 'longitude');
    const lat = latText ? Number(latText) : undefined, lon = lonText ? Number(lonText) : undefined;
    const badCoordinates = Boolean(latText || lonText) &&
      (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180);
    const error = badCoordinates ? 'Invalid latitude/longitude pair' :
      !address && !postal && lat === undefined ? 'Add an address, postal code or coordinates' : undefined;
    return { source: record, query: { address: address || undefined, postal: postal || undefined,
      city: city || undefined, state: state || undefined, lat, lon }, error };
  });
  const validRows = rows.filter(row => !row.error).length;
  if (!validRows) throw new Error('No usable rows. Include address, postal_code or latitude and longitude columns.');
  return { headers, rows, validRows, invalidRows: rows.length - validRows };
}

/** Half-cent row credits keep fractional-cent prices exact; Stripe amounts are whole cents. */
export function quoteUpload(rows: number, usedThisMonth: number, creditRows: number, allowance = DEFAULT_FREE_MONTHLY_ALLOWANCE) {
  for (const n of [rows, usedThisMonth, creditRows]) if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid upload balance');
  const freeRows = Math.min(rows, Math.max(0, allowance - usedThisMonth));
  const paidRows = rows - freeRows;
  const creditsUsed = Math.min(creditRows, paidRows);
  const uncoveredRows = paidRows - creditsUsed;
  const chargeCents = uncoveredRows ? Math.max(50, Math.ceil(uncoveredRows * ROW_PRICE_CENTS)) : 0;
  return { freeRows, paidRows, creditsUsed, chargeCents, extraCreditRows: chargeCents / ROW_PRICE_CENTS - uncoveredRows };
}
export type UploadQuote = ReturnType<typeof quoteUpload>;
export interface SheetResult { status: 'matched' | 'unresolved' | 'invalid'; riding?: string; lat?: number; lon?: number; error?: string; details?: unknown }
export interface UploadJob extends UploadQuote {
  id: string; name: string; month: string; createdAt: number; expiresAt: number;
  status: 'quoted' | 'checkout' | 'processing' | 'completed' | 'expired';
  totalRows: number; validRows: number; invalidRows: number; headers: string[];
  nextRow: number; successfulRows: number; creditedRows: number;
  stripeCustomerId?: string; checkoutSessionId?: string;
}

/** Neutralize spreadsheet formula injection in input and generated cells. */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
