import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  originMatches,
  isOriginAllowed,
  authorizeBrowserKey,
  authorizeSearchRequest,
  extractApiKey,
  generateApiKey,
  clearApiKeyCache,
  apiKeysEnabled,
  httpStatusForKeyDenial,
  type ApiKeyRecord,
  type KeyDenialReason,
} from '../src/api-keys';
import { utcDay, consumeDailyQuota } from '../src/api-key-usage-do';
import { clearCustomerCache, type CustomerRecord } from '../src/customer';
import { Env } from '../src/types';

/**
 * These keys are public by design (the Google/Loqate browser-key model), so the entire security
 * boundary is originMatches(). It gets the scrutiny.
 */

const KEY: ApiKeyRecord = {
  id: 'pk_live_abc',
  kind: 'browser',
  customerId: 'cust_acme',
  label: 'Acme',
  origins: ['https://acme.com', 'https://*.acme.com'],
  dailyLimit: 1000,
};

const CUSTOMER: CustomerRecord = {
  id: 'cust_acme',
  plan: 'free',
  fuseLimit: 1000,
};

function createKeyEnv(
  keys: Record<string, ApiKeyRecord | null> = { pk_live_abc: KEY },
  customers: Record<string, CustomerRecord | null> = { cust_acme: CUSTOMER }
): Env {
  return {
    API_KEYS: {
      get: vi.fn(async (name: string) => {
        if (name.startsWith('customer:')) {
          return customers[name.slice('customer:'.length)] ?? null;
        }
        return keys[name.replace(/^key:/, '')] ?? null;
      }),
    },
  } as unknown as Env;
}

