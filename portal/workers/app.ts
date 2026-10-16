import { createRequestHandler, RouterContextProvider } from 'react-router';
import apiWorker, { ApiKeyUsageDO, CircuitBreakerDO, QueueManagerDO } from '../../src/worker';
import { ownerOf } from '../../src/routes';
import { securityHeaders } from '../../src/http-headers';
import type { CloudflareEnv } from '~/lib/cloudflare-env';
import { isSignupRequest } from '../../src/free-access-policy';
import { guardSignup } from '~/lib/signup-guard.server';
import { runWithCloudflareContext } from '~/lib/cloudflare-context.server';

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE
);

async function handlePortalRequest(
  request: Request,
  env: CloudflareEnv,
  ctx: ExecutionContext
): Promise<Response> {
  return runWithCloudflareContext({ env, ctx }, async () => {
    // No eager env fail-fast here: `wrangler dev`/`vite dev` always evaluate the top-level
    // (production) Cloudflare environment locally (see wrangler.jsonc — there's no separate
    // "development" env), so a hard fail-fast would demand every production secret
    // (Resend, Stripe, etc.) just to boot the portal locally. Each feature that actually needs a
    // secret (auth.server.ts's AUTH_SECRET check, email sending, Stripe routes) already guards
    // itself via env() at the point of use.
    // RR8 requires a fresh provider for every request. Bindings remain request-scoped
    // in AsyncLocalStorage above, as used by the portal's database and auth helpers.
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    if (isSignupRequest(request.method, path)) {
      const denied = await guardSignup(request);
      if (denied) return denied;
    }
    return requestHandler(request, new RouterContextProvider());
  });
}

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    // The route table (src/routes.ts) is the single source of truth. Any path it classifies as
    // API-owned is forwarded to the API worker; everything else — including portal 404s and
    // future portal routes — is served by the portal, which owns "/".
    if (ownerOf(pathname) === 'api') {
      return apiWorker.fetch(request, env, ctx);
    }
    const response = await handlePortalRequest(request, env, ctx);

    // The API worker applies these to its own responses (src/route-context.ts); portal HTML is
    // rendered by React Router, so it has to be given them here or the marketing pages carry none.
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(securityHeaders())) headers.set(name, value);

    if (pathname === '/') {
      const origin = new URL(request.url).origin;
      headers.append('Link', `<${origin}/docs>; rel="service-doc", <${origin}/api/docs>; rel="service-desc", <${origin}/.well-known/api-catalog>; rel="api-catalog"`);
      headers.append('Link', `<${origin}/docs/agents.md>; rel="service-doc"`);
    }

    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
  async scheduled(event: ScheduledEvent, env: CloudflareEnv, ctx: ExecutionContext): Promise<void> {
    await apiWorker.scheduled(event, env, ctx);
  },
};

// Durable Objects live in src/worker.ts (the API worker); re-export so this combined entry
// (wrangler.jsonc `main`) is what Wrangler sees the exported classes from.
export { QueueManagerDO, CircuitBreakerDO, ApiKeyUsageDO };
