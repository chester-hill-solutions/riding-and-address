import type { Env, WebhookConfig } from './types';
import {
  createWebhook,
  getAllWebhooks,
  getWebhookDeliveries,
  getWebhookEvents,
} from './webhooks';
import {
  badRequest,
  checkAdminAuth,
  internalErrorResponse,
  unauthorizedResponse,
} from './utils';

/**
 * Both URI namespaces are kept: external callers of `/webhooks/*` are unknown, so it stays as an
 * alias rather than a redirect. `API_PREFIX` is listed first only for readability; the two never
 * overlap.
 */
export const WEBHOOK_ADMIN_PREFIXES = ['/api/webhooks', '/webhooks'] as const;

/**
 * The slice of the Worker's per-request scope this surface needs. Structurally a subset of
 * `LookupRequestScope`, so the Worker passes its existing scope object unchanged.
 */
export type WebhookAdminScope = {
  env: Env;
  correlationId: string;
  corsHeaders: (origin?: string | null) => Record<string, string>;
};

/** Matches either alias at a path-segment boundary. */
export function isWebhookAdminPath(pathname: string): boolean {
  return WEBHOOK_ADMIN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** `'/api/webhooks/events'` → `'/events'`; `'/webhooks'` → `''`. Null when neither prefix fits. */
function routeSuffix(pathname: string): string | null {
  for (const prefix of WEBHOOK_ADMIN_PREFIXES) {
    if (pathname === prefix) return '';
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  }
  return null;
}

/**
 * One documented list shape for both aliases. `secret` is reduced to a presence marker — the
 * stored value must never leave the engine.
 */
function toPublicWebhook(id: string, config: WebhookConfig) {
  return {
    id,
    url: config.url,
    events: config.events,
    secret: config.secret ? '***' : undefined,
    createdAt: config.createdAt,
    lastDelivery: config.lastDelivery,
    failureCount: config.failureCount,
    maxFailures: config.maxFailures,
    active: config.active,
  };
}

function jsonResponse(body: unknown, scope: WebhookAdminScope, request: Request): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      ...scope.corsHeaders(request.headers.get('Origin')),
    },
  });
}

/**
 * The single HTTP adapter over the webhook engine, shared by `/webhooks/*` and `/api/webhooks/*`.
 *
 * Auth runs once, before any routing, so an unmatched sub-path on either alias is 401 — not an
 * unauthenticated 404 that would let callers probe which routes exist. Both aliases dispatch on the
 * same normalised suffix, so they cannot drift on redaction, field set, filters, or 404 behaviour.
 */
export async function handleWebhookAdmin(
  scope: WebhookAdminScope,
  request: Request,
  pathname: string
): Promise<Response> {
  const { env, correlationId } = scope;

  if (!checkAdminAuth(request, env)) {
    return unauthorizedResponse(correlationId);
  }

  const route = routeSuffix(pathname);
  const method = request.method;

  if (route === '' && method === 'GET') {
    const webhooksMap = await getAllWebhooks(env);
    const webhooks = Array.from(webhooksMap.entries()).map(([id, config]) =>
      toPublicWebhook(id, config)
    );
    return jsonResponse({ webhooks }, scope, request);
  }

  if (route === '' && method === 'POST') {
    try {
      const body = (await request.json()) as { url: string; events: string[]; secret?: string };
      const webhookId = await createWebhook(env, {
        url: body.url,
        events: body.events,
        secret: body.secret || '',
        active: true,
      });
      return jsonResponse({ webhookId, message: 'Webhook created successfully' }, scope, request);
    } catch (error) {
      return internalErrorResponse(error, 'Failed to create webhook', correlationId);
    }
  }

  if (route === '/events' && method === 'GET') {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const webhookId = url.searchParams.get('webhookId');

    const events = await getWebhookEvents(env, webhookId || undefined);
    const filteredEvents = status ? events.filter((e) => e.status === status) : events;

    return jsonResponse({ events: filteredEvents }, scope, request);
  }

  if (route === '/deliveries' && method === 'GET') {
    const url = new URL(request.url);
    const webhookId = url.searchParams.get('webhookId');
    const status = url.searchParams.get('status');

    const deliveries = await getWebhookDeliveries(env, webhookId || undefined);
    const filteredDeliveries = status ? deliveries.filter((d) => d.status === status) : deliveries;

    return jsonResponse({ deliveries: filteredDeliveries }, scope, request);
  }

  return badRequest('Webhook endpoint not found', 404, undefined, correlationId);
}
