import { getCloudflareEnv } from '~/lib/cloudflare-context.server';
import type { CloudflareEnv } from '~/lib/cloudflare-env';

/**
 * Cloudflare `vars`/secrets first (real runtime source once deployed — see wrangler.jsonc /
 * `wrangler secret put`), falling back to `process.env` for contexts with no Worker request in
 * scope: `react-router typegen`, `drizzle-kit`, and local node scripts. `wrangler dev` (via the
 * Cloudflare Vite plugin) loads `.dev.vars` into the Cloudflare env, not `process.env`.
 */
function read(name: keyof CloudflareEnv & string): string {
  const cf = getCloudflareEnv();
  const fromCf = cf?.[name];
  if (typeof fromCf === 'string' && fromCf.trim()) return fromCf.trim();
  return process.env[name]?.trim() || '';
}

/**
 * `wrangler dev` and unconfigured local Workers have no `ENVIRONMENT` var, so they keep the
 * localhost fallbacks below. Real deploys set `ENVIRONMENT` via wrangler.jsonc `vars`
 * (top-level = "production", `env.staging` = "staging").
 */
function isProduction(): boolean {
  const cf = getCloudflareEnv();
  if (cf) return Boolean(cf.ENVIRONMENT);
  return process.env.NODE_ENV === 'production';
}

export function env() {
  const prod = isProduction();
  return {
    authSecret: read('AUTH_SECRET') || read('SESSION_SECRET'),
    // localhost fallbacks are dev-only; production must configure these.
    baseUrl: read('BETTER_AUTH_URL') || read('BASE_URL') || (prod ? '' : 'http://localhost:5173'),
    /** Browser-facing Worker origin for docs links and marketing try-it (same origin — single Worker). */
    publicApiBaseUrl: read('PUBLIC_API_BASE_URL') || read('BASE_URL') || (prod ? '' : 'http://localhost:5173'),
    /**
     * Optional public browser key (pk_*) for the marketing try-it embed.
     * Required when the Worker has API_KEYS (or BASIC_AUTH) enabled; allowlist the portal origin.
     */
    demoBrowserKey: read('DEMO_BROWSER_API_KEY'),
    stripeSecretKey: read('STRIPE_SECRET_KEY'),
    stripeWebhookSecret: read('STRIPE_WEBHOOK_SECRET'),
    stripePriceMetered: read('STRIPE_PRICE_METERED'),
    paidCheckoutEnabled: read('PAID_CHECKOUT_ENABLED') === 'true',
    resendApiKey: read('RESEND_API_KEY'),
    emailFrom: read('EMAIL_FROM') || (prod ? '' : 'CanCoder <noreply@localhost>'),
    founderUserIds: read('FOUNDER_USER_IDS')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/**
 * Fail fast on missing production configuration. Called at server boot (workers/app.ts) when
 * running as a deployed/dev Worker; local scripts outside a request keep dev defaults.
 */
export function requireEnv() {
  const values = env();
  if (!values.authSecret) throw new Error('AUTH_SECRET (or SESSION_SECRET) is required');
  if (!values.baseUrl) throw new Error('BETTER_AUTH_URL (or BASE_URL) is required');
  if (!values.resendApiKey) throw new Error('RESEND_API_KEY is required');
  if (!values.emailFrom) throw new Error('EMAIL_FROM is required');
  return values;
}
