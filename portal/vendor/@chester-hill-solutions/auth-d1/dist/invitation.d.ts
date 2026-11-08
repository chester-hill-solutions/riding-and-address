import { type RoleDefinition } from "@chester-hill-solutions/auth";
import type { DB } from "./schema.js";
import { workspaceInvitations, type WorkspaceInvitationRow } from "./invitation-schema.js";
/**
 * The delegation rule an invitation is checked against.
 *
 * The role vocabulary the product owns is the rule: `RoleDefinition.invites` says which roles
 * a member holding a role may invite, and `invitationalRolesFor` reads that list. The set is
 * not written onto the invitation, so a product that declared its own set passes it here and
 * the check is that set's `invites` list, exactly.
 */
export type InvitationDelegationOptions = {
    /** The exact product vocabulary used by seedProductRoleCapabilityMatrix. */
    roles: readonly RoleDefinition[];
};
export type CreateInvitationInput = {
    id: string;
    workspaceId: string;
    email: string;
    roleId: string;
    invitedByUserId: string;
    /** Absolute expiry; defaults to now + 7 days. */
    expiresAt?: Date;
};
export type CreateInvitationResult = {
    invitation: WorkspaceInvitationRow;
    /** Raw opaque token — return once to the caller for email delivery; never store. */
    rawToken: string;
};
export type RedeemInvitationInput = {
    invitationId: string;
    rawToken: string;
    userId: string;
    /** Authenticated user's verified email — must match invite email. */
    verifiedEmail: string;
    membershipId?: string;
};
type RedeemInvitationResult = {
    invitation: WorkspaceInvitationRow;
    membershipId: string;
    alreadyAccepted: boolean;
};
export declare function createInvitation(db: DB, input: CreateInvitationInput, options: InvitationDelegationOptions): Promise<CreateInvitationResult>;
/**
 * Replace a pending invitation's token.
 *
 * The workspace is an argument rather than something read back from the row: an id alone
 * selects any tenant's invitation, and the raw token returned here is the only copy of
 * that invitation's credential that will ever exist.
 */
export declare function resendInvitation(db: DB, invitationId: string, workspaceId: string, options?: {
    expiresAt?: Date;
}): Promise<CreateInvitationResult>;
export declare function cancelInvitation(db: DB, invitationId: string, workspaceId: string): Promise<WorkspaceInvitationRow>;
/**
 * Redeem a pending, unexpired invite when the authenticated verified email matches.
 *
 * D1/SQLite doesn't support Postgres-style interactive transactions spanning
 * multiple round trips, so this does NOT wrap the CAS update + membership insert
 * in `db.transaction()`. Instead: (1) compare-and-set the invitation status to
 * `accepted` in one statement (this is the atomicity boundary that resolves
 * concurrent redeem races), then (2) insert the membership row as a sequential
 * follow-up. If step 2 fails, `recoverAcceptedMembership` makes retries safe.
 *
 * The delegation rule is applied again here, against the inviter's role as it stands now:
 * the role this call grants is the role the invitation carries, and an invitation whose
 * inviter can no longer delegate it grants nothing.
 */
export declare function redeemInvitation(db: DB, input: RedeemInvitationInput, options: InvitationDelegationOptions): Promise<RedeemInvitationResult>;
export declare function listPendingInvitations(db: DB, workspaceId: string): Promise<WorkspaceInvitationRow[]>;
export { workspaceInvitations };
export type { WorkspaceInvitationRow };
