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
 */

import type { Env } from './types';
import { createApiReference, createOpenAPISpec } from './docs';
import { createEmbedDocsPage } from './embed-docs';
import { getCacheWarmingStatus } from './cache';
import { getMetrics, getMetricsSummary } from './metrics';
import {
  allRequiredDatasetsPresent,
  checkRidingDatasets,
  getAllProvincialPaths,
  missingDatasetKeys,
} from './datasets';
import { geocodingCircuitBreaker, r2CircuitBreaker } from './circuit-breaker';
import { TIME_CONSTANTS } from './config';
import { handleWebhookAdmin } from './webhook-admin';
import {
  badRequest,
  checkAdminAuth,
  hasValidBasicAuth,
  unauthorizedResponse,
} from './utils';
import {
  authorizeLookupRequest,
  httpStatusForKeyDenial,
  type KeyAuthResult,
} from './api-keys';
import type { LookupRequestScope } from './lookup-handler';

export type RouteOwner = 'api' | 'portal';
export type RouteVisibility = 'public' | 'internal';
export type RouteAuth = 'public' | 'admin' | 'key' | 'admin-optional';
/** Declarative rate-limit bucket; enforcement lands with the request-lifecycle ticket (#70). */
export type RateLimitBucket =
  | 'none'
  | 'lookup'
  | 'geocode'
  | 'demo'
  | 'search'
  | 'batch';

/**
 * Every handler receives one context object. `scope` is today's `LookupRequestScope`, nested
 * unchanged so existing handler bodies adapt thinly; it folds in as handlers are touched.
 */
export type RouteContext = {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  url: URL;
  params: Record<string, string>;
  scope: LookupRequestScope;
  /** Set by `authorize`: true when `auth: 'admin-optional'` and valid credentials were presented. */
  isAdmin: boolean;
};

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

function jsonHeaders(ctx: RouteContext): Record<string, string> {
  return {
    'content-type': 'application/json; charset=UTF-8',
    ...ctx.scope.corsHeaders(ctx.request.headers.get('Origin')),
  };
}

// ── Gateway surface: ported handlers ─────────────────────────────────────────

/** `/api/docs` — the machine-readable OpenAPI document. */
function handleOpenApiDocs(ctx: RouteContext): Response {
  const baseUrl = `${ctx.url.protocol}//${ctx.url.host}`;
  return new Response(JSON.stringify(createOpenAPISpec(baseUrl)), {
    headers: jsonHeaders(ctx),
  });
}

/** `/docs` + mirrors — the interactive Scalar reference. */
function handleApiReference(ctx: RouteContext): Response {
  const baseUrl = `${ctx.url.protocol}//${ctx.url.host}`;
  return new Response(createApiReference(baseUrl), {
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      ...ctx.scope.corsHeaders(ctx.request.headers.get('Origin')),
    },
  });
}

