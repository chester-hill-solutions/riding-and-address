import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export { account, accountRelations, session, sessionRelations, user, userRelations, verification, } from "./auth-schema.js";
/** Schema object for drizzleAdapter({ schema: authSchema }) */
export { authSchema } from "./auth-schema.js";
export { workspaceRoles, workspaceFeatures, workspaceFeaturePermissions, } from "./workspace-authz-schema.js";
export { workspaceInvitations, } from "./invitation-schema.js";
// ── Workspace tenancy ──────────────────────────────────────────────
export const workspaces = sqliteTable("workspace", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
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
