-- OAuth provider + JWT tables for the portal D1 (PORTAL_DB).
--
-- Mirrors @chester-hill-solutions/auth-d1's OAUTH_DDL (vendor/@chester-hill-solutions/auth-d1/
-- dist/oauth-sql.js) — kept byte-for-byte compatible, as 0001_init.sql is, so Better Auth's
-- drizzle adapter resolves the fields it expects by property name.
--
-- EIGHT tables, not the five the @better-auth/mcp documentation names. The OAuth provider declares
-- seven models (oauthClient, oauthResource, oauthClientResource, oauthRefreshToken,
-- oauthAccessToken, oauthConsent, oauthClientAssertion) and jwt(), which the MCP plugin requires,
-- adds jwks. The CHS package asserts this DDL against Better Auth's own resolved schema and against
-- a real SQLite database; see packages/auth-d1/src/oauth-sql.test.ts there.
--
-- Foreign keys are load-bearing: the cascades are what stop refresh tokens, access tokens and
-- consents outliving the user or client they belong to. They are enforced only while
-- `PRAGMA foreign_keys = ON`, which D1 sets per connection — the same caveat 0001_init.sql has.
--
-- Nothing reads these tables until the portal's auth config registers the OAuth plugins. Applying
-- them first is deliberate: the tables are inert on their own, whereas a deployment that took the
-- config change without this migration would fail on the first authorization.
--
-- Apply locally:  wrangler d1 migrations apply PORTAL_DB --local   (run from portal/)
-- Apply remote:   wrangler d1 migrations apply PORTAL_DB --remote
-- Apply staging:  wrangler d1 migrations apply PORTAL_DB --env staging --remote


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