/** `/docs/embed` + `/embed/docs` — the widget guide. Wildcard CORS, kept separate from Scalar. */
function handleEmbedDocs(ctx: RouteContext): Response {
  const baseUrl = `${ctx.url.protocol}//${ctx.url.host}`;
  return new Response(createEmbedDocsPage(baseUrl), {
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/** `/health` — public liveness; detailed diagnostics only for a valid operator credential. */
async function handleHealth(ctx: RouteContext): Promise<Response> {
  const headers = jsonHeaders(ctx);

  if (!ctx.isAdmin) {
    return new Response(
      JSON.stringify({ status: 'healthy', timestamp: Date.now() }),
      { headers }
    );
  }

  const metrics = getMetrics();
  const circuitBreakerStates = {
    geocodingOda: await geocodingCircuitBreaker.getStateInfo('geocoding:oda'),
    geocodingNominatim: await geocodingCircuitBreaker.getStateInfo('geocoding:nominatim'),
    r2: await r2CircuitBreaker.getStateInfo('r2:federalridings-2024.geojson'),
  };
  const datasets = await checkRidingDatasets(ctx.env);
  const datasetsOk = allRequiredDatasetsPresent(datasets);
  const missingDatasets = missingDatasetKeys(datasets);

  return new Response(
    JSON.stringify({
      status: datasetsOk ? 'healthy' : 'unhealthy',
      timestamp: Date.now(),
      metrics,
      circuitBreakers: circuitBreakerStates,
      cacheWarming: getCacheWarmingStatus(),
      datasets,
      ...(missingDatasets.length > 0 && { missingDatasets }),
    }),
    { headers }
  );
}

/** `/metrics` — operator summary; admin gate runs in `authorize`. */
function handleMetrics(ctx: RouteContext): Response {
  return new Response(JSON.stringify(getMetricsSummary()), { headers: jsonHeaders(ctx) });
}

/** `/cache-warming` — last-warming status; admin gate runs in `authorize`. */
function handleCacheWarming(ctx: RouteContext): Response {
  const status = getCacheWarmingStatus();
  return new Response(
    JSON.stringify({
      ...status,
      config: {
        enabled: true,
        interval: TIME_CONSTANTS.SIX_HOURS_MS,
        batchSize: 5,
      },
    }),
    { headers: jsonHeaders(ctx) }
  );
}

/** `/admin/circuit-breaker/reset` — reset one breaker (by `key`) or all of them. */
async function handleCircuitBreakerReset(ctx: RouteContext): Promise<Response> {
  const key = ctx.url.searchParams.get('key');
  if (key) {
    if (key.startsWith('r2:')) {
      await r2CircuitBreaker.reset(key);
    } else {
      await geocodingCircuitBreaker.reset(key);
    }
    return new Response(
      JSON.stringify({ success: true, message: `Circuit breaker ${key} reset` }),
      { headers: jsonHeaders(ctx) }
    );
  }

  await geocodingCircuitBreaker.resetAll();
  return new Response(
    JSON.stringify({ success: true, message: 'All circuit breakers reset' }),
    { headers: jsonHeaders(ctx) }
  );
}

/** `/webhooks/*` + `/api/webhooks/*` — the existing single webhook-admin adapter. */
function handleWebhookAdminRoute(ctx: RouteContext): Promise<Response> {
  return handleWebhookAdmin(ctx.scope, ctx.request, ctx.url.pathname);
}

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
  { path: ['/webhooks', '/api/webhooks'], methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleWebhookAdminRoute },
  { path: ['/webhooks/*', '/api/webhooks/*'], methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleWebhookAdminRoute },

  // Lookup surface — declared, still legacy.
  { path: LOOKUP_PATHS, methods: ALL_METHODS, owner: 'api', visibility: 'public', auth: 'key', rateLimit: 'lookup', handler: legacy },
  { path: '/api/geocode', methods: ['GET'], owner: 'api', visibility: 'public', auth: 'key', rateLimit: 'geocode', handler: legacy },
  { path: '/api/reverse', methods: ['GET'], owner: 'api', visibility: 'public', auth: 'key', rateLimit: 'geocode', handler: legacy },
  { path: '/api/normalize-address', methods: ['GET'], owner: 'api', visibility: 'public', auth: 'key', rateLimit: 'geocode', handler: legacy },
  { path: '/api/search', methods: ['GET'], owner: 'api', visibility: 'public', auth: 'key', rateLimit: 'search', handler: legacy },
  { path: '/embed.js', methods: ['GET'], owner: 'api', visibility: 'public', auth: 'public', rateLimit: 'none', handler: legacy },
  { path: DEMO_PATHS, methods: ['GET'], owner: 'api', visibility: 'public', auth: 'public', rateLimit: 'demo', handler: legacy },
  { path: '/api/demo/*', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'demo', handler: legacy },

  // Batch / queue — declared, still legacy.
  { path: '/batch', methods: ['POST'], owner: 'api', visibility: 'public', auth: 'key', rateLimit: 'batch', handler: legacy },
  { path: '/batch/:id', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'key', rateLimit: 'batch', handler: legacy },
  { path: '/batch/*', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'key', rateLimit: 'batch', handler: legacy },
  { path: '/api/queue/submit', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/queue/status', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/queue/process', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/queue/stats', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/queue/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/queue/process', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/queue/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },

  // Operator surfaces — declared, still legacy.
  { path: '/api/database/init', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/database/sync', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/database/stats', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/database/query', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },
  { path: '/api/database/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/boundaries/lookup', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },
  { path: '/api/boundaries/all', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },
  { path: '/api/boundaries/config', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },
  { path: '/api/boundaries/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },
  { path: '/api/geocoding/batch/status', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: legacy },
  { path: '/api/cache/warm', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/oda/init', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/oda/stats', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/api/oda/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },
  { path: '/admin/projection/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'key', rateLimit: 'none', handler: legacy },
  { path: '/admin/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: legacy },

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

function keyAuthFailureResponse(auth: KeyAuthResult, correlationId: string): Response {
  const status = auth.reason ? httpStatusForKeyDenial(auth.reason) : 401;
  return badRequest(auth.message || 'Unauthorized', status, auth.reason || 'UNAUTHORIZED', correlationId);
}

/**
 * The single authorization seam, run for every dispatched entry. Legacy entries keep their own
 * inline policy until they are ported: the strangler fallback owns its branch end to end, so
 * gating here too would change its behaviour.
 *
 * `key` delegates to the existing `authorizeLookupRequest`; allowance/billing wiring for a ported
 * key route is the request-lifecycle ticket (#70), so today only the gateway's policy runs.
 */
export async function authorize(entry: RouteEntry, ctx: RouteContext): Promise<Response | null> {
  if (entry.handler === legacy) return null;

  switch (entry.auth) {
    case 'public':
      return null;

    case 'admin':
      if (!checkAdminAuth(ctx.request, ctx.env)) {
        return unauthorizedResponse(ctx.scope.correlationId);
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
        return keyAuthFailureResponse(auth, ctx.scope.correlationId);
      }
      return null;
    }
  }
}

export type DispatchDeps = {
  scope: LookupRequestScope;
  /** Runs the old `fetch` guard-chain for entries still marked `legacy`. */
  legacyHandler: RouteHandler;
};

/**
 * Resolves the request against the API-owned table and runs the one `authorize` seam before the
 * handler. Unclaimed paths (and portal-owned paths, which never reach the API worker in the
 * combined deploy) return the Worker's not-found response.
 */
export async function dispatch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  deps: DispatchDeps
): Promise<Response> {
  const url = new URL(request.url);
  const match = matchRoute(request.method, url.pathname);

  if (!match || match.entry.owner !== 'api') {
    return badRequest('Not found', 404, 'NOT_FOUND', deps.scope.correlationId);
  }

  const routeCtx: RouteContext = {
    request,
    env,
    ctx,
    url,
    params: match.params,
    scope: deps.scope,
    isAdmin: false,
  };

  // The seam runs for every entry; it no-ops for legacy entries, which own their policy end to end.
  const denial = await authorize(match.entry, routeCtx);
  if (denial) return denial;

  const handler = match.entry.handler === legacy ? deps.legacyHandler : match.entry.handler;
  if (!handler) {
    return badRequest('Not found', 404, 'NOT_FOUND', deps.scope.correlationId);
  }
  return handler(routeCtx);
}
