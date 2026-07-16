import { Env } from './types';

/**
 * Browser API keys for /api/search.
 *
 * These keys are PUBLIC. They ride in a script tag and anyone can read them from view-source.
 * That is not a flaw in the scheme, it is the scheme: it is what Google and Loqate (Canada Post's
 * parent) both do, and Loqate says so plainly -- client-side integrations "don't hide your API
 * keys, which means your keys are visible to anyone viewing the source code of your website".
 *
 * The security therefore does not come from the key being secret. It comes from the server
 * checking the request's Origin against a per-key allowlist. That is an ACCOUNTING control, not
 * an access control:
 *
 *   - It stops someone lifting your key onto their own site: their browser reports their real
 *     origin and we reject it. This is the common case and it works.
 *   - It stops nothing against curl, which can send any Origin it likes. Anyone outside a
 *     browser is outside this model.
 *
 * Because a leak is a when-not-if, each key carries a hard daily cap (see api-key-usage-do.ts) --
 * Canada Post's idea, and a better one than Google's, which just sends you the bill.
 *
 * For real secrecy, use BASIC_AUTH from a server. That is the web-service-key half of the split
 * Google draws, and this is the browser-key half.
 */

export interface ApiKeyRecord {
  /** The key itself, e.g. "pk_live_a1b2c3...". Public. */
  id: string;
  /** Human label for the dashboard/logs. */
  label?: string;
  /**
   * Allowed origins, e.g. ["https://example.com", "https://*.example.com"]. A leading "*." matches
   * one or more subdomain labels, following Google's wildcard semantics. Empty means no browser
   * origin is allowed.
   */
  origins: string[];
  /** Hard requests/day. 0 disables the cap; the fuse is opt-out, not opt-in. */
  dailyLimit: number;
  disabled?: boolean;
  createdAt?: string;
}

export type KeyDenialReason =
  | 'KEY_REQUIRED'
  | 'KEY_INVALID'
  | 'KEY_DISABLED'
  | 'ORIGIN_REQUIRED'
  | 'ORIGIN_NOT_ALLOWED'
  | 'DAILY_LIMIT_EXCEEDED';

export interface KeyAuthResult {
  ok: boolean;
  key?: ApiKeyRecord;
  reason?: KeyDenialReason;
  message?: string;
}

export const API_KEY_PREFIX = 'pk_';

/** Keys are immutable once issued, so an isolate may hold them for its lifetime. */
const keyCache = new Map<string, ApiKeyRecord | null>();

export function apiKeysEnabled(env: Env): boolean {
  return Boolean(env.API_KEYS);
}

export function clearApiKeyCache(): void {
  keyCache.clear();
}

export async function loadApiKey(env: Env, id: string): Promise<ApiKeyRecord | null> {
  if (!env.API_KEYS) return null;
  if (keyCache.has(id)) return keyCache.get(id) ?? null;

  try {
    const record = (await env.API_KEYS.get(`key:${id}`, 'json')) as ApiKeyRecord | null;
    keyCache.set(id, record);
    return record;
  } catch (error) {
    console.warn('Failed to load API key:', error);
    // Do not cache a transient failure as "no such key".
    return null;
  }
}

/**
 * Match an origin against one allowlist entry.
 *
 * Scheme and host must both match; a leading "*." wildcards subdomains. Paths are deliberately
 * not supported -- Google warns that full-path referrers are unreliable because browsers strip
 * the path from cross-origin requests, and Origin never carries one anyway.
 */
export function originMatches(origin: string, pattern: string): boolean {
  if (!origin || !pattern) return false;
  if (pattern === '*') return true;

  const normalizedPattern = pattern.trim().toLowerCase().replace(/\/+$/, '');
  const normalizedOrigin = origin.trim().toLowerCase().replace(/\/+$/, '');
  if (normalizedPattern === normalizedOrigin) return true;

  const patternParts = splitOrigin(normalizedPattern);
  const originParts = splitOrigin(normalizedOrigin);
  if (!patternParts || !originParts) return false;
  if (patternParts.scheme !== originParts.scheme) return false;
  if (patternParts.port !== originParts.port) return false;

  if (patternParts.host.startsWith('*.')) {
    const suffix = patternParts.host.slice(2);
    // "*.example.com" covers app.example.com and a.b.example.com, but not example.com itself,
    // and must not match a lookalike such as notexample.com.
    return originParts.host.endsWith(`.${suffix}`);
  }

  return patternParts.host === originParts.host;
}

