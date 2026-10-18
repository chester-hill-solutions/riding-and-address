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
 * The CallCaster-shaped set, used only where a caller has not supplied its own.
 *
 * A default rather than the vocabulary, so a product that does not call this module seeds nothing
 * it did not ask for.
 */
export const PRODUCT_ROLES = [
    { id: 'owner', rank: 3, invites: ['admin', 'member', 'caller'] },
    { id: 'admin', rank: 2, invites: ['member', 'caller'] },
    { id: 'member', rank: 1, invites: ['caller'] },
    { id: 'caller', rank: 0, invites: [] },
];
/** The ids of the default set, for callers written against the old constant. */
export const PRODUCT_ROLE_IDS = PRODUCT_ROLES.map((role) => role.id);
/** Rank by role id, derived from the default set rather than written out beside it. */
export const PRODUCT_ROLE_RANKS = Object.fromEntries(PRODUCT_ROLES.map((role) => [role.id, role.rank]));
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
export function invitationalRolesFor(fromRole, roles = PRODUCT_ROLES) {
    const role = roles.find((candidate) => candidate.id === fromRole);
    if (!role)
        return [];
    return [...role.invites];
}
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
export function assertProductRoles(roles) {
    const rankOf = new Map(roles.map((role) => [role.id, role.rank]));
    const duplicate = roles.find((role, index) => roles.findIndex((r) => r.id === role.id) !== index);
    if (duplicate) {
        throw new Error(`role ${duplicate.id} appears more than once in the set`);
    }
    for (const role of roles) {
        for (const invitee of role.invites) {
            const rank = rankOf.get(invitee);
            if (rank === undefined) {
                throw new Error(`role ${role.id} invites ${invitee}, which is not in the set`);
            }
            if (rank >= role.rank) {
                throw new Error(`role ${role.id} (rank ${role.rank}) invites ${invitee} (rank ${rank}); invitations must be strictly subordinate`);
            }
        }
    }
}
/** The default set, as a map from id to rank. */
export function productRoleRanks(roles = PRODUCT_ROLES) {
    return new Map(roles.map((role) => [role.id, role.rank]));
}
