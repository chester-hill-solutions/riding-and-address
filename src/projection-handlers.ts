import { Env } from './types';
import { z } from 'zod';
import {
  clearApiKeyCache,
  deleteApiKey,
  generateApiKey,
  generateServerKey,
  loadApiKey,
  putBrowserKey,
  putServerKey,
  serverKeyDisplayId,
  type ApiKeyRecord,
} from './api-keys';
import {
  clearCustomerCache,
  CustomerPlan,
  CustomerPlanSchema,
  CustomerRecord,
  defaultFuseLimit,
  deleteCustomer,
  putCustomer,
} from './customer';
import { peekCustomerUsage } from './billing';
import { timingSafeEqual } from './utils';
import type { RouteContext } from './route-context';

/**
 * The shape of a Customer projection write.
 *
 * **Validated, not cast.** `request.json()` used to be cast to a type and believed — so a body
 * with `fuseLimit: -1`, or a `plan` this Worker does not implement, or a `batchEnabled` of
 * `"yes"`, was written straight into the record the fuse and the Enterprise gate read. This is the
 * credential- and money-owning path; a body that does not match the shape is a bad request.
 *
 * The validation lives in the *core* function rather than in the HTTP wrapper, because the portal
 * calls the core in-process (`portal/app/lib/projection.server.ts`) — a schema in the wrapper
 * would leave the path the portal actually uses unvalidated.
 */
const CustomerProjectionSchema = z.object({
  id: z.string().min(1),
  plan: CustomerPlanSchema.optional(),
  fuseLimit: z.number().int().min(0).optional(),
  fuseSoftWarn: z.boolean().optional(),
  batchEnabled: z.boolean().optional(),
  stripeCustomerId: z.string().optional(),
  label: z.string().optional(),
});

/**
 * The shape of a key-minting request.
 *
 * `kind` decides which credential is minted, so it is an enum rather than a string. `origins` is
 * the allowlist a Browser key is restricted to, and `dailyLimit` its abuse cap — both are read by
 * the auth path, so neither may be whatever the body said.
 */
const MintKeySchema = z.object({
  kind: z.enum(['browser', 'server']),
  customerId: z.string().min(1),
  label: z.string().optional(),
  origins: z.array(z.string()).optional(),
  dailyLimit: z.number().int().min(0).optional(),
  live: z.boolean().optional(),
});

