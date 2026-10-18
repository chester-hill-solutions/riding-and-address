import { asCapabilityId, assertProductRoles, PRODUCT_ROLES, } from '@chester-hill-solutions/auth';
import { workspaceFeaturePermissions, workspaceFeatures, workspaceRoles, } from './workspace-authz-schema.js';
// Re-exported so a consumer importing from `auth-d1` keeps the surface it had, and gets the one
// implementation rather than a second copy.
export { assertProductRoles, invitationalRolesFor, PRODUCT_ROLES, PRODUCT_ROLE_IDS, PRODUCT_ROLE_RANKS, productRoleRanks, } from '@chester-hill-solutions/auth';
/**
 * Upsert global (`workspace_id` null) roles, features and allow permissions.
 *
 * @param db the dialect's database
 * @param matrix what each role is allowed
 * @param roles the product's own role set. Defaults to `PRODUCT_ROLES` for a caller that has not
 *   declared one, which is the only reason that set exists
 * @throws Error when the hierarchy is incoherent, before any row is written
 */
export async function seedProductRoleCapabilityMatrix(db, matrix, roles = PRODUCT_ROLES) {
    // Checked before the first insert, so a bad hierarchy stops the deploy rather than leaving a
    // half-seeded set behind.
    assertProductRoles(roles);
    const now = new Date();
    const allCapabilities = [
        ...new Set(matrix.flatMap((row) => row.capabilityIds.map((id) => String(id)))),
    ];
    // Every role the product declared is seeded, including one with no capabilities: that is a
    // legitimate thing to define, and creating it by accident is not.
    for (const role of roles) {
        await db
            .insert(workspaceRoles)
            .values({
            id: role.id,
            name: role.id,
            workspaceId: null,
            rank: role.rank,
            createdAt: now,
        })
            .onConflictDoNothing();
    }
    for (const capabilityId of allCapabilities) {
        await db
            .insert(workspaceFeatures)
            .values({
            id: capabilityId,
            name: capabilityId,
            description: null,
            workspaceId: null,
            createdAt: now,
        })
            .onConflictDoNothing();
    }
    for (const row of matrix) {
        for (const capabilityId of row.capabilityIds) {
            await db
                .insert(workspaceFeaturePermissions)
                .values({
                id: `${row.roleId}:${capabilityId}`,
                workspaceId: null,
                roleId: row.roleId,
                featureId: capabilityId,
                allowed: true,
                createdAt: now,
            })
                .onConflictDoNothing();
        }
    }
}
export function capabilitySetFromIds(ids) {
    return new Set(ids.map((id) => asCapabilityId(id)));
}
