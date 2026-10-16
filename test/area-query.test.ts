import { describe, it, expect } from 'vitest';
import { createD1AddressStore } from '../src/address-store';
import { createD1Shim, createOdaSqlite, seedOdaRows } from './helpers/oda-sqlite';
import type { OdaMemoryAddressRow } from './helpers/oda-memory-db';
import {
  AREA_PAGE_MAX,
  decodeAreaCursor,
  encodeAreaCursor,
  readAreaPage,
} from '../src/area-query';
import type { GeoJSONGeometry } from '../src/types';

/**
 * W8: the real SQL runs against in-memory SQLite, so the bounding-box prefilter and the keyset are
 * exercised for real, not mocked. The polygon below is a "U" — its bounding box contains points the
 * polygon does not, which is the whole reason the box is only a prefilter.
 */

// lon = x, lat = y. A U: the notch is x in [4,6], y in [4,10].
const U_SHAPE: GeoJSONGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [6, 10],
      [6, 4],
      [4, 4],
      [4, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};

function address(id: number, lon: number, lat: number, province = 'ON'): OdaMemoryAddressRow {
  return {
    id,
    province,
    civic_number: String(id),
    street_name: `STREET${id}`,
    street_type: 'ST',
    street_direction: '',
    unit: '',
    postal_code: 'K1A 0A6',
    city: 'Ottawa',
    city_key: 'OTTAWA|ON',
    lat,
    lon,
    full_address: `${id} Street${id}`,
    search_key: `${id}|STREET${id}|ST||OTTAWA|ON`,
    street_key: `STREET${id}|ST||OTTAWA|ON`,
  };
}

/** ids 1, 3, 4 are inside the U; id 2 sits in the notch; id 5 is another province. */
const ROWS = [
  address(1, 2, 2),
  address(2, 5, 8),
  address(3, 8, 8),
  address(4, 5, 2),
  address(5, 2, 2, 'QC'),
];

function store() {
  const { sqlite, close } = createOdaSqlite();
  seedOdaRows(sqlite, { addresses: ROWS });
  return { store: createD1AddressStore(createD1Shim(sqlite)), close };
}

describe('readAreaPage', () => {
  it('returns only records whose address point is inside the polygon', async () => {
    const { store: s, close } = store();
    try {
      const page = await readAreaPage({
        store: s,
        province: 'ON',
        datasetId: 'ontarioridings-2022.geojson',
        datasetYear: 2022,
        boundary: U_SHAPE,
        pageSize: 10,
      });
      expect(page.ok).toBe(true);
      if (!page.ok) return;
      // id 2 is inside the bounding box but in the notch, so the polygon excludes it; id 5 is QC.
      expect(page.records.map((r) => r.id)).toEqual([1, 3, 4]);
      expect(page.hasMore).toBe(false);
      expect(page.nextCursor).toBeNull();
    } finally {
      close();
    }
  });

  it('pages without skipping or repeating, and agrees with a full read', async () => {
    const { store: s, close } = store();
    try {
      const seen: number[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 10; guard += 1) {
        const page = await readAreaPage({
          store: s,
          province: 'ON',
          datasetId: 'd',
          datasetYear: 2022,
          boundary: U_SHAPE,
          pageSize: 2,
          cursor,
        });
        expect(page.ok).toBe(true);
        if (!page.ok) return;
        seen.push(...page.records.map((r) => r.id));
        if (!page.hasMore) break;
        cursor = page.nextCursor ?? undefined;
      }
      // The same three records, in id order, with the excluded ones absent.
      expect(seen).toEqual([1, 3, 4]);
    } finally {
      close();
    }
  });

  it('rejects a cursor from another dataset vintage', async () => {
    const { store: s, close } = store();
    try {
      const cursor = encodeAreaCursor({ id: 1, datasetId: 'd', datasetYear: 2021 });
      const page = await readAreaPage({
        store: s,
        province: 'ON',
        datasetId: 'd',
        datasetYear: 2022,
        boundary: U_SHAPE,
        cursor,
      });
      expect(page).toEqual({ ok: false, code: 'CURSOR_INVALID' });
    } finally {
      close();
    }
  });

  it('rejects a malformed cursor', async () => {
    const { store: s, close } = store();
    try {
      const page = await readAreaPage({
        store: s,
        province: 'ON',
        datasetId: 'd',
        datasetYear: 2022,
        boundary: U_SHAPE,
        cursor: 'not-a-cursor',
      });
      expect(page).toEqual({ ok: false, code: 'CURSOR_INVALID' });
    } finally {
      close();
    }
  });

  it('stops at the scan budget rather than scanning without bound', async () => {
    const { store: s, close } = store();
    try {
      const page = await readAreaPage({
        store: s,
        province: 'ON',
        datasetId: 'd',
        datasetYear: 2022,
        boundary: U_SHAPE,
        pageSize: 10,
        scanBudget: 2,
      });
      expect(page.ok).toBe(true);
      if (!page.ok) return;
      expect(page.scanned).toBe(2);
      expect(page.budgetExhausted).toBe(true);
      expect(page.hasMore).toBe(true);
    } finally {
      close();
    }
  });
});

describe('area cursors', () => {
  it('round-trip', () => {
    const cursor = { id: 42, datasetId: 'ontarioridings-2022.geojson', datasetYear: 2022 };
    expect(decodeAreaCursor(encodeAreaCursor(cursor))).toEqual(cursor);
  });

  it('reject anything that is not a cursor', () => {
    expect(decodeAreaCursor('')).toBeNull();
    expect(decodeAreaCursor(btoa('{}'))).toBeNull();
    expect(decodeAreaCursor(btoa('{"id":-1,"datasetId":"d","datasetYear":2022}'))).toBeNull();
    expect(decodeAreaCursor(btoa('{"id":1.5,"datasetId":"d","datasetYear":2022}'))).toBeNull();
    expect(decodeAreaCursor(btoa('{"id":1,"datasetId":"d"}'))).toBeNull();
  });

  it('clamps page size to one area unit', async () => {
    const { store: s, close } = store();
    try {
      const page = await readAreaPage({
        store: s,
        province: 'ON',
        datasetId: 'd',
        datasetYear: 2022,
        boundary: U_SHAPE,
        pageSize: 10_000,
      });
      expect(page.ok).toBe(true);
      if (!page.ok) return;
      expect(page.records.length).toBeLessThanOrEqual(AREA_PAGE_MAX);
    } finally {
      close();
    }
  });
});
