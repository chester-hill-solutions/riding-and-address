/**
 * The portal's real schema, for the API worker's tests.
 *
 * **Why the API worker needs the portal's schema at all.**
 *
 * The API worker reads two things out of the portal's database: the signing key it verifies access
 * tokens against, and the session an access token was minted for. Both are hand-written SQL against
 * tables the portal owns. A hand-written SQL statement against someone else's schema is wrong in a
 * way that nothing notices — the column is `expiresAt` and not `expires_at`, or the table was
 * renamed, and the statement throws.
 *
 * That is not a cosmetic failure here. The session-liveness query **fails closed**: a statement
 * that throws is answered "this session is not live", which refuses the token. So a query with one
 * wrong column name does not degrade the check, it **refuses every access token in the deployment**
 * and takes the paid path down — and the only trace is a warning in a log.
 *
 * **So the statements run against the portal's actual migrations**, on Node's built-in SQLite. The
 * same approach the ODA harness in `test/helpers/oda-sqlite.ts` already uses, and the same reason.
 *
 * The D1 shim is the one the ODA harness already provides, imported rather than copied: a second
 * implementation of "SQLite that pretends to be D1" would be a second thing to keep true.
 *
 * Runtime: Node's built-in `node:sqlite`. `.nvmrc` pins Node 24 and CI sets it up, for the same
 * reason the ODA harness does.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createD1Shim } from './oda-sqlite';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../portal/migrations');

/** The portal's migrations, in the order they are applied. */
const MIGRATIONS = ['0001_init.sql', '0002_oauth.sql'];

export interface PortalSchemaDb {
  /** The real schema, for inserting rows the way the portal stores them. */
  sqlite: DatabaseSync;
  /** The same database, shaped like the `PORTAL_DB` binding. */
  db: D1Database;
  close(): void;
}

/** An in-memory database with the portal's real schema applied. */
export function createPortalSchemaDb(): PortalSchemaDb {
  const sqlite = new DatabaseSync(':memory:');
  // The foreign keys are the point of using the real migrations, so they must be on.
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of MIGRATIONS) {
    sqlite.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }
  return { sqlite, db: createD1Shim(sqlite), close: () => sqlite.close() };
}
