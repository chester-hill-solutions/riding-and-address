import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runWithCloudflareContext } from '~/lib/cloudflare-context.server';
import type { CloudflareEnv } from '~/lib/cloudflare-env';

/**
 * The portal's database, for tests.
 *
 * **The real migrations, on Node's built-in SQLite.**
 *
 * The portal's tables are Better Auth's and the workspace system's, and they carry foreign keys —
 * `oauthAccessToken.session_id` references `session(id)` with `ON DELETE SET NULL`, and the
 * workspace tables reference `user(id)`. A hand-written fake of those tables would not have the
 * constraints, so a test against it would not be testing the schema the portal actually runs on.
 *
 * This applies `portal/migrations/*.sql` verbatim to an in-memory database, so a test gets the
 * real tables, the real foreign keys and the real defaults. It is the same approach the ODA
 * harness in `test/helpers/oda-sqlite.ts` already uses, for the same reason.
 *
 * Runtime: Node's `node:sqlite`, which is experimental on Node 22 behind a flag. `.nvmrc` pins
 * Node 24 and CI sets it up, for the same reason the ODA harness does.
 */

const MIGRATIONS_DIR = path.resolve(fileURLToPath(new URL('../../migrations', import.meta.url)));

/** Values `node:sqlite` accepts as bound parameters. */
type SqlValue = string | number | bigint | null;

/** The slice of D1 the portal reads. Cast to `D1Database` at the boundary. */
interface D1ShimStatement {
  bind(...params: SqlValue[]): D1ShimStatement;
  /** D1's two shapes: the whole row, or one column of it. */
  first<T = unknown>(columnName: string): Promise<T | null>;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: Record<string, unknown> }>;
  run(): Promise<{ success: boolean; meta: Record<string, unknown> }>;
}

export function createD1Shim(sqlite: DatabaseSync): D1Database {
  function statement(sql: string, params: SqlValue[]): D1ShimStatement {
    const all = async <T = unknown>() => {
      const results = sqlite.prepare(sql).all(...params);
      return { results: results as T[], success: true, meta: {} };
    };

    const first = async (columnName?: string) => {
      const row = sqlite.prepare(sql).get(...params) ?? null;
      if (columnName === undefined) return row;
      if (!row || typeof row !== 'object') return null;
      return (row as Record<string, unknown>)[columnName] ?? null;
    };

    const run = async () => {
      sqlite.prepare(sql).run(...params);
      return { success: true, meta: {} };
    };

    return {
      bind: (...bound: SqlValue[]) => statement(sql, bound),
      all,
      first: first as D1ShimStatement['first'],
      run,
    };
  }

  return {
    prepare: (sql: string): D1ShimStatement => statement(sql, []),
    batch: async (): Promise<unknown[]> => [],
    exec: async (sql: string): Promise<{ count: number; duration: number }> => {
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
  } as unknown as D1Database;
}

export interface PortalDb {
  sqlite: DatabaseSync;
  db: D1Database;
  close(): void;
}

/** An in-memory portal database with the real schema applied. */
export function createPortalDb(): PortalDb {
  const sqlite = new DatabaseSync(':memory:');
  // The foreign keys are the point of using the real migrations, so they must be on.
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of ['0001_init.sql', '0002_oauth.sql']) {
    sqlite.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }
  return { sqlite, db: createD1Shim(sqlite), close: () => sqlite.close() };
}

/**
 * Run a function inside a Cloudflare request context.
 *
 * The portal's server code reaches its bindings through `requireCloudflareEnv()`, which reads an
 * `AsyncLocalStorage` set per request by the Worker entry point. A test that does not establish
 * that context cannot call `getDb()` at all — which is why the portal had no route tests.
 */
export function withPortalEnv<T>(env: Partial<CloudflareEnv>, fn: () => T): T {
  const ctx = {
    waitUntil: () => {},
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext;
  return runWithCloudflareContext({ env: env as CloudflareEnv, ctx }, fn);
}

/** The environment a portal test needs: the database, and the vars the code reads. */
export function portalTestEnv(
  portalDb: PortalDb,
  overrides: Partial<CloudflareEnv> = {}
): CloudflareEnv {
  return {
    PORTAL_DB: portalDb.db,
    ENVIRONMENT: 'test',
    AUTH_SECRET: 'a-test-auth-secret-that-is-long-enough-for-hmac',
    BASE_URL: 'http://localhost:5173',
    PUBLIC_API_BASE_URL: 'http://localhost:5173',
    AUTH_TRUSTED_ORIGINS: 'http://localhost:5173',
    ...overrides,
  } as CloudflareEnv;
}
