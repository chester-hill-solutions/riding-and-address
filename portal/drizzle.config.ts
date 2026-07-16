import { defineConfig } from 'drizzle-kit';

/**
 * `drizzle-kit generate` only (schema diff, no live connection needed) — the applied migrations
 * are hand-authored/wrangler-native under `migrations/` (see migrations/0001_init.sql and
 * `wrangler d1 migrations apply PORTAL_DB`). Port any future `drizzle/` diff into a new
 * `migrations/000N_*.sql` file rather than running `drizzle-kit migrate` against D1 directly.
 */
export default defineConfig({
  schema: './app/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
});
