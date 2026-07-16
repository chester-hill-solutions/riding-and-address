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

/**
 * Resolve Access-Control-Allow-Origin.
 * When ALLOWED_ORIGINS is set, only listed origins (or `*`) are echoed; others get the first listed.
 */
export function resolveCorsOrigin(env: Env, requestOrigin?: string | null): string {
  const configured = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (configured.length === 0) {
    return requestOrigin || '*';
  }

  if (configured.includes('*')) return '*';
  if (requestOrigin && configured.includes(requestOrigin)) return requestOrigin;
  return configured[0];
}
