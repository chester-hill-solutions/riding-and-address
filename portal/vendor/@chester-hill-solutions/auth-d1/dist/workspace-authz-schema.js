import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
/** System or workspace-scoped role. `workspace_id` null = global template role. */
export const workspaceRoles = sqliteTable("workspace_role", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    workspaceId: text("workspace_id"),
    rank: integer("rank").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
}, (table) => [uniqueIndex("workspace_role_workspace_name_idx").on(table.workspaceId, table.name)]);
/** Feature gate identifier (e.g. `app.billing`). `workspace_id` null = global feature. */
export const workspaceFeatures = sqliteTable("workspace_feature", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    workspaceId: text("workspace_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
}, (table) => [
    uniqueIndex("workspace_feature_workspace_name_idx").on(table.workspaceId, table.name),
]);
/** Deny-by-default permission matrix. `workspace_id` null = global default for all workspaces. */
export const workspaceFeaturePermissions = sqliteTable("workspace_feature_permission", {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    roleId: text("role_id")
        .notNull()
        .references(() => workspaceRoles.id, { onDelete: "cascade" }),
    featureId: text("feature_id")
        .notNull()
        .references(() => workspaceFeatures.id, { onDelete: "cascade" }),
    allowed: integer("allowed", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
}, (table) => [
    uniqueIndex("workspace_feature_permission_scope_idx").on(table.workspaceId, table.roleId, table.featureId),
]);
