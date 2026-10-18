/**
 * Seed the global roles, features and allowed permissions for a product's capability matrix.
 *
 * The role vocabulary itself lives in `@chester-hill-solutions/auth` and is re-exported here, so
 * `auth-d1` and `auth-postgres` cannot disagree about who decides what roles exist. This file used
 * to hold a closed `PRODUCT_ROLE_IDS` tuple, a hand-written `PRODUCT_ROLE_RANKS` map and a `switch`
 * in `invitationalRolesFor`, while `auth-postgres` already read the product's definitions. The fix
 * had landed in one sibling and never been revisited in the other.
 */
import type { CapabilityId } from '@chester-hill-solutions/auth';
import { type RoleCapabilitySeed, type RoleDefinition } from '@chester-hill-solutions/auth';
import type { DB } from './schema.js';
export { assertProductRoles, invitationalRolesFor, PRODUCT_ROLES, PRODUCT_ROLE_IDS, PRODUCT_ROLE_RANKS, productRoleRanks, type ProductRoleId, type RoleCapabilitySeed, type RoleDefinition, } from '@chester-hill-solutions/auth';
/**
 * Upsert global (`workspace_id` null) roles, features and allow permissions.
 *
 * @param db the dialect's database
 * @param matrix what each role is allowed
 * @param roles the product's own role set. Defaults to `PRODUCT_ROLES` for a caller that has not
 *   declared one, which is the only reason that set exists
 * @throws Error when the hierarchy is incoherent, before any row is written
 */
export declare function seedProductRoleCapabilityMatrix(db: DB, matrix: readonly RoleCapabilitySeed[], roles?: readonly RoleDefinition[]): Promise<void>;
export declare function capabilitySetFromIds(ids: readonly string[]): ReadonlySet<CapabilityId>;
