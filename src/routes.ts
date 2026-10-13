/**
 * The route table — one ordered inventory of every path this Worker and the portal serve.
 *
 * Three readers share it, so route ownership can no longer drift between them:
 *   1. the API dispatcher (`dispatch`) resolves API entries by computed specificity,
 *   2. the portal's forwarding decision reads `ownerOf(pathname)`,
 *   3. the docs coverage test asserts the OpenAPI spec equals the public API entries.
 *
 * The table is declared in full on day 1 (strangler migration). Entries not yet ported carry
 * `handler: legacy`, which the Worker maps to its old `fetch` guard-chain; ported entries carry a
 * real handler and their old branch is deleted. Specificity is computed, not positional: static
 * beats `:param` beats `*`, longer wins, declaration order breaks remaining ties.
 *
 * Handler implementations live beside their concerns (`ops-handlers.ts`, `docs.ts`, `embed.ts`,
 * `lookup-handler.ts`, `oda-handlers.ts`, …) and import `RouteContext` from the leaf
 * `route-context.ts`, never from here — which is what keeps this module free of the old cycle.
 */

import { handleApiReference, handleOpenApiDocs } from './docs';
import { handleEmbedDocs } from './embed-docs';
import { handleEmbedScript } from './embed-handlers';
import {
  handleCacheWarming,
  handleCircuitBreakerReset,
  handleHealth,
  handleMetrics,
} from './ops-handlers';
import { handleWebhookAdmin } from './webhook-admin';
import { getAllProvincialPaths } from './datasets';
import { handleDemoRoute, handleLookupRequest } from './lookup-handler';
import { handleOdaInit, handleOdaStats } from './oda-handlers';
import { checkProjectionAuth, projectionUnauthorizedResponse } from './projection-handlers';
import type { RouteContext } from './route-context';
import {
  badRequest,
  checkAdminAuth,
  checkRateLimit,
  getClientId,
  hasValidBasicAuth,
  rateLimitExceededResponse,
  unauthorizedResponse,
} from './utils';
import {
  apiKeysEnabled,
  authorizeLookupRequest,
  authorizeSearchRequest,
  extractApiKey,
  httpStatusForKeyDenial,
  type KeyAuthResult,
} from './api-keys';
import type { BillableAuthContext } from './billing';
import { isOdaSuggestEnabled } from './oda-config';

export type RouteOwner = 'api' | 'portal';
export type RouteVisibility = 'public' | 'internal';
/**
 * The real auth dialects this Worker serves. Every entry names the gate `runPrelude` actually runs
 * for it, so the table is the authority for "what does this route require":
 *
 *  - `public`          no credential; the handler serves anyone.
 *  - `admin`           operator `BASIC_AUTH` (fail-closed when unset); denial is 401.
 *  - `admin-optional`  not a gate: serves everyone, extra detail to a valid operator credential.
 *  - `key`             lookup auth: a Customer Server key (`Bearer sk_…`) or operator BASIC_AUTH,
 *                      falling back to open/basic-only while `API_KEYS` is unbound. Delegates to
 *                      `authorizeLookupRequest` and resolves the Billable Customer onto `billing`.
 *  - `search`          autocomplete auth: operator/server credential OR an origin-bound Browser
 *                      key. Delegates to `authorizeSearchRequest` — deliberately not `key`, which
 *                      would reject Browser keys.
 *  - `batch`           Enterprise batch: when `API_KEYS` is bound, operator BASIC_AUTH OR a Server
 *                      key whose Customer has `batchEnabled`; otherwise an admin credential.
 *  - `projection`      the portal→Worker ops Bearer secret (`PROJECTION_ADMIN_SECRET`).
 */
export type RouteAuth =
  | 'public'
  | 'admin'
  | 'admin-optional'
  | 'key'
  | 'search'
  | 'batch'
  | 'projection';
/** Declarative rate-limit bucket; `runPrelude` enforces it once per request. */
export type RateLimitBucket =
  | 'none'
  | 'lookup'
  | 'geocode'
  | 'demo'
  | 'search'
  | 'batch';

export type RouteHandler = (ctx: RouteContext) => Promise<Response> | Response;

/** Sentinel marking an entry that still runs the old `fetch` if-chain. */
export const legacy = Symbol('legacy');
export type RouteHandlerOrLegacy = RouteHandler | typeof legacy;

