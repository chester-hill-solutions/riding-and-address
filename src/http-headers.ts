import { Env } from './types';

/** Baseline security headers for HTML and JSON responses. */
export function securityHeaders(): Record<string, string> {
  return {
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
