import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
/**
 * Workspace API key, for Cloudflare D1.
 *
 * Store only `keyHash` (SHA-256 hex of the full raw key); never persist the raw value.
 * `capabilities` is an allowlist using the same CapabilityId vocabulary as session actors, held
 * as JSON text because D1 has no array type.
 *
 * The sibling declaration is `auth-postgres/src/api-key-schema.ts`, and the two are the same
 * table in two dialects: the same columns, the same vocabulary, the same rules. Only the spelling
 * of the types differs.
 */
export const workspaceApiKeys = sqliteTable("workspace_api_key", {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    /** Short non-secret display prefix of the raw key (e.g. `chs_live_ab12cd34`). */
    displayPrefix: text("display_prefix").notNull(),
    capabilities: text("capabilities", { mode: "json" }).$type().notNull().default([]),
    status: text("status", { enum: ["active", "revoked"] })
        .notNull()
        .default("active"),
    createdByUserId: text("created_by_user_id"),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date())
        .$onUpdate(() => new Date()),
});
