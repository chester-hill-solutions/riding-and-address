/// <reference types="@cloudflare/workers-types" />

import type { Env as ApiWorkerEnv } from '../../../src/types';

/**
 * Combined Worker environment: the API worker's `Env` (R2/KV/ODA_DB/RIDING_DB/etc.) plus
 * portal-only bindings and vars. Both halves run in the same isolate (single Worker,
 * single wrangler.jsonc) — see workers/app.ts.
 */
export interface CloudflareEnv extends ApiWorkerEnv {
  /** Portal-only D1: Better Auth + workspace + billing/key-mirror tables. Never ODA_DB/RIDING_DB. */
  PORTAL_DB: D1Database;
  /** "production" | "staging" | unset. Read by env.server.ts's isProduction() for URL/email defaults. */
  ENVIRONMENT?: string;
  AUTH_SECRET?: string;
  SESSION_SECRET?: string;
  BETTER_AUTH_URL?: string;
  BASE_URL?: string;
  PUBLIC_API_BASE_URL?: string;
  DEMO_BROWSER_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_METERED?: string;
  PAID_CHECKOUT_ENABLED?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  FOUNDER_USER_IDS?: string;
}
