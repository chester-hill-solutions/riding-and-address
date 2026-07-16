import { describe, it, expect, beforeEach } from 'vitest';
import { createLookupTestEnv, fetchLookup, TORONTO_LAT, TORONTO_LON } from './helpers/lookup-test-env';
import { Env, Suggestion } from '../src/types';
import { clearApiKeyCache } from '../src/api-keys';
import { clearCustomerCache } from '../src/customer';

interface SearchBody {
  suggestions?: Suggestion[];
  provinces?: string[];
  dataSource?: { provider: string; version: string };
  correlationId?: string;
  code?: string;
  // Present only if the catch-all wrongly served a federal lookup.
  properties?: Record<string, unknown>;
  province_data?: unknown;
  point?: { lat: number; lon: number };
}

async function readJson(response: Response): Promise<SearchBody> {
  return (await response.json()) as SearchBody;
}

/**
 * Route-level behaviour of GET /api/search, and the regressions that matter:
 *
 *  - /api/search is NOT an unused path today. The catch-all is `pathname.startsWith('/api')` and
 *    pickDataset falls back to federal, so it currently serves a federal riding lookup. With the
 *    flag off, that must keep happening exactly as before.
 *  - With the flag on, the route must sit above the catch-all, or it gets silently served as a
 *    federal lookup: a wrong-but-200 response, the worst failure mode.
 */

function createSuggestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    province: 'ON',
    city: 'Toronto',
    city_key: 'TORONTO|ON',
    street_key: 'MAIN|ST',
    min_civic: 1,
    max_civic: 499,
    lat: 43.6891,
    lon: -79.2989,
    address_count: 250,
    rank: -5,
    ...overrides,
  };
}

function withSuggestDb(env: Env, rows: Record<string, unknown>[] = [createSuggestRow()]): Env {
  return {
    ...env,
    ODA_DB: {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: rows }),
          first: async () => null,
        }),
      }),
      batch: async () => [],
    } as unknown as D1Database,
  };
}

function enabled(env: Env): Env {
  return { ...env, ODA_SUGGEST_ENABLED: 'true', ODA_PROVINCES: 'ON' };
}

describe('GET /api/search — flag off', () => {
  it('behaves exactly as it did before the route existed (federal lookup via the catch-all)', async () => {
    const env = withSuggestDb(createLookupTestEnv());

    const off = await fetchLookup(env, `/api/search?lat=${TORONTO_LAT}&lon=${TORONTO_LON}`);
    const control = await fetchLookup(env, `/api/federal?lat=${TORONTO_LAT}&lon=${TORONTO_LON}`);

    expect(off.status).toBe(control.status);

    const offBody = await readJson(off);
    const controlBody = await readJson(control);

    // Same shape, same dataset: a federal lookup, not suggestions.
    expect(offBody).toHaveProperty('properties');
    expect(offBody).not.toHaveProperty('suggestions');
    expect(offBody.properties).toEqual(controlBody.properties);
    expect(offBody.point).toEqual(controlBody.point);
  });

  it('is also off when the flag is absent entirely', async () => {
    const env = withSuggestDb(createLookupTestEnv());
    const response = await fetchLookup(env, `/api/search?lat=${TORONTO_LAT}&lon=${TORONTO_LON}`);
    expect(await readJson(response)).not.toHaveProperty('suggestions');
  });

  it('stays off when the flag is on but ODA_DB is unbound', async () => {
    const env = { ...createLookupTestEnv(), ODA_SUGGEST_ENABLED: 'true' } as Env;
    const response = await fetchLookup(env, `/api/search?lat=${TORONTO_LAT}&lon=${TORONTO_LON}`);
    expect(await readJson(response)).not.toHaveProperty('suggestions');
  });
});

