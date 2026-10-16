/**
 * Area queries — the W7 contract (`docs/plans/area-query-contract.md`), implemented for W8.
 *
 * A riding-bounded query is a bounding-box prefilter in SQL followed by an **exact point-in-polygon
 * test on the address point**. The box is only a prefilter: it returns candidates, and the polygon
 * decides. Containment uses the same `isPointInPolygon` the point lookup uses, so an area result and
 * a point lookup cannot disagree about which riding an address is in.
 *
 * This module pages by **raw id**, not by an opaque token. The token format belongs to whoever
 * authorizes the read: retrieval is offer-only, so the page cursor is a signed token minted by the
 * payment path and verified by the route (`src/offers.ts`). Keeping the id here means this module
 * has no opinion about authorization, and the cursor cannot be minted by anyone who has not paid.
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

function clampPageSize(pageSize: number | undefined): number {
  if (pageSize === undefined || !Number.isFinite(pageSize)) return AREA_PAGE_DEFAULT;
  return Math.min(Math.max(Math.trunc(pageSize), 1), AREA_PAGE_MAX);
}

export interface AreaPageInput {
  store: AddressStore;
  /** The address-data province code the rows are stored under (e.g. `ON`). */
  province: string;
  /** The riding's boundary geometry, in WGS84. */
  boundary: GeoJSONGeometry;
  /** Resume after this row id — the last row *scanned* by the previous page. */
  afterId?: number;
  pageSize?: number;
  scanBudget?: number;
}

export interface AreaPage {
  records: AddressRecord[];
  /** The last row scanned, or null when the box is exhausted. Feeds the caller's next cursor. */
  nextId: number | null;
  hasMore: boolean;
  /** Candidates examined, for metrics and limit enforcement. */
  scanned: number;
  /** True when the scan budget stopped the page early; page on to continue. */
  budgetExhausted: boolean;
}

export async function readAreaPage(input: AreaPageInput): Promise<AreaPage> {
  const pageSize = clampPageSize(input.pageSize);
  const scanBudget = input.scanBudget ?? AREA_SCAN_BUDGET;
  const bounds = calculateBoundingBox(input.boundary);

  const records: AddressRecord[] = [];
  let scanned = 0;
  let lastScannedId = input.afterId;
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
    records: records.slice(0, pageSize),
    nextId: hasMore ? lastScannedId ?? null : null,
    hasMore,
    scanned,
    budgetExhausted: !exhausted && scanned >= scanBudget,
  };
}
