import { beforeEach, describe, expect, it } from 'vitest';

import { clearApiKeyCache, loadApiKey } from '../src/api-keys';
import { clearCustomerCache, loadCustomer } from '../src/customer';
import {
  checkProjectionAuth,
  deleteCustomerProjectionCore,
  handleProjectionRequest,
  mintKeyProjectionCore,
  ProjectionValidationError,
  revokeKeyProjectionCore,
  upsertCustomerProjectionCore,
  usageProjectionCore,
} from '../src/projection-handlers';
import { createRouteContext, type RouteContext } from '../src/route-context';
import { createProjectionTestEnv } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

/**
 * The credential-issuing surface.
 *
 * This file was at 12% line coverage while holding the functions that **mint and delete API
 * keys** — the two operations where a mistake is a credential that works when it should not, or
 * one that stops working when it should. Nothing tested them, because nothing bound the
 * environment they read.
 *
 * The portal reaches these functions in-process, and an external operator reaches them over
 * `/admin/projection/*`, so both paths are exercised here.
 */

function makeContext(env: Env, request: Request): RouteContext {
  return createRouteContext({
    request,
    env,
    ctx: {
      waitUntil: () => {},
      passThroughOnException: () => {},
      props: {},
    } as unknown as ExecutionContext,
    correlationId: 'corr',
    startTime: Date.now(),
  });
}

let env: Env;

beforeEach(() => {
  clearApiKeyCache();
  clearCustomerCache();
  env = createProjectionTestEnv();
});

describe('the projection Bearer gate', () => {
  it('refuses when no secret is configured', () => {
    // Fail closed: an unconfigured secret must not open the surface.
    expect(checkProjectionAuth(new Request('https://x.test/'), env)).toBe(false);
  });

  it('refuses a wrong token, and a missing one', () => {
    env.PROJECTION_ADMIN_SECRET = 'expected';
    expect(checkProjectionAuth(new Request('https://x.test/'), env)).toBe(false);
    expect(
      checkProjectionAuth(
        new Request('https://x.test/', { headers: { Authorization: 'Bearer wrong' } }),
        env
      )
    ).toBe(false);
  });

  it('accepts the right token', () => {
    env.PROJECTION_ADMIN_SECRET = 'expected';
    expect(
      checkProjectionAuth(
        new Request('https://x.test/', { headers: { Authorization: 'Bearer expected' } }),
        env
      )
    ).toBe(true);
  });

  it('does not leak the secret through a prefix', () => {
    // A prefix is not the secret. The comparison is constant-time, but it is also whole-string.
    env.PROJECTION_ADMIN_SECRET = 'expected-secret';
    expect(
      checkProjectionAuth(
        new Request('https://x.test/', { headers: { Authorization: 'Bearer expected' } }),
        env
      )
    ).toBe(false);
  });
});

describe('minting a Browser key', () => {
  it('stores the key under its own id, and returns that id as the secret', async () => {
    // A Browser key is a public identifier: the id IS the credential, and it is what the browser
    // holds. So the secret returned is the id, and nothing secret is stored.
    const minted = await mintKeyProjectionCore(env, { kind: 'browser', customerId: 'cust_1' });

    expect(minted.secret).toBe(minted.key.id);
    expect(minted.key.kind).toBe('browser');
    expect(minted.key.customerId).toBe('cust_1');
    expect(minted.key.dailyLimit).toBe(1000);
    expect(minted.key.origins).toEqual([]);

    const stored = await loadApiKey(env, minted.key.id);
    expect(stored?.id).toBe(minted.key.id);
  });

  it('keeps the origin allowlist it was given', async () => {
    const minted = await mintKeyProjectionCore(env, {
      kind: 'browser',
      customerId: 'cust_1',
      origins: ['https://portal.example'],
    });
    expect(minted.key.origins).toEqual(['https://portal.example']);

    const stored = await loadApiKey(env, minted.key.id);
    expect(stored?.origins).toEqual(['https://portal.example']);
  });
});