describe('GET /api/search — flag on', () => {
  it('is not swallowed by the /api catch-all', async () => {
    const env = enabled(withSuggestDb(createLookupTestEnv()));
    const response = await fetchLookup(env, '/api/search?q=main st tor');

    expect(response.status).toBe(200);
    const body = await readJson(response);

    expect(body).toHaveProperty('suggestions');
    // The failure mode this guards: a federal lookup response, which carries these instead.
    expect(body).not.toHaveProperty('properties');
    expect(body).not.toHaveProperty('province_data');
  });

  it('returns container suggestions carrying a point but no riding', async () => {
    const env = enabled(withSuggestDb(createLookupTestEnv()));
    const response = await fetchLookup(env, '/api/search?q=main st tor');
    const body = await readJson(response);

    expect(body.suggestions).toHaveLength(1);
    const [suggestion] = body.suggestions!;
    expect(suggestion.next).toBe('search');
    expect(suggestion.dataLevel).toBe('Street');
    expect(suggestion.location).toEqual({ lat: 43.6891, lon: -79.2989 });
    expect(suggestion).not.toHaveProperty('riding');
  });

  it('echoes provinces and the ODA data source', async () => {
    const env = enabled(withSuggestDb(createLookupTestEnv()));
    const body = await readJson(await fetchLookup(env, '/api/search?q=main st tor'));

    expect(body.provinces).toEqual(['ON']);
    expect(body.dataSource?.provider).toBe('statcan-oda');
    expect(body.correlationId).toBeTruthy();
  });

  it('requires q', async () => {
    const env = enabled(withSuggestDb(createLookupTestEnv()));
    const response = await fetchLookup(env, '/api/search');

    expect(response.status).toBe(400);
    expect((await readJson(response)).code).toBe('INVALID_QUERY');
  });

  it('rejects an unknown province', async () => {
    const env = enabled(withSuggestDb(createLookupTestEnv()));
    const response = await fetchLookup(env, '/api/search?q=main&province=ZZ');

    expect(response.status).toBe(400);
  });

  it('rejects locationBias and locationRestriction together', async () => {
    const env = enabled(withSuggestDb(createLookupTestEnv()));
    const response = await fetchLookup(
      env,
      '/api/search?q=main st&locationBias=43.6,-79.3&locationRestriction=43,-80,44,-79'
    );

    expect(response.status).toBe(400);
  });

  it('returns an empty, hard-cached 200 for a sub-3-char query rather than an error', async () => {
    const env = enabled(withSuggestDb(createLookupTestEnv()));
    const response = await fetchLookup(env, '/api/search?q=ma');

    expect(response.status).toBe(200);
    expect((await readJson(response)).suggestions).toEqual([]);
    expect(response.headers.get('Cache-Control')).toContain('max-age=86400');
  });

  it('serves MISS then HIT from the KV cache', async () => {
    const env = enabled(withSuggestDb(createLookupTestEnv()));

    const first = await fetchLookup(env, '/api/search?q=main st tor');
    expect(first.headers.get('X-Cache-Status')).toBe('MISS');

    const second = await fetchLookup(env, '/api/search?q=main st tor');
    expect(second.headers.get('X-Cache-Status')).toBe('HIT');
    expect((await readJson(second)).suggestions).toHaveLength(1);
  });

  describe('edge caching vs auth', () => {
    it('is publicly cacheable when no basic auth is configured', async () => {
      const env = enabled(withSuggestDb(createLookupTestEnv()));
      const response = await fetchLookup(env, '/api/search?q=main st tor');

      expect(response.headers.get('Cache-Control')).toContain('public');
      expect(response.headers.get('Cache-Control')).toContain('s-maxage');
    });

    it('is private when basic auth is configured, so a shared cache cannot leak across tenants', async () => {
      const env = { ...enabled(withSuggestDb(createLookupTestEnv())), BASIC_AUTH: 'user:pass' } as Env;
      const response = await fetchLookup(env, '/api/search?q=main st tor', {
        headers: { Authorization: `Basic ${btoa('user:pass')}` },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toContain('private');
      expect(response.headers.get('Cache-Control')).not.toContain('s-maxage');
    });

    it('401s without credentials when basic auth is configured', async () => {
      const env = { ...enabled(withSuggestDb(createLookupTestEnv())), BASIC_AUTH: 'user:pass' } as Env;
      const response = await fetchLookup(env, '/api/search?q=main st tor');

      expect(response.status).toBe(401);
    });
  });
});

describe('browser key gate on /api/search', () => {
  const KEY = {
    id: 'pk_live_abc',
    kind: 'browser',
    customerId: 'cust_acme',
    origins: ['https://acme.com', 'https://*.acme.com'],
    dailyLimit: 1000,
  };
  const CUSTOMER = {
    id: 'cust_acme',
    plan: 'free',
    fuseLimit: 1000,
  };

  function withKeys(
    env: Env,
    keys: Record<string, unknown> = { pk_live_abc: KEY },
    customers: Record<string, unknown> = { cust_acme: CUSTOMER }
  ): Env {
    return {
      ...env,
      API_KEYS: {
        get: async (name: string) => {
          if (name.startsWith('customer:')) {
            return customers[name.slice('customer:'.length)] ?? null;
          }
          return keys[name.replace(/^key:/, '')] ?? null;
        },
      },
    } as unknown as Env;
  }

  beforeEach(() => {
    clearApiKeyCache();
    clearCustomerCache();
  });

  const base = () => enabled(withSuggestDb(createLookupTestEnv()));

  it('stays open when API_KEYS is unbound, so shipping the gate turns nobody off', async () => {
    const response = await fetchLookup(base(), '/api/search?q=main st tor');
    expect(response.status).toBe(200);
  });

  it('accepts a valid key from an allowed origin', async () => {
    const response = await fetchLookup(withKeys(base()), '/api/search?q=main st tor&key=pk_live_abc', {
      headers: { Origin: 'https://app.acme.com' },
    });
    expect(response.status).toBe(200);
    expect((await readJson(response)).suggestions).toHaveLength(1);
  });

  it('401s when no key is supplied but keys are enabled', async () => {
    const response = await fetchLookup(withKeys(base()), '/api/search?q=main st tor', {
      headers: { Origin: 'https://acme.com' },
    });
    expect(response.status).toBe(401);
    expect((await readJson(response)).code).toBe('KEY_REQUIRED');
  });

  it('403s a stolen key used from someone else site', async () => {
    const response = await fetchLookup(withKeys(base()), '/api/search?q=main st tor&key=pk_live_abc', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(response.status).toBe(403);
    expect((await readJson(response)).code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('sends no CORS headers on a denial', async () => {
    // Echoing the rejected origin back would let the offending page read the response and would
    // undercut the check that just failed.
    const response = await fetchLookup(withKeys(base()), '/api/search?q=main st tor&key=pk_live_abc', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('sends CORS headers for an allowed origin, so the browser enforces it too', async () => {
    const response = await fetchLookup(withKeys(base()), '/api/search?q=main st tor&key=pk_live_abc', {
      headers: { Origin: 'https://acme.com' },
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://acme.com');
  });

  it('403s a request with no Origin at all', async () => {
    const response = await fetchLookup(withKeys(base()), '/api/search?q=main st tor&key=pk_live_abc');
    expect(response.status).toBe(403);
    expect((await readJson(response)).code).toBe('ORIGIN_REQUIRED');
  });

  it('accepts the key by header as well as query param', async () => {
    const response = await fetchLookup(withKeys(base()), '/api/search?q=main st tor', {
      headers: { Origin: 'https://acme.com', 'X-Api-Key': 'pk_live_abc' },
    });
    expect(response.status).toBe(200);
  });

  it('429s with Retry-After once the daily cap is hit', async () => {
    const env = {
      ...withKeys(base()),
      API_KEY_USAGE: {
        idFromName: () => 'id',
        get: () => ({
          fetch: async () =>
            new Response(JSON.stringify({ allowed: false, count: 1000, limit: 1000, day: '2026-07-15' })),
        }),
      },
    } as unknown as Env;

    const response = await fetchLookup(env, '/api/search?q=main st tor&key=pk_live_abc', {
      headers: { Origin: 'https://acme.com' },
    });
    expect(response.status).toBe(429);
    expect((await readJson(response)).code).toBe('DAILY_LIMIT_EXCEEDED');
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
  });
});

describe('/embed.js is deliberately not gated', () => {
  it('serves the script even when keys are required for the API', async () => {
    // Neither Google nor Canada Post gates the script: Google's loader carries the key in the URL
    // and serves to anyone. It is public JS -- gating it buys nothing and costs CDN cacheability.
    // The API calls are the resource, and those are gated.
    const env = {
      ...enabled(withSuggestDb(createLookupTestEnv())),
      API_KEYS: { get: async () => null },
    } as unknown as Env;

    const response = await fetchLookup(env, '/embed.js');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
  });
});

describe('basic auth works from any domain', () => {
  const KEY2 = { id: 'pk_live_abc', origins: ['https://acme.com'], dailyLimit: 1000 };

  function fullyLocked(): Env {
    return {
      ...enabled(withSuggestDb(createLookupTestEnv())),
      BASIC_AUTH: 'admin:secret',
      API_KEYS: { get: async (n: string) => (n === 'key:pk_live_abc' ? KEY2 : null) },
      // A cap that would block everything, to prove server credentials skip it.
      API_KEY_USAGE: {
        idFromName: () => 'id',
        get: () => ({
          fetch: async () => new Response(JSON.stringify({ allowed: false, count: 9, limit: 9, day: 'd' })),
        }),
      },
    } as unknown as Env;
  }

  const creds = { Authorization: `Basic ${btoa('admin:secret')}` };

  it('accepts basic auth from an origin that is on NO allowlist', async () => {
    const response = await fetchLookup(fullyLocked(), '/api/search?q=main st tor', {
      headers: { ...creds, Origin: 'https://somewhere-else.example' },
    });
    expect(response.status).toBe(200);
    expect((await readJson(response)).suggestions).toHaveLength(1);
  });

  it('accepts basic auth with no Origin at all (server to server)', async () => {
    const response = await fetchLookup(fullyLocked(), '/api/search?q=main st tor', { headers: creds });
    expect(response.status).toBe(200);
  });

  it('accepts basic auth with no browser key', async () => {
    const response = await fetchLookup(fullyLocked(), '/api/search?q=main st tor', {
      headers: { ...creds, Origin: 'https://evil.example' },
    });
    expect(response.status).toBe(200);
  });

  it('does not charge a server credential against any key daily cap', async () => {
    // The cap in fullyLocked() blocks everything. A server credential must not be subject to it,
    // or your own backend throttles itself.
    const response = await fetchLookup(fullyLocked(), '/api/search?q=main st tor', { headers: creds });
    expect(response.status).toBe(200);
  });

  it('still rejects WRONG basic auth rather than falling through to open', async () => {
    // Bad credentials are not a credential, so the request falls to the browser-key path and is
    // told it needs a key. 401 (unauthenticated) rather than 403 (authenticated but forbidden).
    const response = await fetchLookup(fullyLocked(), '/api/search?q=main st tor', {
      headers: { Authorization: `Basic ${btoa('admin:wrong')}`, Origin: 'https://evil.example' },
    });
    expect(response.status).toBe(401);
    expect((await readJson(response)).code).toBe('KEY_REQUIRED');
  });

  it('a browser key from an allowed origin still works alongside basic auth being configured', async () => {
    const response = await fetchLookup(fullyLocked(), '/api/search?q=main st tor&key=pk_live_abc', {
      headers: { Origin: 'https://acme.com' },
    });
    // Allowed by origin, but the cap in this env blocks it -- proving the key path IS capped.
    expect(response.status).toBe(429);
  });

  it('401s a caller with neither credential when BASIC_AUTH is set and no key store exists', async () => {
    const env = { ...enabled(withSuggestDb(createLookupTestEnv())), BASIC_AUTH: 'admin:secret' } as Env;
    const response = await fetchLookup(env, '/api/search?q=main st tor');
    expect(response.status).toBe(401);
  });
});
