import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import type { AuthUser, SessionReader } from "@chester-hill-solutions/auth";
import { mergeSetCookieHeaders } from "@chester-hill-solutions/auth/cookies";
export type AuthConfig = BetterAuthOptions;
type ParsedSessionUser = {
    id: string;
    email?: string;
    name?: string | null;
    emailVerified?: boolean | null;
};
type GetSessionWithHeadersResult = {
    headers: Headers;
    response: {
        user?: ParsedSessionUser;
    } | null;
};
/** Minimal surface required for session reads (accepts any configured auth instance). */
export type AuthSessionSource = {
    api: {
        getSession: (input: {
            headers: Headers;
            returnHeaders: true;
        }) => Promise<GetSessionWithHeadersResult | unknown>;
    };
};
/** Full configured auth instance (for app-level `auth.api.*` typing). */
export type AuthInstance = ReturnType<typeof betterAuth>;
export declare function auth<const O extends BetterAuthOptions>(config: O): import("better-auth").Auth<O>;
/** Provider-specific Set-Cookie merge using Better Auth cookie parsing. */
export declare function mergeAuthSetCookieHeaders(targetHeaders: Headers, sourceHeaders: Headers): void;
/** @deprecated Use mergeAuthSetCookieHeaders */
export declare const mergeBetterAuthSetCookieHeaders: typeof mergeAuthSetCookieHeaders;
export declare function userFromSignInResponse(res: unknown): AuthUser | null;
export declare function createSessionReader(instance: AuthSessionSource): SessionReader;
export { mergeSetCookieHeaders };
export * from "./workspace-access.js";
export * from "./workspace-feature-access.js";
export * from "./invitation.js";
export * from "./product-role-seeds.js";
export { AUTH_DDL } from "./auth-sql.js";
export { WORKSPACE_MEMBER_DDL } from "./workspace-member-sql.js";
export { WORKSPACE_FEATURE_AUTHZ_DDL } from "./workspace-feature-sql.js";
export { WORKSPACE_INVITATION_DDL } from "./invitation-sql.js";
export { OAUTH_DDL } from "./oauth-sql.js";
export { user, session, account, verification, userRelations, sessionRelations, accountRelations, type AuthUserRow, type AuthUserInsert, type AuthSessionRow, } from "./auth-schema.js";
export { workspaceInvitations, type WorkspaceInvitationInsert, type WorkspaceInvitationRow, } from "./invitation-schema.js";
export * from "./api-key.js";
export { WORKSPACE_API_KEY_DDL } from "./api-key-sql.js";
export { workspaceApiKeys, type WorkspaceApiKeyInsert, type WorkspaceApiKeyRow, } from "./api-key-schema.js";
/**
 * The generic database type.
 *
 * `auth-postgres` exports this from its root, and its dialect differs — this one accepts
 * `drizzle-orm/d1` and any other SQLite driver, that one accepts Postgres. The name is the
 * same in both on purpose: it is the type a helper function is written against, so code
 * that switches providers does not have to change the type it passes.
 */
export type { DB } from "./schema.js";
