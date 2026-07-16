import { env } from '~/lib/env.server';

async function projectionFetch(path: string, init: RequestInit = {}) {
  const { workerProjectionUrl, workerProjectionSecret } = env();
  if (!workerProjectionSecret) {
    throw new Error('WORKER_PROJECTION_SECRET is required to manage API keys');
  }
  const res = await fetch(`${workerProjectionUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${workerProjectionSecret}`,
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error: string }).error)
        : `Projection API ${res.status}`
    );
  }
  return body;
}

export async function upsertCustomerProjection(input: {
  id: string;
  plan: string;
  fuseLimit: number;
  fuseSoftWarn?: boolean;
  batchEnabled?: boolean;
  stripeCustomerId?: string;
  label?: string;
}) {
  return projectionFetch('/admin/projection/customers', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function mintKey(input: {
  kind: 'browser' | 'server';
  customerId: string;
  label?: string;
  origins?: string[];
  dailyLimit?: number;
}) {
  return projectionFetch('/admin/projection/keys', {
    method: 'POST',
    body: JSON.stringify(input),
  }) as Promise<{ key: { id: string; kind: string }; secret: string }>;
}

export async function revokeKey(id: string) {
  return projectionFetch(`/admin/projection/keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function fetchUsage(customerId: string) {
  return projectionFetch(`/admin/projection/customers/${encodeURIComponent(customerId)}/usage`) as Promise<{
    month: string;
    count: number;
    limit: number;
  }>;
}
