import { drizzle } from 'drizzle-orm/d1';
import * as schema from '~/db/schema';
import { requireCloudflareEnv } from '~/lib/cloudflare-context.server';

/**
 * D1 has no persistent connection to pool (each call is a stateless binding RPC), so unlike the
 * old Postgres `getDb()` this does not cache a client — it just wraps `env.PORTAL_DB` for the
 * current request's Cloudflare context (see cloudflare-context.server.ts / workers/app.ts).
 */
export function getDb() {
  const { PORTAL_DB } = requireCloudflareEnv();
  if (!PORTAL_DB) throw new Error('PORTAL_DB D1 binding is required');
  return drizzle(PORTAL_DB, { schema });
}
