import { createRequestHandler } from 'react-router';
import apiWorker, { ApiKeyUsageDO, CircuitBreakerDO, QueueManagerDO } from '../../src/worker';
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

/**
 * Routes the plan locks in one Worker: portal owns `/`, `/login`, `/signup`, `/app/*`,
 * `/api/auth/*`, and `/api/stripe/*`; the API worker (src/worker.ts) owns everything else
 * (other `/api/*`, `/docs`, `/swagger`, `/embed.js`, `/health`, `/metrics`, `/webhooks`,
 * `/batch`, `/queue/*`, `/admin/*`, `/cache-warming`).
 */
function isPortalPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/app' ||
    pathname.startsWith('/app/') ||
    pathname.startsWith('/api/auth/') ||
    pathname === '/api/stripe' ||
    pathname.startsWith('/api/stripe/')
  );
}

function isApiWorkerPath(pathname: string): boolean {
  if (pathname.startsWith('/api/')) {
    return !(pathname.startsWith('/api/auth/') || pathname === '/api/stripe' || pathname.startsWith('/api/stripe/'));
  }
  return (
    pathname === '/docs' ||
    pathname === '/swagger' ||
    pathname === '/embed.js' ||
    pathname === '/health' ||
    pathname === '/metrics' ||
    pathname === '/cache-warming' ||
    pathname.startsWith('/webhooks') ||
    pathname.startsWith('/batch') ||
    pathname.startsWith('/queue') ||
    pathname.startsWith('/admin/')
  );
}

async function handlePortalRequest(
  request: Request,
  env: CloudflareEnv,
  ctx: ExecutionContext
): Promise<Response> {
  return runWithCloudflareContext({ env, ctx }, async () => {
    // No eager `requireEnv()` gate here: `wrangler dev`/`vite dev` always evaluate the top-level
    // (production) Cloudflare environment locally (see wrangler.jsonc — there's no separate
    // "development" env), so a hard fail-fast here would demand every production secret
    // (Resend, Stripe, etc.) just to boot the portal locally. Each feature that actually needs a
    // secret (auth.server.ts's AUTH_SECRET check, email sending, Stripe routes) already guards
    // itself via env()/requireEnv() at the point of use.
    return requestHandler(request, { cloudflare: { env, ctx } });
  });
}

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    if (isPortalPath(pathname)) {
      return handlePortalRequest(request, env, ctx);
    }
    if (isApiWorkerPath(pathname)) {
      return apiWorker.fetch(request, env, ctx);
    }
    // Everything else (portal 404s, future portal routes) — portal owns "/".
    return handlePortalRequest(request, env, ctx);
  },
  async scheduled(event: ScheduledEvent, env: CloudflareEnv, ctx: ExecutionContext): Promise<void> {
    await apiWorker.scheduled(event, env, ctx);
  },
};

// Durable Objects live in src/worker.ts (the API worker); re-export so this combined entry
// (wrangler.jsonc `main`) is what Wrangler sees the exported classes from.
export { QueueManagerDO, CircuitBreakerDO, ApiKeyUsageDO };
