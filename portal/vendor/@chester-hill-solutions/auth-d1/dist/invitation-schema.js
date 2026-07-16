import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
/**
 * Email-first workspace invitation. Store only `tokenHash` (SHA-256 hex);
 * never persist the raw opaque token. FK to workspace is enforced in DDL.
 */
export const workspaceInvitations = sqliteTable("workspace_invitation", {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    email: text("email").notNull(),
    roleId: text("role_id").notNull(),
    invitedByUserId: text("invited_by_user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: text("status", {
        enum: ["pending", "accepted", "canceled", "expired", "superseded"],
    })
        .notNull()
        .default("pending"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    acceptedByUserId: text("accepted_by_user_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date())
        .$onUpdate(() => new Date()),
});