describe('minting a Server key', () => {
  it('stores a hash of the secret, never the secret itself', async () => {
    const minted = await mintKeyProjectionCore(env, { kind: 'server', customerId: 'cust_1' });

    expect(minted.secret.startsWith('sk_')).toBe(true);
    expect(minted.key.kind).toBe('server');
    // The stored record is addressed by a short display id, not the secret.
    expect(minted.key.id.startsWith('sk_live_')).toBe(true);

    const stored = await loadApiKey(env, minted.key.id);
    expect(stored?.secretHash).toBeTruthy();
    expect(stored?.secretHash).not.toBe(minted.secret);
    // The raw secret is never in the record the API can read back.
    expect(JSON.stringify(stored)).not.toContain(minted.secret);
  });

  it('gives the Server key no origin allowlist and no daily cap', async () => {
    // A Server key is not origin-bound and is not daily-capped; those are Browser-key properties.
    const minted = await mintKeyProjectionCore(env, { kind: 'server', customerId: 'cust_1' });
    expect(minted.key.origins).toEqual([]);
    expect(minted.key.dailyLimit).toBe(0);
  });
});

describe('revoking a key', () => {
  it('removes the key and its stored secret', async () => {
    const minted = await mintKeyProjectionCore(env, { kind: 'browser', customerId: 'cust_1' });
    expect(await loadApiKey(env, minted.key.id)).not.toBeNull();

    const revoked = await revokeKeyProjectionCore(env, minted.key.id);
    expect(revoked.deleted).toBe(minted.key.id);
    expect(await loadApiKey(env, minted.key.id)).toBeNull();
  });
});

describe('the Customer projection', () => {
  it('writes the Customer, and defaults the fuse from the plan', async () => {
    const { customer } = await upsertCustomerProjectionCore(env, { id: 'cust_1', plan: 'metered' });

    expect(customer.plan).toBe('metered');
    // `metered` is not `enterprise`, so it gets the default free allowance unless one is given.
    expect(customer.fuseLimit).toBe(1000);

    const stored = await loadCustomer(env, 'cust_1');
    expect(stored?.id).toBe('cust_1');
  });

  it('gives an enterprise Customer an unlimited fuse', async () => {
    const { customer } = await upsertCustomerProjectionCore(env, { id: 'cust_e', plan: 'enterprise' });
    expect(customer.fuseLimit).toBe(0);
  });

  it('defaults the plan to free', async () => {
    const { customer } = await upsertCustomerProjectionCore(env, { id: 'cust_2' });
    expect(customer.plan).toBe('free');
  });

  it('keeps an explicit fuse limit', async () => {
    const { customer } = await upsertCustomerProjectionCore(env, {
      id: 'cust_3',
      plan: 'metered',
      fuseLimit: 25,
    });
    expect(customer.fuseLimit).toBe(25);
  });

  it('deletes the Customer', async () => {
    await upsertCustomerProjectionCore(env, { id: 'cust_4' });
    expect(await loadCustomer(env, 'cust_4')).not.toBeNull();

    const deleted = await deleteCustomerProjectionCore(env, 'cust_4');
    expect(deleted.deleted).toBe('cust_4');
    expect(await loadCustomer(env, 'cust_4')).toBeNull();
  });

  it('reports the month and the count for a Customer', async () => {
    const usage = await usageProjectionCore(env, 'cust_5');
    expect(usage.month).toMatch(/^\d{4}-\d{2}$/);
    expect(typeof usage.count).toBe('number');
    expect(typeof usage.limit).toBe('number');
  });
});

describe('the projection bodies are validated, not cast', () => {
  // The open item from docs/reviews/2026-07-16-strictness-ratchet.md: "Projection bodies
  // unvalidated (request.json() cast) — Zod schemas on projection PUT/POST".
  it('refuses a Customer write with no id', async () => {
    await expect(upsertCustomerProjectionCore(env, {} as { id: string })).rejects.toBeInstanceOf(
      ProjectionValidationError
    );
  });

  it('refuses a plan this Worker does not implement', async () => {
    // A plan outside the enum would be written straight into the record the fuse and the
    // Enterprise gate read.
    await expect(
      upsertCustomerProjectionCore(env, { id: 'c', plan: 'platinum' } as never)
    ).rejects.toBeInstanceOf(ProjectionValidationError);
  });

  it('refuses a negative fuse limit', async () => {
    await expect(
      upsertCustomerProjectionCore(env, { id: 'c', fuseLimit: -1 } as never)
    ).rejects.toBeInstanceOf(ProjectionValidationError);
  });

  it('refuses a key mint with no Customer', async () => {
    await expect(mintKeyProjectionCore(env, { kind: 'server' } as never)).rejects.toBeInstanceOf(
      ProjectionValidationError
    );
  });

  it('refuses a key mint of a kind that does not exist', async () => {
    await expect(
      mintKeyProjectionCore(env, { kind: 'admin', customerId: 'c' } as never)
    ).rejects.toBeInstanceOf(ProjectionValidationError);
  });

  it('refuses a key mint whose origins are not strings', async () => {
    await expect(
      mintKeyProjectionCore(env, { kind: 'browser', customerId: 'c', origins: [1] } as never)
    ).rejects.toBeInstanceOf(ProjectionValidationError);
  });
});

