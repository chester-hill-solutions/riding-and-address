/**
 * The per-request context, lifted out of `routes.ts` into a leaf module.
 *
 * Every handler imports `RouteContext` from here, and this module imports no handlers — which is
 * what breaks the old `routes.ts` ⇄ handler import cycle that type erasure had only been hiding.
 *
 * It carries the raw request/env/ctx, the resolved `url`, the request-scoped timing + header
 * policy, and the auth outcome (`isAdmin`, `billing`, `auth`). Handlers never re-derive the
 * correlation id, rebuild an `ExecutionContext`, or re-run auth/rate limiting.
 */

import type { DeferTaskFn, Env } from './types';
import type { KeyAuthResult } from './api-keys';
import type { LookupRidingFn } from './lookup-expansion';
import { resolveCorsOrigin, securityHeaders } from './http-headers';
import { billableDenialResponse, type BillableAuthContext } from './billing';

/**
 * The outcome of a Billable-unit decision, as returned by `recordSuccessfulBillable`.
 * Handlers reuse it to shape the denial body without importing the billing engine.
 */
export type BillableDecision = {
  allowed: boolean;
  status: number;
  body?: Record<string, unknown>;
};

/**
 * Explicit dependency overrides. Production passes none, so handlers fall back to the real cached
 * core; tests pass a stub to pin a handler path without R2. The seam is a named bag rather than a
 * bare `lookup` field every context carries, so a handler that needs no override sees only `deps`.
 */
export type RouteDeps = {
  /** Test seam: override the riding lookup. Production uses the cached core. */
  lookup?: LookupRidingFn;
};

export type RouteContext = {
  request: Request;
  env: Env;
  url: URL;
  /** Derived once by the lifecycle; handler logs and error bodies reuse it verbatim. */
  correlationId: string;
  /** Request start timestamp, for the timing metrics. */
  startTime: number;
  /** The one response-header policy: CORS + security + correlation id. */
  corsHeaders: (origin?: string | null) => Record<string, string>;
  /** Defer background work past the response, via the request's `ExecutionContext`. */
  deferTask: DeferTaskFn;
  /** Set by the prelude: true when the entry required or accepted admin credentials. */
  isAdmin: boolean;
  /** Resolved Billable Customer for a key entry; null for public/operator requests. */
  billing: BillableAuthContext | null;
  /** Full key-auth outcome, so a handler can branch on the accepted key (e.g. browser vs server). */
  auth: KeyAuthResult;
  /** Dependency overrides; absent in production. */
  deps?: RouteDeps;
  /**
   * The single Fuse-denial dialect: `recordSuccessfulBillable`'s wire body, minus the HTTP
   * envelope. Batch redaction applies this to one item instead of returning a Response.
   */
  billableDenialBody: (billed: BillableDecision) => Record<string, unknown>;
  /**
   * The single Fuse-denial dialect as a Response, with this request's correlation id and headers.
   * `headers` overrides the default CORS policy for routes with origin-aware CORS.
   */
  billableDenial: (billed: BillableDecision, headers?: Record<string, string>) => Response;
};

export type RouteContextInput = {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  correlationId: string;
  startTime: number;
  deps?: RouteDeps;
};

/** Build the header policy once: CORS for this origin, security headers, and the correlation id. */
function responseHeaderPolicy(
  env: Env,
  correlationId: string
): (origin?: string | null) => Record<string, string> {
  return (origin?: string | null) => {
    const cors = resolveCorsOrigin(env, origin);
    return {
      'Access-Control-Allow-Origin': cors.allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, X-Api-Key, X-Google-API-Key, X-Correlation-ID, X-Request-ID',
      'Access-Control-Max-Age': '86400',
      // Credentials only for an origin explicitly matched against the configured allowlist.
      ...(cors.allowCredentials ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
      'X-Correlation-ID': correlationId,
      ...securityHeaders(),
    };
  };
}

/** JSON + this request's CORS/security/correlation headers. */
export function jsonHeaders(ctx: RouteContext): Record<string, string> {
  return {
    'content-type': 'application/json; charset=UTF-8',
    ...ctx.corsHeaders(ctx.request.headers.get('Origin')),
  };
}

/**
 * Assemble the complete request context once, before dispatch. Auth fields start empty and are
 * filled by `runPrelude`.
 */
export function createRouteContext(input: RouteContextInput): RouteContext {
  const { request, env, ctx, correlationId, startTime, deps } = input;
  const url = new URL(request.url);
  const corsHeaders = responseHeaderPolicy(env, correlationId);

  return {
    request,
    env,
    url,
    correlationId,
    startTime,
    corsHeaders,
    deferTask: (task: Promise<unknown>) => { ctx.waitUntil(task); },
    isAdmin: false,
    billing: null,
    auth: { ok: true },
    deps,
    billableDenialBody: (billed) => ({ ...(billed.body ?? {}) }),
    billableDenial: (billed, headers) =>
      billableDenialResponse(
        billed,
        correlationId,
        headers ?? corsHeaders(request.headers.get('Origin'))
      ),
  };
}
