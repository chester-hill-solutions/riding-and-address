import type { DB } from "./schema.js";
import { workspaceInvitations, type WorkspaceInvitationRow } from "./invitation-schema.js";
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
export declare function createInvitation(db: DB, input: CreateInvitationInput): Promise<CreateInvitationResult>;
export declare function resendInvitation(db: DB, invitationId: string, options?: {
    expiresAt?: Date;
}): Promise<CreateInvitationResult>;
export declare function cancelInvitation(db: DB, invitationId: string): Promise<WorkspaceInvitationRow>;
/**
 * Redeem a pending, unexpired invite when the authenticated verified email matches.
 *
 * D1/SQLite doesn't support Postgres-style interactive transactions spanning
 * multiple round trips, so this does NOT wrap the CAS update + membership insert
 * in `db.transaction()`. Instead: (1) compare-and-set the invitation status to
 * `accepted` in one statement (this is the atomicity boundary that resolves
 * concurrent redeem races), then (2) insert the membership row as a sequential
 * follow-up. If step 2 fails, `recoverAcceptedMembership` makes retries safe.
 */
export declare function redeemInvitation(db: DB, input: RedeemInvitationInput): Promise<RedeemInvitationResult>;
export declare function listPendingInvitations(db: DB, workspaceId: string): Promise<WorkspaceInvitationRow[]>;
export { workspaceInvitations };
export type { WorkspaceInvitationRow };
