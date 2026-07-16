-- Portal D1 (PORTAL_DB) initial schema.
-- Auth + workspace tables mirror @chester-hill-solutions/auth-d1's DDL (see vendor/@chester-hill-solutions/auth-d1/dist/testing/sql.js,
-- workspace-feature-sql.js, invitation-sql.js) — kept byte-for-byte compatible so the CHS package's
-- helpers (createInvitation, checkWorkspaceFeaturePermission, etc.) work against this database.
-- customer_billing / api_key_mirror are CanCoder-portal-only additions (see app/db/schema.ts).
--
-- Apply locally:  wrangler d1 migrations apply PORTAL_DB --local   (run from portal/)
-- Apply remote:   wrangler d1 migrations apply PORTAL_DB --remote
-- Apply staging:  wrangler d1 migrations apply PORTAL_DB --env staging --remote

CREATE TABLE IF NOT EXISTS "workspace" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "updated_at" integer NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS "workspace_member" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "role_id" text NOT NULL,
  "invited_by" text,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000)
);

-- workspace_role / workspace_feature / workspace_feature_permission (deny-by-default authz matrix).
-- Not queried by the portal app today (roleId on workspace_member is a plain string), but kept so
-- the CHS package's exported helpers (checkWorkspaceFeaturePermission, seedProductRoleCapabilityMatrix)
-- work if/when the portal adopts them.
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

-- Email-first workspace invitation. Stores only tokenHash (SHA-256 hex); raw token is one-time.
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

-- Better Auth core tables (email/password only — see auth.server.ts emailAndPassword.enabled).
CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "email_verified" integer NOT NULL DEFAULT 0,
  "image" text,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "updated_at" integer NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" integer NOT NULL,
  "token" text NOT NULL UNIQUE,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "updated_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("user_id");

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" integer,
  "refresh_token_expires_at" integer,
  "scope" text,
  "password" text,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "updated_at" integer NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("user_id");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" integer NOT NULL,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "updated_at" integer NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

-- CanCoder portal additions (app/db/schema.ts) — not part of the CHS auth-d1 package.
CREATE TABLE IF NOT EXISTS "customer_billing" (
  "workspace_id" text PRIMARY KEY NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "customer_id" text NOT NULL UNIQUE,
  "plan" text NOT NULL DEFAULT 'free',
  "fuse_limit" integer NOT NULL DEFAULT 1000,
  "fuse_soft_warn" integer NOT NULL DEFAULT 0,
  "batch_enabled" integer NOT NULL DEFAULT 0,
  "stripe_customer_id" text,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "updated_at" integer NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS "api_key_mirror" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "customer_id" text NOT NULL,
  "kind" text NOT NULL,
  "label" text,
  "origins" text,
  "disabled" integer NOT NULL DEFAULT 0,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS "api_key_mirror_workspace_idx" ON "api_key_mirror" ("workspace_id");
