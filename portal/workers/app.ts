import { createRequestHandler } from 'react-router';
import apiWorker, { ApiKeyUsageDO, CircuitBreakerDO, QueueManagerDO } from '../../src/worker';
import { ownerOf } from '../../src/routes';
import type { CloudflareEnv } from '~/lib/cloudflare-env';
import { runWithCloudflareContext } from '~/lib/cloudflare-context.server';

declare module 'react-router' {
  interface AppLoadContext {
    cloudflare: {
      env: CloudflareEnv;
      ctx: ExecutionContext;
    };
  }
}

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
    return requestHandler(request, { cloudflare: { env, ctx } });
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
    return handlePortalRequest(request, env, ctx);
  },
  async scheduled(event: ScheduledEvent, env: CloudflareEnv, ctx: ExecutionContext): Promise<void> {
    await apiWorker.scheduled(event, env, ctx);
  },
};

// Durable Objects live in src/worker.ts (the API worker); re-export so this combined entry
// (wrangler.jsonc `main`) is what Wrangler sees the exported classes from.
export { QueueManagerDO, CircuitBreakerDO, ApiKeyUsageDO };
