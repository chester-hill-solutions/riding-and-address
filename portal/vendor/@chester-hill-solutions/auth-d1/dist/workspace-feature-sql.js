/**
 * D1/SQLite DDL for the workspace role/feature/permission authz tables.
 *
 * Unlike Postgres, SQLite has no `CREATE FUNCTION` — there is no
 * `check_workspace_feature_permission` RPC here. Permission checks run as a
 * portable Drizzle query instead (see `workspace-feature-access.ts`).
 */
export const WORKSPACE_FEATURE_AUTHZ_DDL = `
CREATE TABLE IF NOT EXISTS "workspace_role" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "workspace_id" text REFERENCES "workspace"("id") ON DELETE CASCADE,
  "rank" integer NOT NULL DEFAULT 0,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_role_workspace_name_idx"
  ON "workspace_role" ("workspace_id", "name");

CREATE TABLE IF NOT EXISTS "workspace_feature" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "workspace_id" text REFERENCES "workspace"("id") ON DELETE CASCADE,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_feature_workspace_name_idx"
  ON "workspace_feature" ("workspace_id", "name");

CREATE TABLE IF NOT EXISTS "workspace_feature_permission" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text REFERENCES "workspace"("id") ON DELETE CASCADE,
  "role_id" text NOT NULL REFERENCES "workspace_role"("id") ON DELETE CASCADE,
  "feature_id" text NOT NULL REFERENCES "workspace_feature"("id") ON DELETE CASCADE,
  "allowed" integer NOT NULL DEFAULT 0,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_feature_permission_scope_idx"
  ON "workspace_feature_permission" ("workspace_id", "role_id", "feature_id");
`;
