import { Env } from './types';
import { CustomerRecord, loadCustomer } from './customer';

/**
 * Browser API keys (`pk_*`) are PUBLIC — origin allowlist + optional daily cap.
 * Server API keys (`sk_*`) are secrets — stored as SHA-256 hashes in KV; raw shown once at mint.
 */

export type ApiKeyKind = 'browser' | 'server';

export interface ApiKeyRecord {
  /** Public id: `pk_live_…` or display id for server keys. */
  id: string;
  kind: ApiKeyKind;
  customerId: string;
  label?: string;
  /**
   * Browser keys only. Allowed origins, e.g. ["https://example.com", "https://*.example.com"].
   */
  origins: string[];
  /** Browser-key abuse cap per UTC day. 0 disables. */
  dailyLimit: number;
  /** Server keys only — hex SHA-256 of the secret. */
  secretHash?: string;
  disabled?: boolean;
  createdAt?: string;
}

export type KeyDenialReason =
  | 'KEY_REQUIRED'
  | 'KEY_INVALID'
  | 'KEY_DISABLED'
  | 'ORIGIN_REQUIRED'
  | 'ORIGIN_NOT_ALLOWED'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'WRONG_KEY_KIND'
  | 'CUSTOMER_NOT_FOUND'
  | 'BATCH_NOT_ENABLED';

export interface KeyAuthResult {
  ok: boolean;
  key?: ApiKeyRecord;
  customer?: CustomerRecord;
  reason?: KeyDenialReason;
  message?: string;
}

/**
 * Canonical HTTP status for a KeyDenialReason.
 * Lookup and search must both call this — do not re-map statuses in handlers.
 */
export function httpStatusForKeyDenial(reason: KeyDenialReason): number {
  switch (reason) {
    case 'KEY_REQUIRED':
    case 'KEY_INVALID':
    case 'KEY_DISABLED':
      return 401;
    case 'ORIGIN_REQUIRED':
    case 'ORIGIN_NOT_ALLOWED':
    case 'WRONG_KEY_KIND':
    case 'BATCH_NOT_ENABLED':
    case 'CUSTOMER_NOT_FOUND':
      return 403;
    case 'DAILY_LIMIT_EXCEEDED':
      return 429;
    default: {
      const _exhaustive: never = reason;
      void _exhaustive;
      return 401;
    }
  }
}

export const API_KEY_PREFIX = 'pk_';
export const SERVER_KEY_PREFIX = 'sk_';

const POSITIVE_TTL_MS = 60_000;
const keyCache = new Map<string, { record: ApiKeyRecord | null; expires: number; negative: boolean }>();

export function apiKeysEnabled(env: Env): boolean {
  return Boolean(env.API_KEYS);
}

export function clearApiKeyCache(): void {
  keyCache.clear();
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cacheGet(id: string): ApiKeyRecord | null | undefined {
  const hit = keyCache.get(id);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) {
    keyCache.delete(id);
    return undefined;
  }
  return hit.record;
}

function cacheSet(id: string, record: ApiKeyRecord | null): void {
  keyCache.set(id, {
    record,
    expires: Date.now() + POSITIVE_TTL_MS,
    negative: record === null,
  });
}

export async function loadApiKey(env: Env, id: string): Promise<ApiKeyRecord | null> {
  if (!env.API_KEYS) return null;
  const cached = cacheGet(id);
  if (cached !== undefined) return cached;

  try {
    const record = (await env.API_KEYS.get(`key:${id}`, 'json')) as ApiKeyRecord | null;
    cacheSet(id, record);
    return record;
  } catch (error) {
    console.warn('Failed to load API key:', error);
    return null;
  }
}

export async function loadServerKeyBySecret(env: Env, secret: string): Promise<ApiKeyRecord | null> {
  if (!env.API_KEYS || !secret.startsWith(SERVER_KEY_PREFIX)) return null;
  const hash = await sha256Hex(secret);
  const cached = cacheGet(`hash:${hash}`);
  if (cached !== undefined) return cached;

  try {
    const record = (await env.API_KEYS.get(`keyhash:${hash}`, 'json')) as ApiKeyRecord | null;
    cacheSet(`hash:${hash}`, record);
    if (record) cacheSet(record.id, record);
    return record;
  } catch (error) {
    console.warn('Failed to load server key:', error);
    return null;
  }
}

export async function putBrowserKey(env: Env, record: ApiKeyRecord): Promise<void> {
  if (!env.API_KEYS) throw new Error('API_KEYS binding required');
  const next: ApiKeyRecord = {
    ...record,
    kind: 'browser',
    origins: record.origins || [],
    createdAt: record.createdAt || new Date().toISOString(),
  };
  await env.API_KEYS.put(`key:${next.id}`, JSON.stringify(next));
  cacheSet(next.id, next);
}

export async function putServerKey(
  env: Env,
  secret: string,
  record: Omit<ApiKeyRecord, 'secretHash' | 'kind' | 'origins'>
): Promise<ApiKeyRecord> {
  if (!env.API_KEYS) throw new Error('API_KEYS binding required');
  const hash = await sha256Hex(secret);
  const next: ApiKeyRecord = {
    ...record,
    kind: 'server',
    origins: [],
    dailyLimit: 0,
    secretHash: hash,
    createdAt: record.createdAt || new Date().toISOString(),
  };
  await env.API_KEYS.put(`keyhash:${hash}`, JSON.stringify(next));
  await env.API_KEYS.put(`key:${next.id}`, JSON.stringify({ ...next, secretHash: hash }));
  cacheSet(`hash:${hash}`, next);
  cacheSet(next.id, next);
  return next;
}

