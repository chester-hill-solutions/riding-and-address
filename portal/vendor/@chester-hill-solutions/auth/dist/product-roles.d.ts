/**
 * The role vocabulary, which the product owns.
 *
 * This module used to exist twice, as `PRODUCT_ROLE_IDS` plus a `switch` in `auth-d1` and as
 * `PRODUCT_ROLES` in `auth-postgres`. The fix had landed in one dialect and never been revisited
 * in the other, so the two siblings disagreed about who decides what roles exist. Both depend on
 * this package, so the vocabulary belongs here and each sibling re-exports it: one implementation
 * cannot drift from itself.
 *
 * ## Why the set is open
 *
 * The roles were a closed tuple, which bought one genuinely valuable thing: the
 * `_exhaustive: never` arm meant adding a role was a compile error. It also meant every product's
 * database contained the same four ids, and the first one was `caller` — a role that means
 * something in a voice product and nothing at all in a ticketing one. A product that seeds
 * `caller` is writing a lie into its own data, and every later reader of that column inherits the
 * lie.
 *
 * So the set is open and the compile-time completeness is gone. What replaces it is a runtime
 * check on the set — a hierarchy is coherent by test rather than by type — and the acknowledgement
 * that an open vocabulary means an invalid hierarchy is a seed-time failure rather than a build
 * failure.
 *
 * Authorisation needs no vocabulary of its own: it reads `roleId: string`, so the seeded matrix is
 * read back by whatever ids a product uses.
 */
/**
 * One role: its id, how it ranks, and who it may invite.
 */
export interface RoleDefinition {
    readonly id: string;
    /** Higher outranks lower. Ranks decide nothing but ordering; `invites` decides delegation. */
    readonly rank: number;
    /** Roles this one may invite. Must be strictly lower-ranked. */
    readonly invites: readonly string[];
}
/**
 * The CallCaster-shaped set, used only where a caller has not supplied its own.
 *
 * A default rather than the vocabulary, so a product that does not call this module seeds nothing
 * it did not ask for.
 */
export declare const PRODUCT_ROLES: readonly RoleDefinition[];
/** The ids of the default set, for callers written against the old constant. */
export declare const PRODUCT_ROLE_IDS: readonly string[];
/** Rank by role id, derived from the default set rather than written out beside it. */
export declare const PRODUCT_ROLE_RANKS: Record<string, number>;
/** The default set's type, for a caller that wants a compile-time vocabulary. */
export type ProductRoleId = (typeof PRODUCT_ROLES)[number]['id'];
/**
 * The roles a member holding `fromRole` may invite.
 *
 * Read from the definition rather than switched on, so a product's own hierarchy is honoured. A
 * role absent from the set invites nobody, which is the safe direction: an unknown role grants no
 * delegation rather than escalating.
 *
 * @param fromRole the role the actor holds
 * @param roles the product's role set
 */
export declare function invitationalRolesFor(fromRole: string, roles?: readonly RoleDefinition[]): string[];
/**
 * Fail on a hierarchy that cannot work.
 *
 * A role that invites one of equal or higher rank is a delegation loop or an escalation, and a
 * closed tuple could no longer catch it once the set is open. This is a seed-time failure on
 * purpose: a bad hierarchy should stop the deploy that introduced it, not surface as an
 * invitation that silently grants more than it should.
 *
 * @param roles the set to check
 * @throws Error naming the role and the invitee, when the set is incoherent
 */
export declare function assertProductRoles(roles: readonly RoleDefinition[]): void;
/**
 * A row of the capability matrix: what one role is allowed.
 *
 * `roleId` is a plain string rather than the default set's type, because a product seeds roles the
 * default set has never heard of. That is the whole reason the set is open.
 */
export type RoleCapabilitySeed = {
    roleId: string;
    capabilityIds: readonly string[];
};
/** The default set, as a map from id to rank. */
export declare function productRoleRanks(roles?: readonly RoleDefinition[]): Map<string, number>;
