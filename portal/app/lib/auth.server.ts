import { auth as createBetterAuth, createSessionReader } from '@chester-hill-solutions/auth-d1';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { createRequireSessionUserId } from '@chester-hill-solutions/auth-react-router';
import { getDb } from '~/lib/db.server';
import { env } from '~/lib/env.server';
import { requireCloudflareEnv } from './cloudflare-context.server';
import { sendEmail, escapeHtml } from './email.server';
import { authSchema } from '~/db/schema';

function buildAuth() {
  const { authSecret, baseUrl, authTrustedOrigins } = env();
  if (!authSecret) throw new Error('AUTH_SECRET is required');

  return createBetterAuth({
    secret: authSecret,
    baseURL: baseUrl,
    trustedOrigins: [...new Set([baseUrl, ...authTrustedOrigins])],
    database: drizzleAdapter(getDb(), {
      provider: 'sqlite',
      schema: authSchema,
    }),
    emailAndPassword: { enabled: true },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        const binding = requireCloudflareEnv().API_KEY_USAGE;
        if (!binding) throw new Error('Verification is temporarily unavailable');
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(authSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(user.email.trim().toLowerCase()));
        const bucket = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
        const day = new Date().toISOString().slice(0, 10);
        const response = await binding.get(binding.idFromName(`verification:${bucket}`)).fetch(`https://usage/consume?day=${day}&limit=5`, { method: 'POST' });
        if (!response.ok || !(await response.json() as { allowed: boolean }).allowed) throw new Error('Verification email limit reached. Try again tomorrow.');
        await sendEmail({
          to: user.email, subject: 'Verify your CanCoder email', required: true,
          html: `<p>Verify your email to use CanCoder uploads and API keys.</p><p><a href="${escapeHtml(url)}">Verify email</a></p>`,
        });
      },
    },
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

/** Use RR's normalized route URL so login continuations never contain a `.data` suffix. */
export async function requireSessionUserId(request: Request, url: URL): Promise<string> {
  const requireUser = createRequireSessionUserId({
    getSessionUserId: (req) => getSession().getSessionUserId(req),
    loginUrlWithContinue: () => `/login?continue=${encodeURIComponent(url.pathname)}`,
  });
  return requireUser(request, new Headers());
}

export function isFounder(userId: string): boolean {
  return env().founderUserIds.includes(userId);
}