export async function deleteApiKey(env: Env, id: string, secretHash?: string): Promise<void> {
  if (!env.API_KEYS) throw new Error('API_KEYS binding required');
  const existing = await loadApiKey(env, id);
  await env.API_KEYS.delete(`key:${id}`);
  const hash = secretHash || existing?.secretHash;
  if (hash) {
    await env.API_KEYS.delete(`keyhash:${hash}`);
    cacheSet(`hash:${hash}`, null);
  }
  cacheSet(id, null);
}

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

export function extractApiKey(request: Request): string | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('key');
  if (fromQuery) return fromQuery;
  return request.headers.get('X-Api-Key');
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

/**
 * The origin a Browser key should be checked against. Browsers omit the Origin header on
 * same-origin GETs (e.g. the portal try-it widget calling /api/search on the combined Worker),
 * but always send Sec-Fetch-Site — use it to credit the request URL's own origin. Non-browser
 * clients gain nothing here: they could spoof Origin just as easily, and browser keys are
 * public identifiers whose allowlist only means anything inside a real browser.
 */
function effectiveBrowserOrigin(request: Request): string | null {
  const origin = request.headers.get('Origin');
  if (origin) return origin;
  if (request.headers.get('Sec-Fetch-Site') === 'same-origin') {
    return new URL(request.url).origin;
  }
  return null;
}

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
  if (key.kind === 'server') {
    return { ok: false, reason: 'WRONG_KEY_KIND', message: 'Use a Browser key (pk_*) for this route.' };
  }
  if (key.disabled) {
    return { ok: false, reason: 'KEY_DISABLED', message: 'This API key has been disabled.' };
  }

  const origin = effectiveBrowserOrigin(request);
  if (!origin) {
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
      message: `This key cannot be used from ${origin} — its security settings do not include this domain.`,
    };
  }

  if (!key.customerId) {
    return { ok: false, reason: 'CUSTOMER_NOT_FOUND', message: 'This key is not linked to a Customer.' };
  }
  const customer = await loadCustomer(env, key.customerId);
  if (!customer) {
    return { ok: false, reason: 'CUSTOMER_NOT_FOUND', message: 'Customer not found for this key.' };
  }
  return { ok: true, key, customer };
}

/**
 * Authorize Server key (Bearer sk_*) or legacy BASIC_AUTH for lookup/geocode routes.
 * When API_KEYS is bound, Customer Server keys are required (BASIC_AUTH remains for admin).
 */
export async function authorizeServerKey(env: Env, request: Request): Promise<KeyAuthResult> {
  const bearer = extractBearerToken(request);
  if (bearer?.startsWith(SERVER_KEY_PREFIX)) {
    const key = await loadServerKeyBySecret(env, bearer);
    if (!key || key.disabled) {
      return { ok: false, reason: 'KEY_INVALID', message: 'Unknown or disabled Server key.' };
    }
    if (key.kind !== 'server') {
      return { ok: false, reason: 'WRONG_KEY_KIND', message: 'Expected a Server key.' };
    }
    const customer = await loadCustomer(env, key.customerId);
    if (!customer) {
      return { ok: false, reason: 'CUSTOMER_NOT_FOUND', message: 'Customer not found for this key.' };
    }
    return { ok: true, key, customer };
  }

  // Browser key mistakenly sent as Bearer
  if (bearer?.startsWith(API_KEY_PREFIX)) {
    return {
      ok: false,
      reason: 'WRONG_KEY_KIND',
      message: 'Browser keys cannot call lookup routes. Use a Server key (Authorization: Bearer sk_…).',
    };
  }

  return { ok: false, reason: 'KEY_REQUIRED', message: 'Authorization: Bearer sk_… is required.' };
}

export async function authorizeSearchRequest(
  env: Env,
  request: Request,
  hasServerCredential: boolean
): Promise<KeyAuthResult> {
  // BASIC_AUTH (operator) or a validated Server key: skip origin allowlist.
  if (hasServerCredential) {
    const bearer = extractBearerToken(request);
    if (bearer?.startsWith(SERVER_KEY_PREFIX)) {
      return authorizeServerKey(env, request);
    }
    return { ok: true };
  }

  if (apiKeysEnabled(env)) return authorizeBrowserKey(env, request);

  if (env.BASIC_AUTH) {
    return { ok: false, reason: 'KEY_REQUIRED', message: 'Authentication required.' };
  }

  return { ok: true };
}

/** Customer-facing lookup auth when API_KEYS is enabled. */
export async function authorizeLookupRequest(
  env: Env,
  request: Request,
  hasBasicAuth: boolean
): Promise<KeyAuthResult> {
  if (!apiKeysEnabled(env)) {
    // Legacy: open or BASIC_AUTH-only.
    if (env.BASIC_AUTH && !hasBasicAuth) {
      return { ok: false, reason: 'KEY_REQUIRED', message: 'Authentication required.' };
    }
    return { ok: true };
  }

  // Prefer Server key; BASIC_AUTH does not skip Customer metering when keys are enabled
  // (operator admin routes use checkAdminAuth separately).
  const server = await authorizeServerKey(env, request);
  if (server.ok) return server;

  // Allow BASIC_AUTH only as operator bypass without customer context (no billing).
  if (hasBasicAuth) {
    return { ok: true };
  }

  return server;
}

export function generateApiKey(live = true): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const body = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${API_KEY_PREFIX}${live ? 'live' : 'test'}_${body}`;
}

export function generateServerKey(live = true): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const body = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${SERVER_KEY_PREFIX}${live ? 'live' : 'test'}_${body}`;
}

/** Short display id for server keys (not the secret). */
export function serverKeyDisplayId(secret: string): string {
  const body = secret.replace(/^sk_(live|test)_/, '');
  return `sk_${secret.includes('_test_') ? 'test' : 'live'}_${body.slice(0, 8)}`;
}
