import { Env } from './types';
import {
  clearApiKeyCache,
  deleteApiKey,
  generateApiKey,
  generateServerKey,
  putBrowserKey,
  putServerKey,
  serverKeyDisplayId,
  type ApiKeyRecord,
} from './api-keys';
import {
  clearCustomerCache,
  CustomerRecord,
  CustomerPlan,
  defaultFuseLimit,
  deleteCustomer,
  putCustomer,
} from './customer';
import { peekCustomerUsage } from './billing';
import { timingSafeEqual } from './utils';
import type { RouteContext } from './route-context';

/** The one 401 body for the projection Bearer gate; `runPrelude` returns it before dispatch. */
export function projectionUnauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized', code: 'PROJECTION_UNAUTHORIZED' }), {
    status: 401,
    headers: { 'content-type': 'application/json; charset=UTF-8' },
  });
}

function json(ctx: RouteContext, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      ...ctx.corsHeaders(ctx.request.headers.get('Origin')),
    },
  });
}

export function checkProjectionAuth(request: Request, env: Env): boolean {
  const expected = env.PROJECTION_ADMIN_SECRET;
  if (!expected) return false;
  const header = request.headers.get('Authorization');
  const token = header?.replace(/^Bearer\s+/i, '').trim();
  // Constant-time compare: a === early-exits on the first mismatching char, leaking prefix length.
  return Boolean(token && timingSafeEqual(token, expected));
}

export type MintKeyInput = {
  kind: 'browser' | 'server';
  customerId: string;
  label?: string;
  origins?: string[];
  dailyLimit?: number;
  live?: boolean;
};

export type MintKeyResult = { key: ApiKeyRecord; secret: string };

/**
 * Core projection operations, decoupled from HTTP (Request/Response) so the portal can call them
 * in-process from the same Worker instead of looping back over HTTP to itself (see
 * portal/app/lib/projection.server.ts). `handleProjectionRequest` below is a thin HTTP wrapper
 * around these for the external-ops Bearer-token path (`/admin/projection/*`).
 */
export async function upsertCustomerProjectionCore(
  env: Env,
  input: Partial<CustomerRecord> & { id: string }
): Promise<{ customer: CustomerRecord }> {
  const plan = (input.plan || 'free') as CustomerPlan;
  const record: CustomerRecord = {
    id: input.id,
    plan,
    fuseLimit: input.fuseLimit ?? defaultFuseLimit(plan, env),
    fuseSoftWarn: input.fuseSoftWarn,
    batchEnabled: input.batchEnabled,
    stripeCustomerId: input.stripeCustomerId,
    label: input.label,
  };
  await putCustomer(env, record);
  return { customer: record };
}

export async function deleteCustomerProjectionCore(env: Env, id: string): Promise<{ deleted: string }> {
  await deleteCustomer(env, id);
  return { deleted: id };
}

export async function usageProjectionCore(
  env: Env,
  id: string
): Promise<{ month: string; count: number; limit: number }> {
  return peekCustomerUsage(env, id);
}

export async function mintKeyProjectionCore(env: Env, input: MintKeyInput): Promise<MintKeyResult> {
  if (input.kind === 'browser') {
    const id = generateApiKey(input.live !== false);
    const record: ApiKeyRecord = {
      id,
      kind: 'browser',
      customerId: input.customerId,
      label: input.label,
      origins: input.origins || [],
      dailyLimit: input.dailyLimit ?? 1000,
    };
    await putBrowserKey(env, record);
    return { key: record, secret: id };
  }

  const secret = generateServerKey(input.live !== false);
  const displayId = serverKeyDisplayId(secret);
  const record = await putServerKey(env, secret, {
    id: displayId,
    customerId: input.customerId,
    label: input.label,
    dailyLimit: 0,
  });
  return { key: record, secret };
}

export async function revokeKeyProjectionCore(env: Env, id: string): Promise<{ deleted: string }> {
  await deleteApiKey(env, id);
  clearApiKeyCache();
  clearCustomerCache();
  return { deleted: id };
}

export async function handleProjectionRequest(ctx: RouteContext): Promise<Response> {
  const { request, env } = ctx;
  const pathname = ctx.url.pathname;

  // The Bearer gate runs in `runPrelude` (entry auth: 'projection'); this wrapper only routes.
  if (!env.API_KEYS) {
    return json(ctx, { error: 'API_KEYS binding not configured', code: 'API_KEYS_MISSING' }, 503);
  }

  if (pathname === '/admin/projection/customers' && request.method === 'PUT') {
    const body = (await request.json()) as Partial<CustomerRecord> & { id: string };
    if (!body.id) return json(ctx, { error: 'id required' }, 400);
    return json(ctx, await upsertCustomerProjectionCore(env, body));
  }

  if (pathname.startsWith('/admin/projection/customers/') && request.method === 'DELETE') {
    const id = pathname.split('/').pop()!;
    return json(ctx, await deleteCustomerProjectionCore(env, id));
  }

  if (pathname.startsWith('/admin/projection/customers/') && pathname.endsWith('/usage')) {
    const id = pathname.split('/')[4];
    return json(ctx, await usageProjectionCore(env, id));
  }

  if (pathname === '/admin/projection/keys' && request.method === 'POST') {
    const body = (await request.json()) as MintKeyInput;
    if (!body.customerId || !body.kind) {
      return json(ctx, { error: 'customerId and kind required' }, 400);
    }
    return json(ctx, await mintKeyProjectionCore(env, body));
  }

  if (pathname.startsWith('/admin/projection/keys/') && request.method === 'DELETE') {
    const id = decodeURIComponent(pathname.slice('/admin/projection/keys/'.length));
    return json(ctx, await revokeKeyProjectionCore(env, id));
  }

  return json(ctx, { error: 'Not found' }, 404);
}
