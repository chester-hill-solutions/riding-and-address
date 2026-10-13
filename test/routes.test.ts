import { describe, it, expect } from 'vitest';
import { createOpenAPISpec } from '../src/docs';
import {
  ROUTES,
  compilePattern,
  legacy,
  matchRoute,
  ownerOf,
  runPrelude,
  type RouteEntry,
} from '../src/routes';
import { createRouteContext, type RouteContext } from '../src/route-context';
import type { Env } from '../src/types';
import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';

/**
 * Unit tests for the route table itself. Dispatch is a pure function of the table, so these pin
 * the two things the old guard-chain could not: computed precedence and machine-checkable
 * ownership. Behaviour stays covered by the integration suite (search/lookup/webhook).
 */

function pathsOf(entry: RouteEntry): string[] {
  return Array.isArray(entry.path) ? entry.path : [entry.path];
}

/** The single entry that declares `path` — paths are unique across the table. */
function entryWithPath(path: string): RouteEntry {
  const entry = ROUTES.find((candidate) => pathsOf(candidate).includes(path));
  if (!entry) throw new Error(`No route table entry declares ${path}`);
  return entry;
}

/** A concrete pathname a pattern accepts: `:param` and `*` each become one `sample` segment. */
function samplePath(pattern: string): string {
  return pattern
    .split('/')
    .map((segment) => (segment === '*' || segment.startsWith(':') ? 'sample' : segment))
    .join('/');
}

describe('pattern grammar', () => {
  it('compiles static, :param and trailing-* segments with specificity weights', () => {
    const staticOnly = compilePattern('/api/docs');
    expect(staticOnly.weights).toEqual([2, 2]);
    expect(staticOnly.paramNames).toEqual([]);
    expect(staticOnly.regex.test('/api/docs')).toBe(true);
    expect(staticOnly.regex.test('/api/docs/ui')).toBe(false);

    const withParam = compilePattern('/batch/:id');
    expect(withParam.weights).toEqual([2, 1]);
    expect(withParam.paramNames).toEqual(['id']);

    const withWildcard = compilePattern('/api/*');
    expect(withWildcard.weights).toEqual([2, 0]);
    expect(withWildcard.regex.test('/api/anything')).toBe(true);
    expect(withWildcard.regex.test('/apifoo')).toBe(false);
  });

  it('rejects a wildcard that is not the final segment', () => {
    expect(() => compilePattern('/a/*/b')).toThrow(/final segment/);
    expect(() => compilePattern('/a/b*')).toThrow(/whole segment/);
    expect(() => compilePattern('/a/:id/x')).not.toThrow();
  });
});

describe('matching precedence', () => {
  it('resolves /api/search ahead of the /api/* catch-all', () => {
    const match = matchRoute('GET', '/api/search');
    expect(match?.entry).toBe(entryWithPath('/api/search'));
    // The catch-all is still reachable — proving the two patterns really do overlap.
    expect(matchRoute('GET', '/api/unclaimed')?.entry).toBe(entryWithPath('/api/*'));
  });

  it('resolves /docs/embed ahead of /docs/* and /docs', () => {
    expect(matchRoute('GET', '/docs/embed')?.entry).toBe(entryWithPath('/docs/embed'));
    expect(matchRoute('GET', '/embed/docs')?.entry).toBe(entryWithPath('/embed/docs'));
    expect(matchRoute('GET', '/docs/other')?.entry).toBe(entryWithPath('/docs/*'));
    expect(matchRoute('GET', '/docs')?.entry).toBe(entryWithPath('/docs'));
  });

  it('resolves /api/docs ahead of /api/*', () => {
    expect(matchRoute('GET', '/api/docs')?.entry).toBe(entryWithPath('/api/docs'));
    expect(matchRoute('GET', '/api/docs/ui')?.entry).toBe(entryWithPath('/api/docs/ui'));
  });

  it('resolves /api/federal ahead of /api/*', () => {
    // The lookup entry carries all 16 aliases as one policy-sharing entry.
    expect(matchRoute('GET', '/api/federal')?.entry).toBe(entryWithPath('/api/federal'));
  });

  it('routes aliases to one shared entry', () => {
    const reference = entryWithPath('/docs');
    for (const alias of ['/docs', '/api/docs/ui', '/api/swagger', '/swagger']) {
      expect(matchRoute('GET', alias)?.entry).toBe(reference);
    }
    const embed = entryWithPath('/docs/embed');
    expect(matchRoute('GET', '/embed/docs')?.entry).toBe(embed);
  });
});