function req(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

beforeEach(() => {
  clearApiKeyCache();
  clearCustomerCache();
});

describe('originMatches', () => {
  it('matches an exact origin', () => {
    expect(originMatches('https://acme.com', 'https://acme.com')).toBe(true);
  });

  it('is case-insensitive and ignores a trailing slash', () => {
    expect(originMatches('https://ACME.com/', 'https://acme.com')).toBe(true);
  });

  it('requires the scheme to match', () => {
    // http://acme.com is a different origin and must not inherit the https allowlist.
    expect(originMatches('http://acme.com', 'https://acme.com')).toBe(false);
  });

  it('requires the port to match', () => {
    expect(originMatches('https://acme.com:8443', 'https://acme.com')).toBe(false);
    expect(originMatches('https://acme.com:8443', 'https://acme.com:8443')).toBe(true);
  });

  describe('wildcards', () => {
    it('matches a subdomain', () => {
      expect(originMatches('https://app.acme.com', 'https://*.acme.com')).toBe(true);
    });

    it('matches a nested subdomain', () => {
      expect(originMatches('https://a.b.acme.com', 'https://*.acme.com')).toBe(true);
    });

    it('does NOT match the bare domain', () => {
      expect(originMatches('https://acme.com', 'https://*.acme.com')).toBe(false);
    });

    it('does NOT match a lookalike suffix', () => {
      // The bug this guards: endsWith('acme.com') would happily accept notacme.com and
      // evilacme.com. The dot matters.
      expect(originMatches('https://notacme.com', 'https://*.acme.com')).toBe(false);
      expect(originMatches('https://evil-acme.com', 'https://*.acme.com')).toBe(false);
    });

    it('does NOT let an attacker suffix the domain onto their own', () => {
      expect(originMatches('https://acme.com.evil.tld', 'https://*.acme.com')).toBe(false);
      expect(originMatches('https://acme.com.evil.tld', 'https://acme.com')).toBe(false);
    });
  });

  describe('rejects malformed input rather than guessing', () => {
    it.each([
      ['', 'https://acme.com'],
      ['https://acme.com', ''],
      ['not-a-url', 'https://acme.com'],
      ['https://acme.com', 'acme.com'],
      ['null', 'https://acme.com'],
    ])('%s vs %s', (origin, pattern) => {
      expect(originMatches(origin, pattern)).toBe(false);
    });
  });

  it('supports a total wildcard, for anyone who explicitly wants an open key', () => {
    expect(originMatches('https://anything.example', '*')).toBe(true);
  });

  it('ignores paths, which Origin never carries anyway', () => {
    expect(originMatches('https://acme.com', 'https://acme.com/checkout')).toBe(false);
  });
});

describe('isOriginAllowed', () => {
  it('passes when any entry matches', () => {
    expect(isOriginAllowed(KEY, 'https://app.acme.com')).toBe(true);
    expect(isOriginAllowed(KEY, 'https://acme.com')).toBe(true);
  });

  it('fails when none match', () => {
    expect(isOriginAllowed(KEY, 'https://evil.example')).toBe(false);
  });

  it('an empty allowlist allows nothing', () => {
    expect(isOriginAllowed({ ...KEY, origins: [] }, 'https://acme.com')).toBe(false);
  });
});

describe('extractApiKey', () => {
  it('reads the query param', () => {
    expect(extractApiKey(req('https://x.test/api/search?key=pk_live_abc'))).toBe('pk_live_abc');
  });

  it('reads the header', () => {
    expect(extractApiKey(req('https://x.test/api/search', { 'X-Api-Key': 'pk_live_abc' }))).toBe('pk_live_abc');
  });

  it('is null when absent', () => {
    expect(extractApiKey(req('https://x.test/api/search'))).toBeNull();
  });
});

describe('authorizeBrowserKey', () => {
  it('is a no-op when API_KEYS is unbound, so the gate is opt-in', async () => {
    expect(apiKeysEnabled({} as Env)).toBe(false);
    const result = await authorizeBrowserKey({} as Env, req('https://x.test/api/search?q=main'));
    expect(result.ok).toBe(true);
  });

  it('accepts a good key from an allowed origin', async () => {
    const result = await authorizeBrowserKey(
      createKeyEnv(),
      req('https://x.test/api/search?key=pk_live_abc', { Origin: 'https://app.acme.com' })
    );
    expect(result.ok).toBe(true);
    expect(result.key?.id).toBe('pk_live_abc');
  });

  it('requires a key', async () => {
    const result = await authorizeBrowserKey(createKeyEnv(), req('https://x.test/api/search'));
    expect(result).toMatchObject({ ok: false, reason: 'KEY_REQUIRED' });
  });

  it('rejects an unknown key', async () => {
    const result = await authorizeBrowserKey(
      createKeyEnv(),
      req('https://x.test/api/search?key=pk_live_nope', { Origin: 'https://acme.com' })
    );
    expect(result).toMatchObject({ ok: false, reason: 'KEY_INVALID' });
  });

  it('rejects a disabled key, so revocation actually revokes', async () => {
    const env = createKeyEnv({ pk_live_abc: { ...KEY, disabled: true } });
    const result = await authorizeBrowserKey(
      env,
      req('https://x.test/api/search?key=pk_live_abc', { Origin: 'https://acme.com' })
    );
    expect(result).toMatchObject({ ok: false, reason: 'KEY_DISABLED' });
  });

  it('rejects a good key used from someone else’s site', async () => {
    // The whole point of the model: the thief's browser reports the thief's origin.
    const result = await authorizeBrowserKey(
      createKeyEnv(),
      req('https://x.test/api/search?key=pk_live_abc', { Origin: 'https://evil.example' })
    );
    expect(result).toMatchObject({ ok: false, reason: 'ORIGIN_NOT_ALLOWED' });
    expect(result.message).toContain('https://evil.example');
  });

  it('fails closed when there is no Origin at all', async () => {
    // A real browser always sends Origin on the cross-origin fetch these keys are for. Google
    // leaves this case undocumented; allowing it would hand every non-browser client a free pass.
    const result = await authorizeBrowserKey(
      createKeyEnv(),
      req('https://x.test/api/search?key=pk_live_abc')
    );
    expect(result).toMatchObject({ ok: false, reason: 'ORIGIN_REQUIRED' });
  });

  it('caches a key lookup per isolate rather than hitting KV every keystroke', async () => {
    const env = createKeyEnv();
    const request = () => req('https://x.test/api/search?key=pk_live_abc', { Origin: 'https://acme.com' });
    await authorizeBrowserKey(env, request());
    await authorizeBrowserKey(env, request());
    await authorizeBrowserKey(env, request());
    // First call: key + customer; later calls use ≤60s caches.
    expect(env.API_KEYS!.get).toHaveBeenCalledTimes(2);
  });
});

describe('generateApiKey', () => {
  it('is prefixed and long enough not to be enumerable', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^pk_live_[0-9a-f]{48}$/);
  });

  it('distinguishes test keys', () => {
    expect(generateApiKey(false)).toMatch(/^pk_test_/);
  });

  it('does not repeat', () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateApiKey()));
    expect(keys.size).toBe(50);
  });
});

