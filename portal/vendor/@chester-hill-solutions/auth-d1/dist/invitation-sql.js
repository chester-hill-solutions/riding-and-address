/** DDL for workspace_invitation + one pending invite per workspace/email (D1/SQLite). */
export const WORKSPACE_INVITATION_DDL = `
CREATE TABLE IF NOT EXISTS "workspace_invitation" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role_id" text NOT NULL,
  "invited_by_user_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "expires_at" integer NOT NULL,
  "accepted_at" integer,
  "accepted_by_user_id" text,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "updated_at" integer NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_invitation_pending_email_idx"
  ON "workspace_invitation" ("workspace_id", "email")
  WHERE "status" = 'pending';
`;