/** A body that does not match the shape. The HTTP wrapper turns this into a 400. */
export class ProjectionValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`invalid projection body: ${issues.join('; ')}`);
    this.name = 'ProjectionValidationError';
    this.issues = issues;
  }
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ProjectionValidationError(parsed.error.issues.map((issue) => issue.message));
  }
  return parsed.data;
}

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
  const parsed = parseOrThrow(CustomerProjectionSchema, input);
  const plan: CustomerPlan = parsed.plan ?? 'free';
  const record: CustomerRecord = {
    id: parsed.id,
    plan,
    fuseLimit: parsed.fuseLimit ?? defaultFuseLimit(plan, env),
    fuseSoftWarn: parsed.fuseSoftWarn,
    batchEnabled: parsed.batchEnabled,
    stripeCustomerId: parsed.stripeCustomerId,
    label: parsed.label,
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
  const parsed = parseOrThrow(MintKeySchema, input);
  if (parsed.kind === 'browser') {
    const id = generateApiKey(parsed.live !== false);
    const record: ApiKeyRecord = {
      id,
      kind: 'browser',
      customerId: parsed.customerId,
      label: parsed.label,
      origins: parsed.origins || [],
      dailyLimit: parsed.dailyLimit ?? 1000,
    };
    await putBrowserKey(env, record);
    return { key: record, secret: id };
  }

  const secret = generateServerKey(parsed.live !== false);
  const displayId = serverKeyDisplayId(secret);
  const record = await putServerKey(env, secret, {
    id: displayId,
    customerId: parsed.customerId,
    label: parsed.label,
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

/**
 * Read a key's record, for an ops tool that has to replace it.
 *
 * **A rotation needs the key it is replacing.** A replacement that does not carry the old key's
 * own customer, origin allowlist and daily cap is not the same key with a new value — it is a
 * different key that happens to sit in the same place, and it is served to nobody if the allowlist
 * was left behind. The portal mirrors the keys it mints into its own database, but a key minted
 * from the command line is in the key store and nowhere else, so the only complete copy is here.
 *
 * **The hash of a server secret is not returned.** It is not something an authenticated caller needs
 * — it cannot be used to authenticate, and it is the one field in this record that is not a public
 * identifier. Everything else about the record is.
 */
export async function showKeyProjectionCore(
  env: Env,
  id: string
): Promise<{ key: Omit<ApiKeyRecord, 'secretHash'> } | { error: 'NOT_FOUND' }> {
  const record = await loadApiKey(env, id);
  if (!record) return { error: 'NOT_FOUND' };
  const { secretHash: _secretHash, ...safe } = record;
  return { key: safe };
}

/**
 * The keys belonging to one Customer.
 *
 * **Scoped to a Customer on purpose.** An ops tool that has replaced a key needs to know what else is
 * on the same Customer: a key left behind by an earlier rotation is a credential nobody holds,
 * attached to a real Customer, and it is not visible from anywhere else. The answer is filtered
 * here, so what comes back is one Customer's keys and not the whole store.
 *
 * **The hash of a Server secret is not returned**, for the same reason it is not returned by the
 * single-key read: it is the one field in the record that is not a public identifier.
 */
export async function listCustomerKeysProjectionCore(
  env: Env,
  customerId: string
): Promise<{ keys: Array<Omit<ApiKeyRecord, 'secretHash'>> }> {
  if (!env.API_KEYS) throw new Error('API_KEYS binding required');

  // A key listing carries names, not values, so each record is read. This is an ops action, not a
  // request path, and the store is bounded by the number of Customers rather than by traffic.
  const listing = await env.API_KEYS.list({ prefix: 'key:', limit: 1000 });
  const keys: Array<Omit<ApiKeyRecord, 'secretHash'>> = [];
  for (const entry of listing.keys) {
    const record = await loadApiKey(env, entry.name.replace(/^key:/, ''));
    if (!record || record.customerId !== customerId) continue;
    const { secretHash: _secretHash, ...safe } = record;
    keys.push(safe);
  }
  return { keys };
}

export async function handleProjectionRequest(ctx: RouteContext): Promise<Response> {
  const { request, env } = ctx;
  const pathname = ctx.url.pathname;

  // The Bearer gate runs in `runPrelude` (entry auth: 'projection'); this wrapper only routes.
  if (!env.API_KEYS) {
    return json(ctx, { error: 'API_KEYS binding not configured', code: 'API_KEYS_MISSING' }, 503);
  }

  // A body that does not match the shape is a bad request, not a crash. The schemas live in the
  // core functions, so the portal's in-process path is validated too; this catch is what turns
  // their rejection into a 400 on the HTTP path.
  const guard = async (run: () => Promise<Response>): Promise<Response> => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ProjectionValidationError) {
        return json(ctx, { error: 'Invalid request body', code: 'INVALID_PROJECTION_BODY', issues: error.issues }, 400);
      }
      throw error;
    }
  };

  if (pathname === '/admin/projection/customers' && request.method === 'PUT') {
    return guard(async () => {
      const body = await request.json();
      return json(ctx, await upsertCustomerProjectionCore(env, body as Partial<CustomerRecord> & { id: string }));
    });
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
    return guard(async () => {
      const body = await request.json();
      return json(ctx, await mintKeyProjectionCore(env, body as MintKeyInput));
    });
  }

  if (pathname === '/admin/projection/keys' && request.method === 'GET') {
    const customerId = ctx.url.searchParams.get('customer');
    if (!customerId) {
      return json(ctx, { error: 'A customer is required', code: 'CUSTOMER_REQUIRED' }, 400);
    }
    return json(ctx, await listCustomerKeysProjectionCore(env, customerId));
  }

  if (pathname.startsWith('/admin/projection/keys/') && request.method === 'DELETE') {
    const id = decodeURIComponent(pathname.slice('/admin/projection/keys/'.length));
    return json(ctx, await revokeKeyProjectionCore(env, id));
  }

  if (pathname.startsWith('/admin/projection/keys/') && request.method === 'GET') {
    const id = decodeURIComponent(pathname.slice('/admin/projection/keys/'.length));
    const result = await showKeyProjectionCore(env, id);
    if ('error' in result) return json(ctx, { error: 'Not found' }, 404);
    return json(ctx, result);
  }

  return json(ctx, { error: 'Not found' }, 404);
}
