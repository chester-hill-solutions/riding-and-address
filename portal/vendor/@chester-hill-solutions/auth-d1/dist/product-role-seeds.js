import { asCapabilityId, assertProductRoles, PRODUCT_ROLES, } from '@chester-hill-solutions/auth';
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import { workspaceFeaturePermissions, workspaceFeatures, workspaceRoles, } from './workspace-authz-schema.js';
// Re-exported so a consumer importing from `auth-d1` keeps the surface it had, and gets the one
// implementation rather than a second copy.
export { assertProductRoles, invitationalRolesFor, PRODUCT_ROLES, PRODUCT_ROLE_IDS, PRODUCT_ROLE_RANKS, productRoleRanks, } from '@chester-hill-solutions/auth';
/**
 * The capabilities the matrix grants each role.
 *
 * A role may appear in more than one row of the matrix, so the sets are merged rather than
 * overwritten.
 */
function grantedCapabilities(matrix) {
    const granted = new Map();
    for (const row of matrix) {
        const capabilities = granted.get(row.roleId) ?? new Set();
        for (const capabilityId of row.capabilityIds)
            capabilities.add(String(capabilityId));
        granted.set(row.roleId, capabilities);
    }
    return granted;
}
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
    // A capability that has left a role's matrix has to stop being granted. Without this the
    // permission table only ever grows with respect to the matrix, and the row left behind keeps
    // admitting the role that lost the capability — in every workspace, because a seeded row is
    // global. The withdrawal is per role: a capability that moved from one role to another has to
    // leave the role that lost it while staying with the role that gained it.
    const granted = grantedCapabilities(matrix);
    // The roles the seed owns: the ones the matrix grants capabilities to, and the ones the
    // product declared. A matrix may name a role the product's role set does not contain, and
    // that role's rows are the seed's to reconcile too.
    const managedRoles = new Set([...granted.keys(), ...roles.map((role) => role.id)]);
    for (const roleId of managedRoles) {
        const capabilities = granted.get(roleId);
        const conditions = [
            isNull(workspaceFeaturePermissions.workspaceId),
            eq(workspaceFeaturePermissions.roleId, roleId),
        ];
        // `notInArray` with an empty list is not portable, so a role the matrix grants nothing
        // withdraws everything rather than nothing.
        if (capabilities && capabilities.size > 0) {
            conditions.push(notInArray(workspaceFeaturePermissions.featureId, [...capabilities]));
        }
        // The two scope conditions are always present, so this is never an unfiltered delete.
        await db.delete(workspaceFeaturePermissions).where(and(...conditions));
    }
}
export function capabilitySetFromIds(ids) {
    return new Set(ids.map((id) => asCapabilityId(id)));
}