describe(':param extraction', () => {
  it('captures a param segment', () => {
    const match = matchRoute('GET', '/batch/abc-123');
    expect(match?.entry).toBe(entryWithPath('/batch/:id'));
    expect(match?.params).toEqual({ id: 'abc-123' });
  });

  it('decodes URI-encoded params', () => {
    expect(matchRoute('GET', '/batch/a%20b')?.params).toEqual({ id: 'a b' });
  });

  it('does not let a single param segment swallow a deeper path', () => {
    // /batch/a/b is two segments past /batch, so the trailing wildcard entry wins.
    expect(matchRoute('GET', '/batch/a/b')?.entry).toBe(entryWithPath('/batch/*'));
  });
});

describe('method matching', () => {
  it('matches a route only for its declared methods', () => {
    expect(matchRoute('POST', '/batch')?.entry).toBe(entryWithPath('/batch'));
    expect(matchRoute('GET', '/batch')).toBeNull();
    expect(matchRoute('POST', '/cache-warming')).toBeNull();
  });

  it('falls through to a broader route on a method mismatch', () => {
    // /api/search is GET-only; a POST must fall to the catch-all, not 405 at the search route.
    expect(matchRoute('POST', '/api/search')?.entry).toBe(entryWithPath('/api/*'));
  });

  it('ignores the method when resolving ownership', () => {
    expect(matchRoute(undefined, '/batch')?.entry).toBe(entryWithPath('/batch'));
    expect(ownerOf('/batch')).toBe('api');
  });
});

describe('ownerOf', () => {
  it('classifies every declared path with its entry owner', () => {
    for (const entry of ROUTES) {
      for (const pattern of pathsOf(entry)) {
        const pathname = samplePath(pattern);
        expect(ownerOf(pathname), `${pathname} (from ${pattern})`).toBe(entry.owner);
      }
    }
  });

  it('reads the portal for portal paths and the API for API paths', () => {
    expect(ownerOf('/')).toBe('portal');
    expect(ownerOf('/login')).toBe('portal');
    expect(ownerOf('/app/dashboard')).toBe('portal');
    expect(ownerOf('/api/auth/login')).toBe('portal');
    expect(ownerOf('/api/stripe/webhook')).toBe('portal');
    expect(ownerOf('/api/federal')).toBe('api');
    expect(ownerOf('/api')).toBe('api');
    expect(ownerOf('/docs/embed')).toBe('api');
    expect(ownerOf('/webhooks/events')).toBe('api');
  });

  it('returns null for an unclaimed path so the portal can own the fallback', () => {
    expect(ownerOf('/no-such-route')).toBeNull();
  });
});

describe('table completeness', () => {
  it('classifies every entry and gives API entries a handler', () => {
    for (const entry of ROUTES) {
      const label = pathsOf(entry).join(', ');
      expect(['api', 'portal'], label).toContain(entry.owner);
      expect(['public', 'internal'], label).toContain(entry.visibility);
      expect(
        ['public', 'admin', 'admin-optional', 'key', 'search', 'batch', 'projection'],
        label
      ).toContain(entry.auth);
      expect(entry.rateLimit.length, label).toBeGreaterThan(0);
      expect(entry.methods.length, label).toBeGreaterThan(0);
      if (entry.owner === 'api') {
        expect(entry.handler, `${label} is API-owned but has no handler`).toBeDefined();
      } else {
        expect(entry.handler, `${label} is portal-owned and must not have a handler`).toBeUndefined();
      }
    }
  });

  it('keeps the OpenAPI spec equal to the public API entries', () => {
    const specPaths = new Set(Object.keys(createOpenAPISpec('https://lookup.test').paths));
    const publicPaths = new Set(
      ROUTES.filter((entry) => entry.owner === 'api' && entry.visibility === 'public').flatMap(pathsOf)
    );

    expect([...publicPaths].sort()).toEqual([...specPaths].sort());
  });

  it('ports the gateway surface onto real handlers', () => {
    // Milestone 1 ports exactly this surface; the rest is declared for the strangler migration.
    const gateway = [
      '/api/docs',
      '/docs',
      '/docs/embed',
      '/health',
      '/metrics',
      '/cache-warming',
      '/admin/circuit-breaker/reset',
      '/webhooks',
      '/webhooks/*',
    ];
    for (const path of gateway) {
      expect(entryWithPath(path).handler, `${path} is still legacy`).not.toBe(legacy);
      expect(entryWithPath(path).handler).toBeTypeOf('function');
    }
  });
});

