import { auth as createBetterAuth, createSessionReader } from '@chester-hill-solutions/auth-d1';
import { jwt } from '@chester-hill-solutions/auth-d1/plugins';
// `mcp` sits behind its own subpath: the adapter's OAuth plugins come from three `@better-auth/*`
// packages that are optional peers, so re-exporting them from `./plugins` would make them mandatory
// for every consumer. See portal/vendor/README.md.
import { mcp } from '@chester-hill-solutions/auth-d1/plugins/mcp';
import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '../../../src/cimd-fetch';
import { ensureCustomerForUser, getCustomerContext } from '~/lib/customer.server';
import { MCP_SCOPES } from '../../../src/mcp-scopes';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { createRequireSessionUserId } from '@chester-hill-solutions/auth-react-router';
import { getDb } from '~/lib/db.server';
import { env } from '~/lib/env.server';
import { requireCloudflareEnv } from './cloudflare-context.server';
import { sendEmail, escapeHtml } from './email.server';
import { betterAuthSchema } from '~/db/schema';

/**
 * The scopes this deployment issues.
 *
 * Defined in `src/mcp-scopes.ts` and imported, rather than repeated here, because the protected
 * resource metadata publishes the same list — and a client told it may request a scope the resource
 * server does not recognise would only find out at the first tool call, not at consent.
 */

function buildAuth() {
  const { authSecret, baseUrl, authTrustedOrigins } = env();
  if (!authSecret) throw new Error('AUTH_SECRET is required');

  return createBetterAuth({
    secret: authSecret,
    baseURL: baseUrl,
    trustedOrigins: [...new Set([baseUrl, ...authTrustedOrigins])],
    database: drizzleAdapter(getDb(), {
      provider: 'sqlite',
      schema: betterAuthSchema,
    }),
    emailAndPassword: { enabled: true },
    // The OAuth authorization server for MCP clients. Until these were registered the portal had no
    // plugins at all, and there was no authorization server — `/auth.md` said so.
    plugins: [
      // Owns the signing key and the `/jwks` endpoint a resource server verifies access tokens
      // against. `mcp()` requires it; without it there is nothing to verify a token with.
      jwt(),
      // OAuth 2.1 discovery, client registration, PKCE, resource binding and the RFC 9728
      // protected-resource metadata. `resource` is the canonical URI of the MCP server, and access
      // tokens carry it as their audience (RFC 8707), so a token minted here is not usable against
      // another MCP server and vice versa.
      mcp({
        loginPage: '/login',
        consentPage: '/consent',
        resource: `${baseUrl}/mcp`,
        scopes: [...MCP_SCOPES],
        // The token carries the Customer it is billed to, decided once here rather than looked up
        // per request by the API worker — which would mean reading the portal's database from a
        // Worker that is deliberately not supposed to. `getCustomerContext` resolves a user to a
        // single Customer (their first membership), which is the same rule the portal already uses
        // everywhere else; when a user can be in several workspaces this becomes a choice that
        // consent should show, and this is the one place it would change.
        customAccessTokenClaims: async ({ user }) => {
          if (!user?.id) return {};
          // Provision on demand, exactly as the portal does on a first visit. Without this a user
          // who authorised an agent but had never opened the portal has no Customer, the claim is
          // absent, and `/mcp` refuses their token — which is what the first headless walk found.
          let context = await getCustomerContext(user.id);
          if (!context) {
            await ensureCustomerForUser(user.id, 'My organization');
            context = await getCustomerContext(user.id);
          }
          return context ? { customer_id: context.billing.customerId } : {};
        },
      }),
      // Client ID Metadata Documents — the registration path a real MCP client uses, since it has no
      // session here to register through and DCR is deliberately off.
      //
      // The transport is ours because the address checks are the application's responsibility; see
      // `src/cimd-fetch.ts` and ADR 0010 for what it enforces and the one requirement it cannot.
      // `mcp-2026-07-28` is the profile MCP pins, and it is stricter than draft-02: it requires
      // `client_name` and `redirect_uris`, because a consent screen with neither cannot tell a user
      // what they are approving.
      cimd({
        fetchClientMetadataResource,
        metadataProfile: 'mcp-2026-07-28',
      }),
    ],
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
