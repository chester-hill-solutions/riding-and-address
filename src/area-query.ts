/**
 * Area queries — the W7 contract (`docs/plans/area-query-contract.md`), implemented here for W8.
 *
 * A riding-bounded query is a bounding-box prefilter in SQL followed by an **exact point-in-polygon
 * test on the address point**. The box is only a prefilter: it returns candidates, and the polygon
 * decides. Containment uses the same `isPointInPolygon` the point lookup uses, so an area result and
 * a point lookup cannot disagree about which riding an address is in.
 *
 * Paging is a keyset over `id`, and the cursor carries the dataset vintage, so a cursor from another
 * vintage is rejected rather than silently resumed against different data.
 *
 * Known cost: a province's rows are contiguous in `id` space (imports are province-scoped), so
 * filling a page can scan many rows before enough fall inside a concave polygon. `scanBudget` bounds
 * that per request; if it is hit the page is short and `budgetExhausted` is true, so the caller pages
 * on rather than the request running unbounded. Benchmarking may justify a composite index — see the
 * contract §6.
 */

import { calculateBoundingBox } from './spatial';
import { isPointInPolygon } from './utils';
import type { AddressRecord, AddressStore } from './address-store';
import type { GeoJSONGeometry } from './types';

/** Candidate rows one request may scan before it returns a short page. */
export const AREA_SCAN_BUDGET = 10_000;

/** Records per page by default, and the hard maximum — one area unit. */
export const AREA_PAGE_DEFAULT = 100;
export const AREA_PAGE_MAX = 250;

/** Largest batch fetched from the store in one loop iteration. */
const AREA_BATCH_MAX = 250;

export interface AreaCursor {
  /** The last row *scanned*, not the last matched, so no row is skipped between pages. */
  id: number;
  datasetId: string;
  datasetYear: number;
}

export function encodeAreaCursor(cursor: AreaCursor): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode a cursor, or null when it is malformed. */
export function decodeAreaCursor(value: string): AreaCursor | null {
  try {
    const parsed = JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/'))) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const cursor = parsed as Record<string, unknown>;
    if (
      typeof cursor.id !== 'number' ||
      !Number.isSafeInteger(cursor.id) ||
      cursor.id < 0 ||
      typeof cursor.datasetId !== 'string' ||
      typeof cursor.datasetYear !== 'number'
    ) {
      return null;
    }
    return { id: cursor.id, datasetId: cursor.datasetId, datasetYear: cursor.datasetYear };
  } catch {
    return null;
  }
}

function clampPageSize(pageSize: number | undefined): number {
  if (pageSize === undefined || !Number.isFinite(pageSize)) return AREA_PAGE_DEFAULT;
  return Math.min(Math.max(Math.trunc(pageSize), 1), AREA_PAGE_MAX);
}

export interface AreaPageInput {
  store: AddressStore;
  /** The address-data province code the rows are stored under (e.g. `ON`). */
  province: string;
  datasetId: string;
  datasetYear: number;
  /** The riding's boundary geometry, in WGS84. */
  boundary: GeoJSONGeometry;
  pageSize?: number;
  cursor?: string;
  scanBudget?: number;
}

export type AreaPageResult =
  | {
      ok: true;
      records: AddressRecord[];
      nextCursor: string | null;
      hasMore: boolean;
      /** Candidates examined, for metrics and limit enforcement. */
      scanned: number;
      /** True when the scan budget stopped the page early; page on to continue. */
      budgetExhausted: boolean;
    }
  | { ok: false; code: 'CURSOR_INVALID' };

export async function readAreaPage(input: AreaPageInput): Promise<AreaPageResult> {
  const pageSize = clampPageSize(input.pageSize);
  const scanBudget = input.scanBudget ?? AREA_SCAN_BUDGET;
  const bounds = calculateBoundingBox(input.boundary);

  let afterId: number | undefined;
  if (input.cursor !== undefined) {
    const decoded = decodeAreaCursor(input.cursor);
    if (!decoded) return { ok: false, code: 'CURSOR_INVALID' };
    // A cursor from another vintage describes a different result set; refuse rather than resume.
    if (decoded.datasetId !== input.datasetId || decoded.datasetYear !== input.datasetYear) {
      return { ok: false, code: 'CURSOR_INVALID' };
    }
    afterId = decoded.id;
  }

  const records: AddressRecord[] = [];
  let scanned = 0;
  let lastScannedId = afterId;
  let exhausted = false;

  while (records.length < pageSize && scanned < scanBudget && !exhausted) {
    const want = Math.min(pageSize - records.length, AREA_BATCH_MAX);
    const batch = await input.store.listAddressesInRiding({
      province: input.province,
      bounds: {
        minLat: bounds.minY,
        maxLat: bounds.maxY,
        minLon: bounds.minX,
        maxLon: bounds.maxX,
      },
      afterId: lastScannedId,
      limit: want,
    });

    if (batch.length === 0) {
      exhausted = true;
      break;
    }

    let consumedWholeBatch = true;
    for (const row of batch) {
      // Bound the work per request: the budget applies inside a batch too, not only between them.
      if (scanned >= scanBudget) {
        consumedWholeBatch = false;
        break;
      }
      scanned += 1;
      lastScannedId = row.id;
      if (isPointInPolygon(row.lon, row.lat, input.boundary)) records.push(row);
      if (records.length >= pageSize) {
        consumedWholeBatch = false;
        break;
      }
    }

    // The adapter fetches `limit + 1` to signal a next page. A short batch means the box is done —
    // but only if we actually consumed it; stopping early on the budget or the page size leaves
    // rows behind, and those must be reachable from the next cursor.
    if (consumedWholeBatch && batch.length < want + 1) exhausted = true;
  }

  const hasMore = !exhausted;
  return {
    ok: true,
    records: records.slice(0, pageSize),
    nextCursor:
      hasMore && lastScannedId !== undefined
        ? encodeAreaCursor({
            id: lastScannedId,
            datasetId: input.datasetId,
            datasetYear: input.datasetYear,
          })
        : null,
    hasMore,
    scanned,
    budgetExhausted: !exhausted && scanned >= scanBudget,
  };
}
