import { Env } from './types';

/** Baseline security headers for HTML and JSON responses. */
export function securityHeaders(): Record<string, string> {
  return {
    // The site is HTTPS-only (Cloudflare-served); no includeSubDomains, so sibling subdomains are
    // not pinned by a header set here.
    'Strict-Transport-Security': 'max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };
}

export interface CorsOriginResolution {
  /** Value for Access-Control-Allow-Origin. */
  allowOrigin: string;
  /**
   * Only true when the request origin was explicitly matched against the configured allowlist.
   * Access-Control-Allow-Credentials must never accompany a wildcard or an unmatched origin:
   * reflecting arbitrary origins with credentials lets any site make authenticated reads.
   */
  allowCredentials: boolean;
}

/**
 * Resolve Access-Control-Allow-Origin.
 * - ALLOWED_ORIGINS unset: `*` (public API surface), never with credentials.
 * - `*` listed: wildcard, never with credentials.
 * - Request origin on the allowlist: echoed back, credentials allowed.
 * - Anything else: first configured origin (a browser no-op for the caller), no credentials.
 */
export function resolveCorsOrigin(env: Env, requestOrigin?: string | null): CorsOriginResolution {
  const configured = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (configured.length === 0) {
    return { allowOrigin: '*', allowCredentials: false };
  }

  if (configured.includes('*')) return { allowOrigin: '*', allowCredentials: false };
  if (requestOrigin && configured.includes(requestOrigin)) {
    return { allowOrigin: requestOrigin, allowCredentials: true };
  }
  return { allowOrigin: configured[0], allowCredentials: false };
}

/**
 * The one CORS header set, for every response.
 *
 * It lives here because it is a decision about the whole API rather than about one route, and
 * because two copies of it drift. The success path had one; the error paths had none — so a
 * browser caller could read a successful lookup and could **not** read the error that told it
 * what had gone wrong, which is the half of the exchange that matters to a caller.
 *
 * `Vary: Origin` is not decoration. `Access-Control-Allow-Origin` and
 * `Access-Control-Allow-Credentials` both depend on the request's origin, so a shared cache
 * that stored one origin's response could hand it to another origin with the wrong
 * `Access-Control-Allow-Origin` — which is either a broken client or a cross-origin read.
 */
export function corsHeaders(env: Env, requestOrigin?: string | null): Record<string, string> {
  const cors = resolveCorsOrigin(env, requestOrigin);
  return {
    'Access-Control-Allow-Origin': cors.allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Accept, Content-Type, Authorization, X-Api-Key, X-Google-API-Key, X-Correlation-ID, X-Request-ID, Mcp-Method, Mcp-Name, Mcp-Protocol-Version',
    'Access-Control-Max-Age': '86400',
    // Credentials only for an origin explicitly matched against the configured allowlist.
    ...(cors.allowCredentials ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
  };
}

/**
 * Add `Vary: Origin` without dropping a `Vary` the response already declares.
 *
 * Appending rather than setting: `Vary: Accept-Encoding` and `Vary: Origin` are both true at
 * once, and replacing one with the other would make a cache serve the wrong variant.
 */
export function withVaryOrigin(headers: Headers): Headers {
  const existing = headers.get('vary');
  if (!existing) {
    headers.set('vary', 'Origin');
  } else if (!existing.split(',').some((value) => value.trim().toLowerCase() === 'origin')) {
    headers.set('vary', `${existing}, Origin`);
  }
  return headers;
}

/**
 * The marker that opts a response out of the CORS policy.
 *
 * **A denial that rejected an origin must not carry CORS headers for that origin.** Echoing it
 * back would let the offending page read the response, and would undercut the check that had
 * just failed — the page would learn exactly why it was refused. So a refusal on origin grounds
 * opts out, and the opt-out is stated rather than inferred.
 *
 * The marker is removed at the boundary, so it never reaches the client.
 */
export const NO_CORS_MARKER = 'x-cancoder-no-cors';

/** A response that must not carry the CORS policy, and says so. */
export function withoutCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set(NO_CORS_MARKER, '1');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