export type RouteEntry = {
  path: string | string[];
  methods: readonly string[];
  owner: RouteOwner;
  visibility: RouteVisibility;
  auth: RouteAuth;
  rateLimit: RateLimitBucket;
  /** Only API entries carry a handler. */
  handler?: RouteHandlerOrLegacy;
};

/** Routes above never inspect the method themselves, so they accept every one. */
export const ALL_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

const DEMO_PATHS = [
  '/api/demo/federal',
  '/api/demo/combined',
  '/api/demo/geocode',
  '/api/demo/reverse',
  '/api/demo/normalize-address',
];

/** The lookup surface served by one handler; `/api` and `/api/combined` are aliases of federal. */
const LOOKUP_PATHS = ['/api', '/api/federal', '/api/combined', ...getAllProvincialPaths()];

// ── The table ────────────────────────────────────────────────────────────────

export const ROUTES: readonly RouteEntry[] = [
  // Portal-owned (the portal entry decides with `ownerOf`).
  { path: '/', methods: ALL_METHODS, owner: 'portal', visibility: 'internal', auth: 'public', rateLimit: 'none' },
  { path: ['/login', '/signup'], methods: ALL_METHODS, owner: 'portal', visibility: 'internal', auth: 'public', rateLimit: 'none' },
  { path: ['/app', '/app/*'], methods: ALL_METHODS, owner: 'portal', visibility: 'internal', auth: 'public', rateLimit: 'none' },
  { path: '/api/auth/*', methods: ALL_METHODS, owner: 'portal', visibility: 'internal', auth: 'public', rateLimit: 'none' },
  { path: ['/api/stripe', '/api/stripe/*'], methods: ALL_METHODS, owner: 'portal', visibility: 'internal', auth: 'public', rateLimit: 'none' },

  // API gateway surface — ported.
  { path: '/api/docs', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleOpenApiDocs },
  { path: ['/docs', '/api/docs/ui', '/api/swagger', '/swagger'], methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleApiReference },
  { path: ['/docs/embed', '/embed/docs'], methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleEmbedDocs },
  { path: '/health', methods: ALL_METHODS, owner: 'api', visibility: 'public', auth: 'admin-optional', rateLimit: 'none', handler: handleHealth },
  { path: '/metrics', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleMetrics },
  { path: '/cache-warming', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleCacheWarming },
  { path: '/admin/circuit-breaker/reset', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleCircuitBreakerReset },
  { path: ['/webhooks', '/api/webhooks'], methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleWebhookAdmin },
  { path: ['/webhooks/*', '/api/webhooks/*'], methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleWebhookAdmin },

  // Lookup surface — ported; auth + rate limit run once in the prelude.
  { path: LOOKUP_PATHS, methods: ALL_METHODS, owner: 'api', visibility: 'public', auth: 'key', rateLimit: 'lookup', handler: handleLookupRequest },
  { path: '/embed.js', methods: ['GET'], owner: 'api', visibility: 'public', auth: 'public', rateLimit: 'none', handler: handleEmbedScript },
  { path: DEMO_PATHS, methods: ['GET'], owner: 'api', visibility: 'public', auth: 'public', rateLimit: 'demo', handler: handleDemoRoute },
  { path: '/api/demo/*', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'demo', handler: handleDemoRoute },

  // ODA geocoding surface — geocode/reverse/normalize stay legacy (see billing-invariants gate);
  // the admin pair is ported.
  { path: '/api/geocode', methods: ['GET'], owner: 'api', visibility: 'public', auth: 'key', rateLimit: 'geocode', handler: legacy },
  { path: '/api/reverse', methods: ['GET'], owner: 'api', visibility: 'public', auth: 'key', rateLimit: 'geocode', handler: legacy },
  { path: '/api/normalize-address', methods: ['GET'], owner: 'api', visibility: 'public', auth: 'key', rateLimit: 'geocode', handler: legacy },
  { path: '/api/search', methods: ['GET'], owner: 'api', visibility: 'public', auth: 'search', rateLimit: 'search', handler: legacy },
  { path: '/api/oda/init', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleOdaInit },
  { path: '/api/oda/stats', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleOdaStats },

  // Batch / queue — declared, still legacy.
  { path: '/batch', methods: ['POST'], owner: 'api', visibility: 'public', auth: 'batch', rateLimit: 'batch', handler: legacy },
  { path: '/batch/:id', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'batch', rateLimit: 'batch', handler: legacy },
  { path: '/batch/*', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'batch', rateLimit: 'batch', handler: legacy },
  { path: '/api/queue/submit', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/queue/status', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/queue/process', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/queue/stats', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  // Anything else under /api/queue falls through to the /api lookup catch-all in the legacy chain,
  // so its real gate is the lookup key, not admin.
  { path: '/api/queue/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'key', rateLimit: 'lookup', handler: legacy },
  { path: '/queue/process', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  // Unclaimed: the legacy chain answers 404 with no credential, so the catch-all is public.
  { path: '/queue/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },

  // Operator surfaces — declared, still legacy.
  { path: '/api/database/init', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/database/sync', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/database/stats', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/database/query', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },
  // Unknown database sub-paths are a 404 with no credential — not the admin gate the old table
  // implied. The specific admin entries above carry their own declaration.
  { path: '/api/database/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },
  { path: '/api/boundaries/lookup', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },
  { path: '/api/boundaries/all', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },
  { path: '/api/boundaries/config', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },
  { path: '/api/boundaries/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },
  { path: '/api/geocoding/batch/status', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },
  { path: '/api/cache/warm', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  // `/api/oda/*` is not a surface: only the two admin entries above exist, and any other
  // `/api/oda/…` path is served by the `/api/*` lookup catch-all (key auth), not admin.
  { path: '/admin/projection/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'projection', rateLimit: 'none', handler: legacy },
  // Unclaimed /admin paths answer 404 with no credential; the projection and circuit-breaker
  // entries above are the real surfaces.
  { path: '/admin/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },

  // Ownership catches that preserve today's prefix decisions.
  { path: '/docs/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },
  { path: '/api/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'key', rateLimit: 'lookup', handler: legacy },
];

// ── Pattern grammar + specificity ───────────────────────────────────────────

const PARAM_SEGMENT = /^:([A-Za-z_][A-Za-z0-9_]*)$/;

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type CompiledPattern = {
  entry: RouteEntry;
  regex: RegExp;
  paramNames: string[];
  weights: number[];
  order: number;
};

/**
 * Compiles `:param` and a trailing `*` into one anchored matcher. `:param` captures exactly one
 * segment; `*` captures the remainder (which may be empty) and is only legal as the last segment.
 */
export function compilePattern(pattern: string): {
  regex: RegExp;
  paramNames: string[];
  weights: number[];
} {
  if (!pattern.startsWith('/')) {
    throw new Error(`Route pattern must start with "/": ${pattern}`);
  }

  const segments = pattern.split('/').slice(1);
  const parts: string[] = [];
  const paramNames: string[] = [];
  const weights: number[] = [];

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;

    if (segment === '*') {
      if (!isLast) {
        throw new Error(`Wildcard "*" is only allowed as the final segment: ${pattern}`);
      }
      parts.push('(.*)');
      weights.push(0);
      return;
    }
    if (segment.includes('*')) {
      throw new Error(`Wildcard "*" must occupy a whole segment: ${pattern}`);
    }

    const param = PARAM_SEGMENT.exec(segment);
    if (param) {
      paramNames.push(param[1]);
      parts.push('([^/]+)');
      weights.push(1);
      return;
    }
    if (segment.includes(':')) {
      throw new Error(`Parameter must occupy a whole segment: ${pattern}`);
    }

    parts.push(escapeRegex(segment));
    weights.push(2);
  });

  return { regex: new RegExp(`^/${parts.join('/')}$`), paramNames, weights };
}

/**
 * Specificity comparator: compare segment weights (static=2, :param=1, *=0) left to right, then
 * prefer the longer pattern, then fall back to declaration order. Sorted ascending, so iterating
 * the compiled list yields the most specific match first.
 */
function compareSpecificity(a: CompiledPattern, b: CompiledPattern): number {
  const shared = Math.min(a.weights.length, b.weights.length);
  for (let i = 0; i < shared; i++) {
    if (a.weights[i] !== b.weights[i]) return b.weights[i] - a.weights[i];
  }
  if (a.weights.length !== b.weights.length) return b.weights.length - a.weights.length;
  return a.order - b.order;
}

const COMPILED: CompiledPattern[] = [];
ROUTES.forEach((entry, entryIndex) => {
  const paths = Array.isArray(entry.path) ? entry.path : [entry.path];
  paths.forEach((path, aliasIndex) => {
    const { regex, paramNames, weights } = compilePattern(path);
    COMPILED.push({ entry, regex, paramNames, weights, order: entryIndex * 1000 + aliasIndex });
  });
});
COMPILED.sort(compareSpecificity);

// ── Public interface ─────────────────────────────────────────────────────────

export type RouteMatch = {
  entry: RouteEntry;
  params: Record<string, string>;
};

/**
 * First (most specific) route whose pattern and method match. Passing `method: undefined` ignores
 * the method — that is the ownership question, not a dispatch one.
 */
export function matchRoute(method: string | undefined, pathname: string): RouteMatch | null {
  for (const compiled of COMPILED) {
    if (method !== undefined && !compiled.entry.methods.includes(method)) continue;

    const match = compiled.regex.exec(pathname);
    if (!match) continue;

    const params: Record<string, string> = {};
    compiled.paramNames.forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1] ?? '');
    });
    return { entry: compiled.entry, params };
  }
  return null;
}

/** Which owner serves this pathname — the portal's forwarding decision. Null when unclaimed. */
export function ownerOf(pathname: string): RouteOwner | null {
  return matchRoute(undefined, pathname)?.entry.owner ?? null;
}

// ── The one auth/rate-limit prelude ──────────────────────────────────────────

function keyAuthFailureResponse(auth: KeyAuthResult, correlationId: string): Response {
  const status = auth.reason ? httpStatusForKeyDenial(auth.reason) : 401;
  return badRequest(auth.message || 'Unauthorized', status, auth.reason || 'UNAUTHORIZED', correlationId);
}

/** The Billable Customer a successful key auth resolves to; null for public/operator requests. */
function billingFromAuth(auth: KeyAuthResult): BillableAuthContext | null {
  return auth.key && auth.customer ? { key: auth.key, customer: auth.customer } : null;
}

/**
 * The one rate-limit seam, keyed by the entry's declared bucket. A valid operator credential is a
 * server-to-server secret used for bulk work, so it is never held to the per-IP bucket (a large
 * import would otherwise fail with 429 partway through).
 */
function enforceRateLimit(entry: RouteEntry, ctx: RouteContext): Response | null {
  const { request, env, correlationId } = ctx;
  const demoRateEnv = { ...env, RATE_LIMIT: parseInt(env.DEMO_RATE_LIMIT || '30', 10) };

  switch (entry.rateLimit) {
    case 'none':
    case 'batch':
      return null;

    // Keyless demo mirrors are always per-IP throttled — the demo bucket is the abuse control,
    // so even an operator credential does not skip it.
    case 'demo':
      if (checkRateLimit(demoRateEnv, `demo:${getClientId(request)}`)) return null;
      return rateLimitExceededResponse(correlationId);

    // A valid operator credential is a server-to-server secret used for bulk work; throttling it
    // with the public per-IP bucket would fail a large import with 429 partway through.
    case 'lookup':
    case 'geocode':
    case 'search': {
      if (hasValidBasicAuth(request, env)) return null;

      if (entry.rateLimit === 'search' && isOdaSuggestEnabled(env)) {
        // The portal try-it key is public and shared, so hold it to the stricter per-IP demo
        // bucket; every other caller keeps its own per-IP bucket. While the suggest flag is off
        // the path is the lookup catch-all, so it keeps the plain per-IP bucket.
        const isDemoKey =
          !!env.DEMO_BROWSER_API_KEY && extractApiKey(request) === env.DEMO_BROWSER_API_KEY;
        const clientId = isDemoKey ? `demo-search:${getClientId(request)}` : getClientId(request);
        const rateEnv = isDemoKey ? demoRateEnv : env;
        if (checkRateLimit(rateEnv, clientId)) return null;
        return rateLimitExceededResponse(correlationId);
      }

      if (checkRateLimit(env, getClientId(request))) return null;
      return rateLimitExceededResponse(correlationId);
    }
  }
}

/**
 * The one auth/rate-limit seam, run once per dispatched entry — legacy entries included. The
 * declared bucket is applied, then the declared dialect, and the outcome lands on the context.
 * Handlers (ported or legacy) never re-check what the table declares; `legacyFetch` keeps only
 * body parsing and the store/lookup call.
 *
 * `key` and `search` delegate to their real dialects; `batch` resolves the Enterprise batch gate;
 * `projection` checks the portal ops Bearer secret. ADR-0005: denial statuses come only from
 * `httpStatusForKeyDenial`.
 */
export async function runPrelude(entry: RouteEntry, ctx: RouteContext): Promise<Response | null> {
  const limited = enforceRateLimit(entry, ctx);
  if (limited) return limited;

  switch (entry.auth) {
    case 'public':
      return null;

    case 'admin':
      if (!checkAdminAuth(ctx.request, ctx.env)) {
        return unauthorizedResponse(ctx.correlationId);
      }
      ctx.isAdmin = true;
      return null;

    case 'admin-optional':
      // Not a gate: the route serves everyone, with extra detail when credentials are valid.
      ctx.isAdmin = checkAdminAuth(ctx.request, ctx.env);
      return null;

    case 'key': {
      const basicAuth = hasValidBasicAuth(ctx.request, ctx.env);
      const auth = await authorizeLookupRequest(ctx.env, ctx.request, basicAuth);
      if (!auth.ok) {
        return keyAuthFailureResponse(auth, ctx.correlationId);
      }
      ctx.auth = auth;
      ctx.billing = billingFromAuth(auth);
      return null;
    }

    case 'search': {
      // Autocomplete accepts an origin-bound Browser key, so this is not the `key` dialect. The
      // ODA suggest flag is a runtime feature gate: while it is off (or ODA_DB is unbound) the
      // path is the lookup catch-all, exactly as it was before the route existed, and takes the
      // lookup gate. Both share the same per-IP bucket.
      const serverCredential = hasValidBasicAuth(ctx.request, ctx.env);
      const auth = isOdaSuggestEnabled(ctx.env)
        ? await authorizeSearchRequest(ctx.env, ctx.request, serverCredential)
        : await authorizeLookupRequest(ctx.env, ctx.request, serverCredential);
      if (!auth.ok) {
        return keyAuthFailureResponse(auth, ctx.correlationId);
      }
      ctx.auth = auth;
      ctx.billing = billingFromAuth(auth);
      return null;
    }

    case 'batch': {
      // Enterprise batch: operator BASIC_AUTH OR a batch-enabled Customer Server key. While the
      // key store is unbound the route stays operator-only, exactly as it did before keys existed.
      if (apiKeysEnabled(ctx.env)) {
        if (hasValidBasicAuth(ctx.request, ctx.env)) return null;

        const auth = await authorizeLookupRequest(ctx.env, ctx.request, false);
        if (!auth.ok) {
          return keyAuthFailureResponse(auth, ctx.correlationId);
        }
        if (!auth.customer?.batchEnabled) {
          return badRequest(
            'Batch requires an Enterprise Customer with batchEnabled',
            403,
            'BATCH_NOT_ENABLED',
            ctx.correlationId
          );
        }
        ctx.auth = auth;
        ctx.billing = billingFromAuth(auth);
        return null;
      }

      if (!checkAdminAuth(ctx.request, ctx.env)) {
        return unauthorizedResponse(ctx.correlationId);
      }
      ctx.isAdmin = true;
      return null;
    }

    case 'projection':
      if (!checkProjectionAuth(ctx.request, ctx.env)) {
        return projectionUnauthorizedResponse();
      }
      return null;
  }
}

/**
 * Resolves the request against the API-owned table, runs the one shared prelude, then the handler.
 * Unclaimed paths (and portal-owned paths, which never reach the API worker in the combined deploy)
 * return the Worker's not-found response.
 */
export async function dispatch(
  ctx: RouteContext,
  legacyHandler: RouteHandler
): Promise<Response> {
  const match = matchRoute(ctx.request.method, ctx.url.pathname);

  if (!match || match.entry.owner !== 'api') {
    return badRequest('Not found', 404, 'NOT_FOUND', ctx.correlationId);
  }

  // Shallow copy: the prelude fills auth/rate-limit outcome without mutating the caller's context.
  const routeCtx: RouteContext = { ...ctx };

  const denial = await runPrelude(match.entry, routeCtx);
  if (denial) return denial;

  const handler = match.entry.handler === legacy ? legacyHandler : match.entry.handler;
  if (!handler) {
    return badRequest('Not found', 404, 'NOT_FOUND', routeCtx.correlationId);
  }
  return handler(routeCtx);
}
