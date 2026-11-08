import { and, eq } from "drizzle-orm";
import { workspaceMembers, workspaceRoles, workspaces } from "./schema.js";
export const ROLE_HIERARCHY = {
    sender: 0,
    editor: 1,
    admin: 2,
};
export function hasMinRole(userRole, requiredRole) {
    const userRank = ROLE_HIERARCHY[userRole] ?? -1;
    const requiredRank = ROLE_HIERARCHY[requiredRole] ?? Number.MAX_SAFE_INTEGER;
    return userRank >= requiredRank;
}
export async function getWorkspaceMemberRoleId(db, params) {
    const rows = await db
        .select({ roleId: workspaceMembers.roleId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, params.workspaceId), eq(workspaceMembers.userId, params.userId)))
        .limit(2);
    // One membership row per (workspace_id, user_id) is the invariant, and the unique index
    // enforces it. A database that has not been migrated can still hold two rows for the same
    // principal, and picking one of them would make the effective role a function of row order
    // rather than of the data — so deny instead of guessing.
    if (rows.length !== 1)
        return null;
    return rows[0].roleId;
}
/** @deprecated Use getWorkspaceMemberRoleId — returns role_id (same as role id for system roles). */
export async function getWorkspaceMemberRole(db, params) {
    return getWorkspaceMemberRoleId(db, params);
}
export function createRequireWorkspaceRole(requiredRole) {
    return async (db, params) => {
        const roleId = await getWorkspaceMemberRoleId(db, params);
        if (!roleId) {
            throw new Error("Not a member of this workspace");
        }
        if (!hasMinRole(roleId, requiredRole)) {
            throw new Error(`Requires ${requiredRole} role or higher`);
        }
    };
}
export async function getWorkspacesForUser(db, userId) {
    return db
        .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        roleId: workspaceMembers.roleId,
        role: workspaceRoles.name,
    })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
        .leftJoin(workspaceRoles, eq(workspaceMembers.roleId, workspaceRoles.id))
        .where(eq(workspaceMembers.userId, userId));
}