describe('daily quota', () => {
  it('uses UTC days so the reset does not move with the caller', () => {
    expect(utcDay(Date.parse('2026-07-15T23:59:59Z'))).toBe('2026-07-15');
    expect(utcDay(Date.parse('2026-07-16T00:00:00Z'))).toBe('2026-07-16');
  });

  it('is a no-op with no limit set', async () => {
    const result = await consumeDailyQuota({} as Env, 'pk_live_abc', 0);
    expect(result.allowed).toBe(true);
  });

  it('is a no-op when the counter DO is unbound', async () => {
    const result = await consumeDailyQuota({} as Env, 'pk_live_abc', 100);
    expect(result.allowed).toBe(true);
  });

  it('blocks once the DO says the cap is reached', async () => {
    const env = {
      API_KEY_USAGE: {
        idFromName: () => 'id',
        get: () => ({
          fetch: async () => new Response(JSON.stringify({ allowed: false, count: 100, limit: 100, day: '2026-07-15' })),
        }),
      },
    } as unknown as Env;

    const result = await consumeDailyQuota(env, 'pk_live_abc', 100);
    expect(result.allowed).toBe(false);
  });

  it('fails OPEN when the counter is unavailable', async () => {
    // The cap bounds cost. A counter outage should degrade billing accuracy, not take search
    // down -- the origin allowlist is still enforced either way.
    const env = {
      API_KEY_USAGE: {
        idFromName: () => 'id',
        get: () => ({ fetch: async () => { throw new Error('DO unavailable'); } }),
      },
    } as unknown as Env;

    const result = await consumeDailyQuota(env, 'pk_live_abc', 100);
    expect(result.allowed).toBe(true);
  });
});

describe('authorizeSearchRequest — either credential', () => {
  const keyEnv = () => createKeyEnv();
  const authed = { ...createKeyEnv(), BASIC_AUTH: 'admin:secret' } as unknown as Env;

  it('lets a server credential through from ANY origin, with no key', async () => {
    // BASIC_AUTH is a real secret held server-side, so it is not origin-bound. Restricting it by
    // browser origin would be meaningless -- a backend sends no Origin at all.
    for (const origin of ['https://evil.example', 'https://anything.tld', undefined]) {
      const request = req('https://x.test/api/search?q=main', origin ? { Origin: origin } : {});
      const result = await authorizeSearchRequest(authed, request, true);
      expect(result.ok, `origin ${origin}`).toBe(true);
    }
  });

  it('does not require a key when a server credential is present', async () => {
    const result = await authorizeSearchRequest(authed, req('https://x.test/api/search?q=main'), true);
    expect(result.ok).toBe(true);
    expect(result.key).toBeUndefined();
  });

  it('falls back to the browser key when there is no server credential', async () => {
    const result = await authorizeSearchRequest(
      keyEnv(),
      req('https://x.test/api/search?key=pk_live_abc', { Origin: 'https://acme.com' }),
      false
    );
    expect(result.ok).toBe(true);
    expect(result.key?.id).toBe('pk_live_abc');
  });

  it('still enforces the origin allowlist for a browser key', async () => {
    const result = await authorizeSearchRequest(
      keyEnv(),
      req('https://x.test/api/search?key=pk_live_abc', { Origin: 'https://evil.example' }),
      false
    );
    expect(result).toMatchObject({ ok: false, reason: 'ORIGIN_NOT_ALLOWED' });
  });

  it('requires auth when BASIC_AUTH is set but no key store is configured', async () => {
    const env = { BASIC_AUTH: 'admin:secret' } as Env;
    const result = await authorizeSearchRequest(env, req('https://x.test/api/search?q=main'), false);
    expect(result).toMatchObject({ ok: false, reason: 'KEY_REQUIRED' });
  });

  it('is open when nothing at all is configured', async () => {
    const result = await authorizeSearchRequest({} as Env, req('https://x.test/api/search?q=main'), false);
    expect(result.ok).toBe(true);
  });
});

describe('httpStatusForKeyDenial', () => {
  /**
   * Prevents lookup vs search from remapping the same KeyDenialReason to different statuses.
   * Handlers must call this helper — see scripts/check-billing-invariants.mjs.
   */
  it('maps every KeyDenialReason to a stable status', () => {
    const expected: Record<KeyDenialReason, number> = {
      KEY_REQUIRED: 401,
      KEY_INVALID: 401,
      KEY_DISABLED: 401,
      ORIGIN_REQUIRED: 403,
      ORIGIN_NOT_ALLOWED: 403,
      WRONG_KEY_KIND: 403,
      BATCH_NOT_ENABLED: 403,
      CUSTOMER_NOT_FOUND: 403,
      DAILY_LIMIT_EXCEEDED: 429,
    };
    for (const [reason, status] of Object.entries(expected) as [KeyDenialReason, number][]) {
      expect(httpStatusForKeyDenial(reason)).toBe(status);
    }
  });
});