const MOCK_EXECUTION_CTX = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

function contextFor(env: Env, request: Request): RouteContext {
  return createRouteContext({
    request,
    env,
    ctx: MOCK_EXECUTION_CTX,
    correlationId: 'test-correlation',
    startTime: Date.now(),
  });
}

/**
 * The defect this pins: ~30 legacy entries declared `auth`/`rateLimit` that nothing read, because
 * `runPrelude` returned early for `handler: legacy`. These assert the declared policy is the one
 * actually enforced — not merely present in the table.
 */
describe('declared policy is enforced', () => {
  it('401s an admin-only legacy entry without credentials (fail closed)', async () => {
    const entry = entryWithPath('/api/cache/warm');
    expect(entry.handler).toBe(legacy);

    const ctx = contextFor(
      {} as Env,
      new Request('https://lookup.test/api/cache/warm', { method: 'POST' })
    );
    const denial = await runPrelude(entry, ctx);

    expect(denial?.status).toBe(401);
    expect(ctx.isAdmin).toBe(false);
  });

  it('admits an admin-only legacy entry with the operator credential', async () => {
    const entry = entryWithPath('/api/cache/warm');
    const env = { BASIC_AUTH: 'admin:secret' } as Env;
    const request = new Request('https://lookup.test/api/cache/warm', {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa('admin:secret')}` },
    });

    const ctx = contextFor(env, request);
    expect(await runPrelude(entry, ctx)).toBeNull();
    expect(ctx.isAdmin).toBe(true);
  });

  it('gates that legacy entry through the real worker + dispatch path', async () => {
    const response = await fetchLookup(createLookupTestEnv(), '/api/cache/warm', { method: 'POST' });
    expect(response.status).toBe(401);
  });

  it('applies the search bucket exactly once per request', async () => {
    const entry = entryWithPath('/api/search');
    const env = { RATE_LIMIT: 1 } as Env;
    const request = new Request('https://lookup.test/api/search?q=main', {
      headers: { 'CF-Connecting-IP': '203.0.113.9' },
    });

    // With RATE_LIMIT=1, a second application inside one request would already deny the first.
    expect(await runPrelude(entry, contextFor(env, request))).toBeNull();
    const denial = await runPrelude(entry, contextFor(env, request));
    expect(denial?.status).toBe(429);
  });

  it('enforces the projection Bearer gate and names its dialect', async () => {
    const entry = entryWithPath('/admin/projection/*');
    expect(entry.auth).toBe('projection');

    const denied = await runPrelude(
      entry,
      contextFor(
        {} as Env,
        new Request('https://lookup.test/admin/projection/customers', { method: 'PUT' })
      )
    );
    expect(denied?.status).toBe(401);
    expect(((await denied!.json()) as { code?: string }).code).toBe('PROJECTION_UNAUTHORIZED');

    const env = { PROJECTION_ADMIN_SECRET: 'ops-secret' } as Env;
    const admitted = await runPrelude(
      entry,
      contextFor(
        env,
        new Request('https://lookup.test/admin/projection/customers', {
          method: 'PUT',
          headers: { Authorization: 'Bearer ops-secret' },
        })
      )
    );
    expect(admitted).toBeNull();
  });

  it('names the real dialect for the routes the old table misdescribed', () => {
    expect(entryWithPath('/api/search').auth).toBe('search');
    expect(entryWithPath('/api/queue/*').auth).toBe('key');
    expect(entryWithPath('/api/queue/*').rateLimit).toBe('lookup');
    expect(entryWithPath('/api/database/*').auth).toBe('public');
    expect(entryWithPath('/admin/*').auth).toBe('public');
    expect(entryWithPath('/queue/*').auth).toBe('public');

    // `/api/oda/*` was declared admin but served as a key lookup; there is no such surface.
    expect(ROUTES.some((entry) => pathsOf(entry).includes('/api/oda/*'))).toBe(false);
    expect(matchRoute('GET', '/api/oda/anything')?.entry).toBe(entryWithPath('/api/*'));
  });
});
