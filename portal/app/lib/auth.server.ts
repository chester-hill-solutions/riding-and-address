import { auth as createBetterAuth, createSessionReader } from '@chester-hill-solutions/auth-postgres';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { createRequireSessionUserId } from '@chester-hill-solutions/auth-react-router';
import { getDb } from '~/lib/db.server';
import { env } from '~/lib/env.server';
import { authSchema } from '~/db/schema';

let authInstance: ReturnType<typeof createBetterAuth> | null = null;

export function getAuth() {
  const { authSecret, baseUrl } = env();
  if (!authSecret) throw new Error('AUTH_SECRET is required');

  if (!authInstance) {
    authInstance = createBetterAuth({
      secret: authSecret,
      baseURL: baseUrl,
      trustedOrigins: [baseUrl],
      database: drizzleAdapter(getDb(), {
        provider: 'pg',
        schema: authSchema,
      }),
      emailAndPassword: { enabled: true },
    }) as ReturnType<typeof createBetterAuth>;
  }
  return authInstance;
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
