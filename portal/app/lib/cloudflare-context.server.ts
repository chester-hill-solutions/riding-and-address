import { AsyncLocalStorage } from 'node:async_hooks';
import type { CloudflareEnv } from './cloudflare-env';

/// <reference types="@cloudflare/workers-types" />
// `ExecutionContext` below is the ambient global from workers-types (see tsconfig.cloudflare.json's
// `types`), not an explicit import — importing it from the package directly resolves to a distinct
// (non-merged) type identity that can conflict with the global one once DOM lib is also active
// (see the `ScheduledEvent`/`Event` note in workers/app.ts's history).

export interface RequestCloudflareContext {
  env: CloudflareEnv;
  ctx: ExecutionContext;
}

/**
 * Request-scoped Cloudflare bindings (D1, vars, ExecutionContext), populated once per request
 * by `runWithCloudflareContext` in workers/app.ts before the React Router request handler runs.
 * Loaders/actions/entry.server all execute inside that same async chain, so `getCloudflareContext()`
 * is available anywhere on the server without threading `context` through every call site.
 *
 * Falls back to `undefined` outside a request (e.g. `drizzle-kit`, `react-router typegen`, local
 * node scripts) — callers that need a Cloudflare binding must handle that case explicitly.
 */
const storage = new AsyncLocalStorage<RequestCloudflareContext>();

export function runWithCloudflareContext<T>(context: RequestCloudflareContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getCloudflareContext(): RequestCloudflareContext | undefined {
  return storage.getStore();
}

export function getCloudflareEnv(): CloudflareEnv | undefined {
  return storage.getStore()?.env;
}

export function requireCloudflareEnv(): CloudflareEnv {
  const env = getCloudflareEnv();
  if (!env) {
    throw new Error(
      'No Cloudflare request context available (PORTAL_DB binding is only reachable inside a Worker request)'
    );
  }
  return env;
}
