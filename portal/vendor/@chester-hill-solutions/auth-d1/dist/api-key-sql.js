/** DDL for workspace_api_key (D1/SQLite). Raw keys are never stored; only SHA-256 hashes. */
export const WORKSPACE_API_KEY_DDL = `
CREATE TABLE IF NOT EXISTS "workspace_api_key" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "key_hash" text NOT NULL UNIQUE,
  "display_prefix" text NOT NULL,
  "capabilities" text NOT NULL DEFAULT '[]',
  "status" text NOT NULL DEFAULT 'active',
  "created_by_user_id" text,
  "last_used_at" integer,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "updated_at" integer NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS "workspace_api_key_workspace_idx"
  ON "workspace_api_key" ("workspace_id")
  WHERE "status" = 'active';
`;
