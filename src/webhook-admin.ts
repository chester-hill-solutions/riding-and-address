import type { WebhookConfig } from './types';
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
import type { RouteContext } from './route-context';

/**
 * Both URI namespaces are kept: external callers of `/webhooks/*` are unknown, so it stays as an
 * alias rather than a redirect. `API_PREFIX` is listed first only for readability; the two never
 * overlap.
 */
export const WEBHOOK_ADMIN_PREFIXES = ['/api/webhooks', '/webhooks'] as const;

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

function jsonResponse(body: unknown, ctx: RouteContext): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      ...ctx.corsHeaders(ctx.request.headers.get('Origin')),
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
export async function handleWebhookAdmin(ctx: RouteContext): Promise<Response> {
  const { request, env, correlationId } = ctx;

  if (!checkAdminAuth(request, env)) {
    return unauthorizedResponse(correlationId);
  }

  const route = routeSuffix(ctx.url.pathname);
  const method = request.method;

  if (route === '' && method === 'GET') {
    const webhooksMap = await getAllWebhooks(env);
    const webhooks = Array.from(webhooksMap.entries()).map(([id, config]) =>
      toPublicWebhook(id, config)
    );
    return jsonResponse({ webhooks }, ctx);
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
      return jsonResponse({ webhookId, message: 'Webhook created successfully' }, ctx);
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

    return jsonResponse({ events: filteredEvents }, ctx);
  }

  if (route === '/deliveries' && method === 'GET') {
    const url = new URL(request.url);
    const webhookId = url.searchParams.get('webhookId');
    const status = url.searchParams.get('status');

    const deliveries = await getWebhookDeliveries(env, webhookId || undefined);
    const filteredDeliveries = status ? deliveries.filter((d) => d.status === status) : deliveries;

    return jsonResponse({ deliveries: filteredDeliveries }, ctx);
  }

  return badRequest('Webhook endpoint not found', 404, undefined, correlationId);
}
