import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export { account, accountRelations, session, sessionRelations, user, userRelations, verification, } from "./auth-schema.js";
/** Schema object for drizzleAdapter({ schema: authSchema }) */
export { authSchema } from "./auth-schema.js";
// The OAuth provider and JWT tables. Generated from Better Auth's resolved schema rather than
// transcribed, and held to it by oauth-schema.test.ts — a missing or mistyped column otherwise
// fails during an authorization rather than at build time.
export { jwks, oauthAccessToken, oauthClient, oauthClientAssertion, oauthClientResource, oauthConsent, oauthRefreshToken, oauthResource, oauthSchema, } from "./oauth-schema.js";
export { workspaceRoles, workspaceFeatures, workspaceFeaturePermissions, } from "./workspace-authz-schema.js";
export { workspaceInvitations, } from "./invitation-schema.js";
// ── Workspace tenancy ──────────────────────────────────────────────
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
export const workspaces = sqliteTable("workspace", {
    id: text("id").primaryKey(),
    name: text("name"),
    slug: text("slug"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
});
export const workspaceMembers = sqliteTable("workspace_member", {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    roleId: text("role_id").notNull(),
    invitedBy: text("invited_by"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
});
