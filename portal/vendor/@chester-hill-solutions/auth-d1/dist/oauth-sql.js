/**
 * DDL for the OAuth provider and JWT tables.
 *
 * Generated from the same resolved schema as `oauth-schema.ts`, and asserted against a **real
 * database** by `oauth-sql.test.ts`. The DDL is the artefact a deployment provisions, so the check
 * runs against SQLite rather than against another copy of the text.
 *
 * Exported from the package root rather than from `./testing`: a consumer has to be able to
 * provision these tables, and CONVENTIONS C3 flags the opposite arrangement across four packages in
 * this repo. These are not going to be a fifth.
 *
 * Column names are snake_case and match `oauth-schema.ts`. Type affinity follows the rest of this
 * package: `text` for string, JSON and array fields, `integer` for numbers, booleans and
 * timestamps.
 *
 * Foreign keys are emitted, including their `ON DELETE` action. The first version of this file
 * omitted all twelve while the declaration carried them, which is how a schema and its DDL drift
 * apart without anything failing — the tokens and consents would simply have outlived the user or
 * client they belong to. `oauth-sql.test.ts` now reads them back with `PRAGMA foreign_key_list` and
 * compares them to Better Auth's declared references.
 */
export const OAUTH_DDL = `
CREATE TABLE IF NOT EXISTS "jwks" (
  "id" text PRIMARY KEY NOT NULL,
  "public_key" text NOT NULL,
  "private_key" text NOT NULL,
  "created_at" integer NOT NULL,
  "expires_at" integer,
  "alg" text,
  "crv" text
);

CREATE TABLE IF NOT EXISTS "oauthClient" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL UNIQUE,
  "client_secret" text,
  "client_discovery_id" text,
  "disabled" integer DEFAULT 0,
  "skip_consent" integer,
  "enable_end_session" integer,
  "subject_type" text,
  "scopes" text,
  "client_credentials_scopes" text,
  "user_id" text REFERENCES "user"("id"),
  "created_at" integer,
  "updated_at" integer,
  "name" text,
  "uri" text,
  "icon" text,
  "contacts" text,
  "tos" text,
  "policy" text,
  "software_id" text,
  "software_version" text,
  "software_statement" text,
  "redirect_uris" text NOT NULL,
  "post_logout_redirect_uris" text,
  "backchannel_logout_uri" text,
  "backchannel_logout_session_required" integer,
  "token_endpoint_auth_method" text,
  "application_type" text,
  "jwks" text,
  "jwks_uri" text,
  "grant_types" text,
  "response_types" text,
  "require_pkce" integer,
  "dpop_bound_access_tokens" integer DEFAULT 0,
  "reference_id" text,
  "metadata" text
);

CREATE TABLE IF NOT EXISTS "oauthResource" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "access_token_ttl" integer,
  "refresh_token_ttl" integer,
  "signing_algorithm" text,
  "signing_key_id" text,
  "allowed_scopes" text,
  "custom_claims" text,
  "dpop_bound_access_tokens_required" integer DEFAULT 0,
  "disabled" integer DEFAULT 0,
  "created_at" integer,
  "updated_at" integer,
  "policy_version" integer DEFAULT 1,
  "metadata" text
);

CREATE TABLE IF NOT EXISTS "oauthClientResource" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL REFERENCES "oauthClient"("client_id") ON DELETE CASCADE,
  "resource_id" text NOT NULL REFERENCES "oauthResource"("identifier") ON DELETE CASCADE,
  "metadata" text,
  "created_at" integer
);

CREATE TABLE IF NOT EXISTS "oauthRefreshToken" (
  "id" text PRIMARY KEY NOT NULL,
  "token" text NOT NULL UNIQUE,
  "client_id" text NOT NULL REFERENCES "oauthClient"("client_id"),
  "session_id" text REFERENCES "session"("id") ON DELETE SET NULL,
  "user_id" text NOT NULL REFERENCES "user"("id"),
  "reference_id" text,
  "authorization_code_id" text,
  "resources" text,
  "requested_user_info_claims" text,
  "expires_at" integer,
  "created_at" integer,
  "revoked" integer,
  "rotated_at" integer,
  "rotation_replay_response" text,
  "rotation_replay_expires_at" integer,
  "auth_time" integer,
  "confirmation" text,
  "scopes" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "oauthAccessToken" (
  "id" text PRIMARY KEY NOT NULL,
  "token" text UNIQUE,
  "client_id" text NOT NULL REFERENCES "oauthClient"("client_id"),
  "session_id" text REFERENCES "session"("id") ON DELETE SET NULL,
  "user_id" text REFERENCES "user"("id"),
  "reference_id" text,
  "authorization_code_id" text,
  "resources" text,
  "requested_user_info_claims" text,
  "refresh_id" text REFERENCES "oauthRefreshToken"("id"),
  "expires_at" integer,
  "created_at" integer,
  "revoked" integer,
  "confirmation" text,
  "scopes" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "oauthConsent" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL REFERENCES "oauthClient"("client_id"),
  "user_id" text REFERENCES "user"("id"),
  "reference_id" text,
  "resources" text,
  "requested_user_info_claims" text,
  "scopes" text NOT NULL,
  "created_at" integer,
  "updated_at" integer
);

CREATE TABLE IF NOT EXISTS "oauthClientAssertion" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" integer NOT NULL
);
`;