function splitOrigin(value: string): { scheme: string; host: string; port: string } | null {
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/:]+)(?::(\d+))?$/.exec(value);
  if (!match) return null;
  return { scheme: match[1], host: match[2], port: match[3] || '' };
}

export function isOriginAllowed(key: ApiKeyRecord, origin: string): boolean {
  return key.origins.some((pattern) => originMatches(origin, pattern));
}

/** Read the key from the query string or header. It is public, so either is fine. */
export function extractApiKey(request: Request): string | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('key');
  if (fromQuery) return fromQuery;
  return request.headers.get('X-Api-Key');
}

/**
 * Validate a browser key and its origin. Does not enforce the daily cap -- that costs a Durable
 * Object round trip and belongs after the cheap checks.
 */
export async function authorizeBrowserKey(env: Env, request: Request): Promise<KeyAuthResult> {
  if (!apiKeysEnabled(env)) return { ok: true };

  const id = extractApiKey(request);
  if (!id) {
    return { ok: false, reason: 'KEY_REQUIRED', message: 'An API key is required. Pass ?key= or X-Api-Key.' };
  }

  const key = await loadApiKey(env, id);
  if (!key) {
    return { ok: false, reason: 'KEY_INVALID', message: 'Unknown API key.' };
  }
  if (key.disabled) {
    return { ok: false, reason: 'KEY_DISABLED', message: 'This API key has been disabled.' };
  }

  const origin = request.headers.get('Origin');
  if (!origin) {
    // A real browser always sends Origin on the cross-origin fetch this key is for. Google leaves
    // the no-referrer case undocumented; we choose to fail closed rather than hand an
    // origin-restricted key a hole that any non-browser client can walk through.
    return {
      ok: false,
      reason: 'ORIGIN_REQUIRED',
      message: 'This key is restricted to browser origins and the request sent no Origin header.',
    };
  }
  if (!isOriginAllowed(key, origin)) {
    return {
      ok: false,
      reason: 'ORIGIN_NOT_ALLOWED',
      // Canada Post names the offending domain back at you, which makes a misconfigured install
      // obvious instead of mysterious.
      message: `This key cannot be used from ${origin} — its security settings do not include this domain.`,
    };
  }

  return { ok: true, key };
}

/**
 * Authorize a /api/search request by either credential.
 *
 * | Caller has                          | API_KEYS bound | BASIC_AUTH set | Result                    |
 * |-------------------------------------|----------------|----------------|---------------------------|
 * | valid basic auth                    | either         | yes            | allow, from ANY origin    |
 * | browser key + allowed origin        | yes            | either         | allow, cap applies        |
 * | browser key + disallowed origin     | yes            | either         | 403                       |
 * | nothing                             | yes            | either         | 401 KEY_REQUIRED          |
 * | nothing                             | no             | yes            | 401 AUTH_REQUIRED         |
 * | nothing                             | no             | no             | allow (nothing configured)|
 *
 * Basic auth is checked first and deliberately skips the origin allowlist and the daily cap: it
 * is a server-held secret, not a public identifier, so restricting it by browser origin would be
 * meaningless (a backend sends no Origin at all) and capping it would throttle your own systems.
 */
export async function authorizeSearchRequest(
  env: Env,
  request: Request,
  hasServerCredential: boolean
): Promise<KeyAuthResult> {
  if (hasServerCredential) return { ok: true };

  if (apiKeysEnabled(env)) return authorizeBrowserKey(env, request);

  // No key store configured, but the service is protected: basic auth is the only way in.
  if (env.BASIC_AUTH) {
    return { ok: false, reason: 'KEY_REQUIRED', message: 'Authentication required.' };
  }

  return { ok: true };
}

/** Mint a key id. Public, so this only needs to be unguessable enough not to be enumerable. */
export function generateApiKey(live = true): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const body = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${API_KEY_PREFIX}${live ? 'live' : 'test'}_${body}`;
}