describe('the projection HTTP surface', () => {
  const secret = 'projection-secret';

  function request(path: string, init?: RequestInit): Request {
    return new Request(`https://x.test${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secret}`, ...(init?.headers ?? {}) },
    });
  }

  it('answers 404 for a path it does not serve', async () => {
    env.PROJECTION_ADMIN_SECRET = secret;
    const response = await handleProjectionRequest(makeContext(env, request('/admin/projection/nope')));
    expect(response.status).toBe(404);
  });

  it('answers 503 when the key store is not bound', async () => {
    env.PROJECTION_ADMIN_SECRET = secret;
    env.API_KEYS = undefined;
    const response = await handleProjectionRequest(
      makeContext(env, request('/admin/projection/customers', { method: 'PUT', body: JSON.stringify({ id: 'c' }) }))
    );
    expect(response.status).toBe(503);
  });

  it('mints a key over HTTP', async () => {
    env.PROJECTION_ADMIN_SECRET = secret;
    const response = await handleProjectionRequest(
      makeContext(
        env,
        request('/admin/projection/keys', {
          method: 'POST',
          body: JSON.stringify({ kind: 'server', customerId: 'cust_http' }),
        })
      )
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { key: { id: string }; secret: string };
    expect(body.secret.startsWith('sk_')).toBe(true);
    expect(await loadApiKey(env, body.key.id)).not.toBeNull();
  });

  it('answers 400 for a body that does not match the shape', async () => {
    // A bad body is a bad request, not a crash — and it must not write anything.
    env.PROJECTION_ADMIN_SECRET = secret;
    const response = await handleProjectionRequest(
      makeContext(
        env,
        request('/admin/projection/keys', {
          method: 'POST',
          body: JSON.stringify({ kind: 'server' }),
        })
      )
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('INVALID_PROJECTION_BODY');
  });

  it('writes a Customer over HTTP, and reads its usage back', async () => {
    env.PROJECTION_ADMIN_SECRET = secret;
    const put = await handleProjectionRequest(
      makeContext(
        env,
        request('/admin/projection/customers', {
          method: 'PUT',
          body: JSON.stringify({ id: 'cust_http_2', plan: 'metered' }),
        })
      )
    );
    expect(put.status).toBe(200);
    expect(await loadCustomer(env, 'cust_http_2')).not.toBeNull();

    const usage = await handleProjectionRequest(
      makeContext(env, request('/admin/projection/customers/cust_http_2/usage'))
    );
    expect(usage.status).toBe(200);
    const body = (await usage.json()) as { month?: string };
    expect(body.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it('deletes a Customer over HTTP', async () => {
    env.PROJECTION_ADMIN_SECRET = secret;
    await upsertCustomerProjectionCore(env, { id: 'cust_http_3' });

    const response = await handleProjectionRequest(
      makeContext(env, request('/admin/projection/customers/cust_http_3', { method: 'DELETE' }))
    );
    expect(response.status).toBe(200);
    expect(await loadCustomer(env, 'cust_http_3')).toBeNull();
  });

  it('revokes a key over HTTP', async () => {
    env.PROJECTION_ADMIN_SECRET = secret;
    const minted = await mintKeyProjectionCore(env, { kind: 'browser', customerId: 'cust_http_4' });

    const response = await handleProjectionRequest(
      makeContext(env, request(`/admin/projection/keys/${minted.key.id}`, { method: 'DELETE' }))
    );
    expect(response.status).toBe(200);
    expect(await loadApiKey(env, minted.key.id)).toBeNull();
  });
});
