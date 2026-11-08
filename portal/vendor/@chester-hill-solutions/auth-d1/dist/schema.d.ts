import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
export { account, accountRelations, session, sessionRelations, user, userRelations, verification, } from "./auth-schema.js";
export type { AuthAccountInsert, AuthAccountRow, AuthSessionInsert, AuthSessionRow, AuthUserInsert, AuthUserRow, AuthVerificationInsert, AuthVerificationRow, } from "./auth-schema.js";
/** Schema object for drizzleAdapter({ schema: authSchema }) */
export { authSchema } from "./auth-schema.js";
export { jwks, oauthAccessToken, oauthClient, oauthClientAssertion, oauthClientResource, oauthConsent, oauthRefreshToken, oauthResource, oauthSchema, type OAuthAccessTokenRow, type OAuthClientRow, type OAuthConsentRow, type OAuthJwksRow, type OAuthRefreshTokenRow, type OAuthResourceRow, } from "./oauth-schema.js";
export { workspaceRoles, workspaceFeatures, workspaceFeaturePermissions, type WorkspaceRoleRow, type WorkspaceFeatureRow, type WorkspaceFeaturePermissionRow, } from "./workspace-authz-schema.js";
export { workspaceApiKeys, type WorkspaceApiKeyInsert, type WorkspaceApiKeyRow, } from "./api-key-schema.js";
export { workspaceInvitations, type WorkspaceInvitationInsert, type WorkspaceInvitationRow, } from "./invitation-schema.js";
/**
 * The workspace table.
 *
 * `id` is the only column this package requires, because the consumer owns its tenancy. `name` and
 * `slug` are therefore optional, and `slug` is **not** unique: two workspaces may share one.
 *
 * This used to declare `name` and `slug` as `notNull` and `slug` as `unique`, which the Postgres
 * sibling did not, so the two dialects disagreed and a `schema.test.ts` case defended the duplicate
 * rejection. The uniqueness was the sharper half of the error: it promised something the package
 * does not guarantee, and a product whose consumer owns tenancy cannot rely on it.
 *
 * `auth-conformance.ts` in this package's shared testing entry point asserts all of it, and
 * `auth-postgres` runs the same runner.
 */
export declare const workspaces: import("drizzle-orm/sqlite-core").SQLiteTableWithColumns<{
    name: "workspace";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/sqlite-core").SQLiteColumn<{
            name: "id";
            tableName: "workspace";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            length: number | undefined;
        }>;
        name: import("drizzle-orm/sqlite-core").SQLiteColumn<{
            name: "name";
            tableName: "workspace";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            length: number | undefined;
        }>;
        slug: import("drizzle-orm/sqlite-core").SQLiteColumn<{
            name: "slug";
            tableName: "workspace";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            length: number | undefined;
        }>;
        createdAt: import("drizzle-orm/sqlite-core").SQLiteColumn<{
            name: "created_at";
            tableName: "workspace";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: true;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/sqlite-core").SQLiteColumn<{
            name: "updated_at";
            tableName: "workspace";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: true;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "sqlite";
}>;
export declare const workspaceMembers: import("drizzle-orm/sqlite-core").SQLiteTableWithColumns<{
    name: "workspace_member";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/sqlite-core").SQLiteColumn<{
            name: "id";
            tableName: "workspace_member";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            length: number | undefined;
        }>;
        workspaceId: import("drizzle-orm/sqlite-core").SQLiteColumn<{
            name: "workspace_id";
            tableName: "workspace_member";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            length: number | undefined;
        }>;
        userId: import("drizzle-orm/sqlite-core").SQLiteColumn<{
            name: "user_id";
            tableName: "workspace_member";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            length: number | undefined;
        }>;
        roleId: import("drizzle-orm/sqlite-core").SQLiteColumn<{
            name: "role_id";
            tableName: "workspace_member";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            length: number | undefined;
        }>;
        invitedBy: import("drizzle-orm/sqlite-core").SQLiteColumn<{
            name: "invited_by";
            tableName: "workspace_member";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            length: number | undefined;
        }>;
        createdAt: import("drizzle-orm/sqlite-core").SQLiteColumn<{
            name: "created_at";
            tableName: "workspace_member";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: true;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "sqlite";
}>;
/**
 * Accepts both `drizzle-orm/d1` (Cloudflare D1, async) and any other SQLite
 * driver used for local dev/tests (e.g. `drizzle-orm/bun-sqlite`, sync).
 */
export type DB = BaseSQLiteDatabase<any, any, any, any>;
