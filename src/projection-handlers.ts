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

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized', code: 'PROJECTION_UNAUTHORIZED' }), {
    status: 401,
    headers: { 'content-type': 'application/json; charset=UTF-8' },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8' },
  });
}

export function checkProjectionAuth(request: Request, env: Env): boolean {
  const expected = env.PROJECTION_ADMIN_SECRET;
  if (!expected) return false;
  const header = request.headers.get('Authorization');
  const token = header?.replace(/^Bearer\s+/i, '').trim();
  return Boolean(token && token === expected);
}

export async function handleProjectionRequest(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  if (!checkProjectionAuth(request, env)) return unauthorized();
  if (!env.API_KEYS) {
    return json({ error: 'API_KEYS binding not configured', code: 'API_KEYS_MISSING' }, 503);
  }

  if (pathname === '/admin/projection/customers' && request.method === 'PUT') {
    const body = (await request.json()) as Partial<CustomerRecord> & { id: string };
    if (!body.id) return json({ error: 'id required' }, 400);
    const plan = (body.plan || 'free') as CustomerPlan;
    const record: CustomerRecord = {
      id: body.id,
      plan,
      fuseLimit: body.fuseLimit ?? defaultFuseLimit(plan, env),
      fuseSoftWarn: body.fuseSoftWarn,
      batchEnabled: body.batchEnabled,
      stripeCustomerId: body.stripeCustomerId,
      label: body.label,
    };
    await putCustomer(env, record);
    return json({ customer: record });
  }

  if (pathname.startsWith('/admin/projection/customers/') && request.method === 'DELETE') {
    const id = pathname.split('/').pop()!;
    await deleteCustomer(env, id);
    return json({ deleted: id });
  }

  if (pathname.startsWith('/admin/projection/customers/') && pathname.endsWith('/usage')) {
    const id = pathname.split('/')[4];
    const usage = await peekCustomerUsage(env, id);
    return json(usage);
  }

  if (pathname === '/admin/projection/keys' && request.method === 'POST') {
    const body = (await request.json()) as {
      kind: 'browser' | 'server';
      customerId: string;
      label?: string;
      origins?: string[];
      dailyLimit?: number;
      live?: boolean;
    };
    if (!body.customerId || !body.kind) {
      return json({ error: 'customerId and kind required' }, 400);
    }

    if (body.kind === 'browser') {
      const id = generateApiKey(body.live !== false);
      const record: ApiKeyRecord = {
        id,
        kind: 'browser',
        customerId: body.customerId,
        label: body.label,
        origins: body.origins || [],
        dailyLimit: body.dailyLimit ?? 1000,
      };
      await putBrowserKey(env, record);
      return json({ key: record, secret: id });
    }

    const secret = generateServerKey(body.live !== false);
    const displayId = serverKeyDisplayId(secret);
    const record = await putServerKey(env, secret, {
      id: displayId,
      customerId: body.customerId,
      label: body.label,
      dailyLimit: 0,
    });
    return json({ key: record, secret });
  }

  if (pathname.startsWith('/admin/projection/keys/') && request.method === 'DELETE') {
    const id = decodeURIComponent(pathname.slice('/admin/projection/keys/'.length));
    await deleteApiKey(env, id);
    clearApiKeyCache();
    clearCustomerCache();
    return json({ deleted: id });
  }

  return json({ error: 'Not found' }, 404);
}
