import { beforeEach, describe, expect, it } from 'vitest';

import { geoCacheLRU, spatialIndexCacheLRU } from '../src/cache';
import { createLookupTestEnv, TORONTO_LAT, TORONTO_LON } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

/**
 * Every response carries the CORS policy — including the ones that say no.
 *
 * The success path had `Access-Control-Allow-Origin` and the error paths had none, so a browser
 * caller could read a successful lookup and could **not** read the error that told it what had
 * gone wrong. For an agent driving this from a page, the failure is the half of the exchange
 * that matters most, and it was the half that arrived unreadable.
 *
 * The policy now lives in `src/http-headers.ts` and is applied at the one boundary every
 * response passes through, so a new error path cannot forget it.
 */
const ORIGIN = 'https://app.example';

async function call(
  env: Env,
  path: string,
  headers: Record<string, string> = {}
): Promise<Response> {
  const worker = (await import('../src/worker')).default;
  const request = new Request(`https://lookup.test${path}`, {
    headers: { host: 'lookup.test', ...headers },
  });
  return worker.fetch(
    request,
    env,
    { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext
  );
}

function envWith(origins?: string): Env {
  const env = createLookupTestEnv() as Env;
  if (origins !== undefined) env.ALLOWED_ORIGINS = origins;
  return env;
}

beforeEach(() => {
  geoCacheLRU.clear();
  spatialIndexCacheLRU.clear();
});

describe('the CORS policy reaches every response', () => {
  it('is on a successful lookup', async () => {
    const response = await call(envWith(), `/api/demo/federal?lat=${TORONTO_LAT}&lon=${TORONTO_LON}`, { origin: ORIGIN });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  it('is on a rejected lookup, which is the half a browser could not read', async () => {
    const env = envWith('https://app.example');
    const response = await call(env, '/api/demo/federal?lat=999&lon=999', { origin: ORIGIN });
    expect(response.status).toBeGreaterThanOrEqual(400);
    // The origin is on the allowlist, so it is echoed back — and with credentials, because that
    // is what the policy says for a matched origin.
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('is on a 404', async () => {
    const env = envWith('https://app.example');
    const response = await call(env, `/api/demo/nosuchdataset?lat=${TORONTO_LAT}&lon=${TORONTO_LON}`, { origin: ORIGIN });
    expect(response.status).toBe(404);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('says Vary: Origin, because the answer depends on the origin', async () => {
    // A shared cache that stored one origin's response and handed it to another would serve the
    // wrong `Access-Control-Allow-Origin` — which is either a broken client or a cross-origin read.
    const response = await call(envWith('https://app.example'), `/api/demo/federal?lat=${TORONTO_LAT}&lon=${TORONTO_LON}`, {
      origin: ORIGIN,
    });
    expect(response.headers.get('vary')).toContain('Origin');
  });

  it('keeps a Vary the response already declares', async () => {
    const response = await call(envWith('https://app.example'), `/api/demo/federal?lat=${TORONTO_LAT}&lon=${TORONTO_LON}`, {
      origin: ORIGIN,
    });
    const vary = response.headers.get('vary') ?? '';
    // Never replaced with `Origin` alone: `Vary: Accept-Encoding` and `Vary: Origin` are both
    // true at once, and replacing one with the other would make a cache serve the wrong variant.
    expect(vary.split(',').map((v) => v.trim().toLowerCase())).toContain('origin');
  });

  it('does not echo an origin that is not on the allowlist', async () => {
    const env = envWith('https://app.example');
    const response = await call(env, `/api/demo/federal?lat=${TORONTO_LAT}&lon=${TORONTO_LON}`, {
      origin: 'https://elsewhere.example',
    });
    expect(response.headers.get('access-control-allow-origin')).not.toBe('https://elsewhere.example');
    // A matched origin is the only one that may be given credentials.
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('leaves a response that already has its own policy alone', async () => {
    // The public AI catalog advertises itself with a wildcard, which is right for a document
    // anybody may read. The general policy must not narrow it.
    const response = await call(envWith('https://app.example'), '/.well-known/ai-catalog.json', {
      origin: 'https://elsewhere.example',
    });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('sends no CORS headers on a refusal that rejected the origin', async () => {
    // Echoing the rejected origin back would let the offending page read the response, and
    // would undercut the check that just failed — the page would learn exactly why it was
    // refused. Every other refusal does carry the policy.
    const env = envWith('https://app.example');
    // The host check runs first, so the origin check is only reached when this deployment's own
    // origin is a configured one.
    env.PUBLIC_API_BASE_URL = 'https://lookup.test';
    const response = await call(env, '/mcp', {
      origin: 'https://elsewhere.example',
      'content-type': 'application/json',
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
