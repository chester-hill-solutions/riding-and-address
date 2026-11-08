// Hand-authored SQLite DDL mirroring src/schema.ts. Keep in sync when the
// schema changes (no drizzle-kit D1 dialect generation wired up for this
// package yet). Matches the D1 migrations a real deployment would run.
import { WORKSPACE_FEATURE_AUTHZ_DDL } from "../workspace-feature-sql.js";
import { WORKSPACE_MEMBER_DDL } from "../workspace-member-sql.js";
import { AUTH_DDL } from "../auth-sql.js";
import { WORKSPACE_API_KEY_DDL } from "../api-key-sql.js";
import { WORKSPACE_INVITATION_DDL } from "../invitation-sql.js";
import { OAUTH_DDL } from "../oauth-sql.js";
export const DDL = `
-- Matches the package's own declaration: id is required, name and slug are optional, and two
-- workspaces may share a slug. Asserted by auth-conformance.ts, which auth-postgres also runs.
CREATE TABLE IF NOT EXISTS "workspace" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text,
  "slug" text,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "updated_at" integer NOT NULL DEFAULT (unixepoch() * 1000)
);

${WORKSPACE_MEMBER_DDL}

-- One membership row per (workspace_id, user_id). Mirrors the Postgres DDL.
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_member_workspace_user_idx" ON "workspace_member" ("workspace_id", "user_id");

${WORKSPACE_FEATURE_AUTHZ_DDL}

${WORKSPACE_INVITATION_DDL}

${WORKSPACE_API_KEY_DDL}

${AUTH_DDL}

${OAUTH_DDL}
`;
export const SYSTEM_ROLES_SEED_DDL = `
INSERT INTO "workspace_role" ("id", "name", "workspace_id", "rank")
VALUES
  ('admin', 'admin', NULL, 2),
  ('editor', 'editor', NULL, 1),
  ('sender', 'sender', NULL, 0)
ON CONFLICT ("id") DO NOTHING;
`;
