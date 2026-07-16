import { auth as createBetterAuth, createSessionReader } from '@chester-hill-solutions/auth-d1';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { createRequireSessionUserId } from '@chester-hill-solutions/auth-react-router';
import { getDb } from '~/lib/db.server';
import { env } from '~/lib/env.server';
import { authSchema } from '~/db/schema';

function buildAuth() {
  const { authSecret, baseUrl } = env();
  if (!authSecret) throw new Error('AUTH_SECRET is required');

  return createBetterAuth({
    secret: authSecret,
    baseURL: baseUrl,
    trustedOrigins: [baseUrl],
    database: drizzleAdapter(getDb(), {
      provider: 'sqlite',
      schema: authSchema,
    }),
    emailAndPassword: { enabled: true },
    advanced: {
      database: {
        // The CHS auth schema uses uuid primary keys; better-auth's default
        // nanoid-style ids are rejected by the unique index on `user.email` only
        // incidentally — kept for parity with the Postgres deploy's id scheme.
        generateId: () => crypto.randomUUID(),
      },
    },
  });
}

/**
 * D1 is bound per-request (see cloudflare-context.server.ts), so unlike the Postgres portal this
 * cannot build one `auth` instance at module load and cache it for the life of the process — the
 * `drizzleAdapter(getDb(), ...)` call above must run inside the current request's Cloudflare
 * context. Build fresh per call; `better-auth`'s own instance construction is cheap (no network).
 */
export function getAuth() {
  return buildAuth();
}

export function getSession() {
  return createSessionReader(getAuth());
}

const requireSessionUserIdImpl = createRequireSessionUserId({
  getSessionUserId: (request) => getSession().getSessionUserId(request),
  loginUrlWithContinue: (req) => `/login?continue=${encodeURIComponent(new URL(req.url).pathname)}`,
});

/** Convenience wrapper for loaders/actions. */
export async function requireSessionUserId(request: Request): Promise<string> {
  return requireSessionUserIdImpl(request, new Headers());
}

export function isFounder(userId: string): boolean {
  return env().founderUserIds.includes(userId);
}
