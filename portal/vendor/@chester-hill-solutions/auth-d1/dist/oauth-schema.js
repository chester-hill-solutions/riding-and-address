/**
 * The OAuth provider and JWT tables, as drizzle declarations.
 *
 * Eight tables, not the five Better Auth's `@better-auth/mcp` documentation names. The package
 * declares seven OAuth models — oauthClient, oauthResource, oauthClientResource, oauthRefreshToken,
 * oauthAccessToken, oauthConsent, oauthClientAssertion — and the `jwt()` plugin, which the MCP
 * plugin requires, adds `jwks`. The docs are incomplete; the code is the source of truth.
 *
 * These are generated from Better Auth's own resolved schema (`auth.$context.tables`) rather than
 * transcribed, because a wrong or missing column fails at request time, not at compile time.
 * `oauth-schema.test.ts` re-derives the resolved schema and asserts these declarations still match
 * it, so a mismatch fails a test instead.
 *
 * Conventions follow `auth-schema.ts`: dates are `timestamp_ms`, booleans are
 * `integer({ mode: "boolean" })`, and `json` / `string[]` are `text({ mode: "json" })`. Property
 * names are Better Auth's field names — the drizzle adapter resolves fields by property name, so
 * these are load-bearing. Column names are snake_case and cosmetic.
 *
 * Deliberately absent: `defaultValue` for `json` and `string[]` fields. Better Auth writes those
 * itself, and a text column defaulting to an array literal is a dialect trap rather than a help.
 */
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { session, user } from "./auth-schema.js";
export const jwks = sqliteTable("jwks", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    publicKey: text("public_key").notNull(),
    privateKey: text("private_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    alg: text("alg"),
    crv: text("crv"),
});
export const oauthClient = sqliteTable("oauthClient", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: integer("disabled", { mode: "boolean" }).default(false),
    skipConsent: integer("skip_consent", { mode: "boolean" }),
    enableEndSession: integer("enable_end_session", { mode: "boolean" }),
    subjectType: text("subject_type"),
    scopes: text("scopes", { mode: "json" }).$type(),
    clientCredentialsScopes: text("client_credentials_scopes", { mode: "json" }).$type(),
    userId: text("user_id").references(() => user.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts", { mode: "json" }).$type(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris", { mode: "json" }).$type().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris", { mode: "json" }).$type(),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: integer("backchannel_logout_session_required", { mode: "boolean" }),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types", { mode: "json" }).$type(),
    responseTypes: text("response_types", { mode: "json" }).$type(),
    requirePKCE: integer("require_pkce", { mode: "boolean" }),
    dpopBoundAccessTokens: integer("dpop_bound_access_tokens", { mode: "boolean" }).default(false),
    referenceId: text("reference_id"),
    metadata: text("metadata", { mode: "json" }),
}, (table) => [
    index("oauthClient_user_id_idx").on(table.userId),
]);
export const oauthResource = sqliteTable("oauthResource", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    identifier: text("identifier").notNull().unique(),
    name: text("name").notNull(),
    accessTokenTtl: integer("access_token_ttl"),
    refreshTokenTtl: integer("refresh_token_ttl"),
    signingAlgorithm: text("signing_algorithm"),
    signingKeyId: text("signing_key_id"),
    allowedScopes: text("allowed_scopes", { mode: "json" }).$type(),
    customClaims: text("custom_claims", { mode: "json" }),
    dpopBoundAccessTokensRequired: integer("dpop_bound_access_tokens_required", { mode: "boolean" }).default(false),
    disabled: integer("disabled", { mode: "boolean" }).default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
    policyVersion: integer("policy_version").default(1),
    metadata: text("metadata", { mode: "json" }),
});
export const oauthClientResource = sqliteTable("oauthClientResource", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    clientId: text("client_id").references(() => oauthClient.clientId, { onDelete: "cascade" }).notNull(),
    resourceId: text("resource_id").references(() => oauthResource.identifier, { onDelete: "cascade" }).notNull(),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
}, (table) => [
    index("oauthClientResource_client_id_idx").on(table.clientId),
    index("oauthClientResource_resource_id_idx").on(table.resourceId),
    uniqueIndex("oauthClientResource_client_id_resource_id_idx").on(table.clientId, table.resourceId),
]);
export const oauthRefreshToken = sqliteTable("oauthRefreshToken", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    token: text("token").notNull().unique(),
    clientId: text("client_id").references(() => oauthClient.clientId).notNull(),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id).notNull(),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources", { mode: "json" }).$type(),
    requestedUserInfoClaims: text("requested_user_info_claims", { mode: "json" }).$type(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    revoked: integer("revoked", { mode: "timestamp_ms" }),
    rotatedAt: integer("rotated_at", { mode: "timestamp_ms" }),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: integer("rotation_replay_expires_at", { mode: "timestamp_ms" }),
    authTime: integer("auth_time", { mode: "timestamp_ms" }),
    confirmation: text("confirmation", { mode: "json" }),
    scopes: text("scopes", { mode: "json" }).$type().notNull(),
}, (table) => [
    index("oauthRefreshToken_client_id_idx").on(table.clientId),
    index("oauthRefreshToken_session_id_idx").on(table.sessionId),
    index("oauthRefreshToken_user_id_idx").on(table.userId),
    index("oauthRefreshToken_authorization_code_id_idx").on(table.authorizationCodeId),
]);
export const oauthAccessToken = sqliteTable("oauthAccessToken", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    token: text("token").unique(),
    clientId: text("client_id").references(() => oauthClient.clientId).notNull(),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources", { mode: "json" }).$type(),
    requestedUserInfoClaims: text("requested_user_info_claims", { mode: "json" }).$type(),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    revoked: integer("revoked", { mode: "timestamp_ms" }),
    confirmation: text("confirmation", { mode: "json" }),
    scopes: text("scopes", { mode: "json" }).$type().notNull(),
}, (table) => [
    index("oauthAccessToken_client_id_idx").on(table.clientId),
    index("oauthAccessToken_session_id_idx").on(table.sessionId),
    index("oauthAccessToken_user_id_idx").on(table.userId),
    index("oauthAccessToken_authorization_code_id_idx").on(table.authorizationCodeId),
    index("oauthAccessToken_refresh_id_idx").on(table.refreshId),
]);
export const oauthConsent = sqliteTable("oauthConsent", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    clientId: text("client_id").references(() => oauthClient.clientId).notNull(),
    userId: text("user_id").references(() => user.id),
    referenceId: text("reference_id"),
    resources: text("resources", { mode: "json" }).$type(),
    requestedUserInfoClaims: text("requested_user_info_claims", { mode: "json" }).$type(),
    scopes: text("scopes", { mode: "json" }).$type().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
}, (table) => [
    index("oauthConsent_client_id_idx").on(table.clientId),
    index("oauthConsent_user_id_idx").on(table.userId),
]);
export const oauthClientAssertion = sqliteTable("oauthClientAssertion", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});
/** The OAuth models, keyed by the name Better Auth resolves them under. */
export const oauthSchema = {
    jwks,
    oauthClient,
    oauthResource,
    oauthClientResource,
    oauthRefreshToken,
    oauthAccessToken,
    oauthConsent,
    oauthClientAssertion,
};
