import { describe, it, expect } from 'vitest';
import { signAreaPageCursor, type AreaPageCursor } from '../src/offers';
import { createD1Shim, createOdaSqlite, seedOdaRows } from './helpers/oda-sqlite';
import { createLookupTestEnv, fetchLookup, TORONTO_LAT, TORONTO_LON } from './helpers/lookup-test-env';
import type { OdaMemoryAddressRow } from './helpers/oda-memory-db';
import type { Env } from '../src/types';

/**
 * `/api/area` is offer-only: the signed cursor minted by the accept path is the whole authorization.
 * These assert the refusal paths, which is what keeps that claim true — an unsigned or foreign
 * cursor must not read a single row.
 */

const SECRET = 'test-offer-secret';

/** The federal fixture's polygon is roughly lon [-79.5,-79.2], lat [43.5,43.8]. */
function row(id: number, lon: number, lat: number): OdaMemoryAddressRow {
  return {
    id,
    province: 'ON',
    civic_number: String(id),
    street_name: `STREET${id}`,
    street_type: 'ST',
    street_direction: '',
    unit: '',
    postal_code: 'M5V 2T6',
    city: 'Toronto',
    city_key: 'TORONTO|ON',
    lat,
    lon,
    full_address: `${id} Street${id}`,
    search_key: `${id}|STREET${id}|ST||TORONTO|ON`,
    street_key: `STREET${id}|ST||TORONTO|ON`,
  };
}

function envWithAddresses(rows: OdaMemoryAddressRow[], overrides: Partial<Env> = {}): Env {
  const { sqlite } = createOdaSqlite();
  seedOdaRows(sqlite, { addresses: rows });
  return {
    ...createLookupTestEnv(),
    PUBLIC_API_HOSTS: 'lookup.test',
    OFFER_SIGNING_SECRET: SECRET,
    ODA_DB: createD1Shim(sqlite),
    ...overrides,
  } as unknown as Env;
}

const CURSOR: AreaPageCursor = {
  id: 0,
  // The allowance travels in the cursor: it is what bounds a continuation read (#142).
  remaining: 250,
  scope: { riding: 'Spadina—Harbourfront', datasetId: 'federalridings-2024.geojson', datasetYear: 2024 },
  offerId: 'offer-1',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe('GET /api/area', () => {
  it('refuses a request with no cursor', async () => {
    const response = await fetchLookup(envWithAddresses([row(1, TORONTO_LON, TORONTO_LAT)]), '/api/area');
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code?: string }).code).toBe('INVALID_QUERY');
  });

  it('refuses an unsigned cursor, so an unpaid caller reads nothing', async () => {
    // ASCII-only payload: btoa cannot encode the em-dash in the real riding name.
    const unsigned = btoa(
      JSON.stringify({
        id: 0,
        scope: { riding: 'Spadina-Harbourfront', datasetId: 'federalridings-2024.geojson', datasetYear: 2024 },
        offerId: 'offer-1',
        expiresAt: CURSOR.expiresAt,
      })
    );
    const response = await fetchLookup(
      envWithAddresses([row(1, TORONTO_LON, TORONTO_LAT)]),
      `/api/area?cursor=${encodeURIComponent(unsigned)}`
    );
    expect(response.status).toBe(410);
    expect(((await response.json()) as { code?: string }).code).toBe('CURSOR_INVALID');
  });

  it('refuses a cursor signed with another secret', async () => {
    const foreign = await signAreaPageCursor('someone-elses-secret', CURSOR);
    const response = await fetchLookup(
      envWithAddresses([row(1, TORONTO_LON, TORONTO_LAT)]),
      `/api/area?cursor=${encodeURIComponent(foreign)}`
    );
    expect(response.status).toBe(410);
  });

  it('serves a page for a cursor the accept path minted', async () => {
    const env = envWithAddresses([row(1, TORONTO_LON, TORONTO_LAT)]);
    const cursor = await signAreaPageCursor(SECRET, CURSOR);
    const response = await fetchLookup(env, `/api/area?cursor=${encodeURIComponent(cursor)}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      records: Array<{ id: number; riding: { name: string } }>;
      page: { cursor: string | null; hasMore: boolean };
      riding: { datasetYear: number };
    };
    expect(body.records.map((r) => r.id)).toEqual([1]);
    expect(body.riding.datasetYear).toBe(2024);
    expect(body.page.hasMore).toBe(false);
    expect(body.page.cursor).toBeNull();
  });

  it('reports NO_ADDRESS_COVERAGE instead of an empty page', async () => {
    // The riding resolves in the federal dataset, but the province has no imported addresses.
    const env = envWithAddresses([row(1, TORONTO_LON, TORONTO_LAT)], { ODA_PROVINCES: 'QC' });
    const cursor = await signAreaPageCursor(SECRET, CURSOR);
    const response = await fetchLookup(env, `/api/area?cursor=${encodeURIComponent(cursor)}`);

    expect(response.status).toBe(404);
    expect(((await response.json()) as { code?: string }).code).toBe('NO_ADDRESS_COVERAGE');
  });
});
