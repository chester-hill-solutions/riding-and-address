import { and, eq, gt } from "drizzle-orm";
import { assertProductRoles, generateOpaqueToken, hashOpaqueToken, InviteError, invitationalRolesFor, normalizeEmail, verifyOpaqueToken, } from "@chester-hill-solutions/auth";
import { workspaceMembers } from "./schema.js";
import { workspaceInvitations } from "./invitation-schema.js";
import { getWorkspaceMemberRoleId } from "./workspace-access.js";
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function newId(prefix) {
    return `${prefix}_${crypto.randomUUID()}`;
}
async function supersedePendingInvite(db, workspaceId, email) {
    await db
        .update(workspaceInvitations)
        .set({ status: "superseded", updatedAt: new Date() })
        .where(and(eq(workspaceInvitations.workspaceId, workspaceId), eq(workspaceInvitations.email, email), eq(workspaceInvitations.status, "pending")));
}
/**
 * Refuse an invitation whose role the inviter may not hand out.
 *
 * The inviter's role is read from the membership row, never from the caller: an invitation
 * is a promise about what the workspace will grant, and a promise nobody was entitled to make
 * is worse than a refused one. A role the inviter does not hold, or a role above the
 * inviter's own, is refused before the invitation row exists.
 */
async function assertDelegableRole(db, params) {
    const inviterRoleId = await getWorkspaceMemberRoleId(db, {
        workspaceId: params.workspaceId,
        userId: params.inviterUserId,
    });
    if (!inviterRoleId) {
        throw new InviteError("Inviter is not a member of this workspace", "INVITE_INVITER_NOT_MEMBER", 403);
    }
    const roles = params.options?.roles;
    if (!roles) {
        throw new InviteError("The product role vocabulary is required for invitation delegation", "INVITE_ROLE_VOCABULARY_REQUIRED", 403);
    }
    assertProductRoles(roles);
    if (invitationalRolesFor(inviterRoleId, roles).includes(params.roleId))
        return;
    throw new InviteError(`Role ${params.roleId} is not delegable by ${inviterRoleId}`, "INVITE_ROLE_NOT_DELEGABLE", 403);
}
export async function createInvitation(db, input, options) {
    const email = normalizeEmail(input.email);
    if (!email.includes("@")) {
        throw new InviteError("Invalid invite email", "INVITE_INVALID_EMAIL");
    }
    await assertDelegableRole(db, {
        workspaceId: input.workspaceId,
        inviterUserId: input.invitedByUserId,
        roleId: input.roleId,
        options,
    });
    await supersedePendingInvite(db, input.workspaceId, email);
    const rawToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = input.expiresAt ?? new Date(Date.now() + DEFAULT_TTL_MS);
    const now = new Date();
    const [invitation] = await db
        .insert(workspaceInvitations)
        .values({
        id: input.id,
        workspaceId: input.workspaceId,
        email,
        roleId: input.roleId,
        invitedByUserId: input.invitedByUserId,
        tokenHash,
        status: "pending",
        expiresAt,
        createdAt: now,
        updatedAt: now,
    })
        .returning();
    if (!invitation) {
        throw new InviteError("Failed to create invitation", "INVITE_CREATE_FAILED", 500);
    }
    return { invitation, rawToken };
}
/**
 * Replace a pending invitation's token.
 *
 * The workspace is an argument rather than something read back from the row: an id alone
 * selects any tenant's invitation, and the raw token returned here is the only copy of
 * that invitation's credential that will ever exist.
 */
export async function resendInvitation(db, invitationId, workspaceId, options) {
    const [existing] = await db
        .select()
        .from(workspaceInvitations)
        .where(and(eq(workspaceInvitations.id, invitationId), eq(workspaceInvitations.workspaceId, workspaceId)))
        .limit(1);
    if (!existing) {
        throw new InviteError("Invitation not found", "INVITE_NOT_FOUND", 404);
    }
    if (existing.status !== "pending") {
        throw new InviteError("Only pending invitations can be resent", "INVITE_NOT_PENDING");
    }
    const rawToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = options?.expiresAt ?? new Date(Date.now() + DEFAULT_TTL_MS);
    const now = new Date();
    const [invitation] = await db
        .update(workspaceInvitations)
        .set({ tokenHash, expiresAt, updatedAt: now })
        .where(and(eq(workspaceInvitations.id, invitationId), eq(workspaceInvitations.workspaceId, workspaceId), eq(workspaceInvitations.status, "pending")))
        .returning();
    if (!invitation) {
        throw new InviteError("Invitation not found", "INVITE_NOT_FOUND", 404);
    }
    return { invitation, rawToken };
}
export async function cancelInvitation(db, invitationId, workspaceId) {
    const [invitation] = await db
        .update(workspaceInvitations)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(and(eq(workspaceInvitations.id, invitationId), eq(workspaceInvitations.workspaceId, workspaceId), eq(workspaceInvitations.status, "pending")))
        .returning();
    if (!invitation) {
        throw new InviteError("Pending invitation not found", "INVITE_NOT_FOUND", 404);
    }
    return invitation;
}
async function findExistingMembership(db, workspaceId, userId) {
    const [row] = await db
        .select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
        .limit(1);
    return row ?? null;
}
/**
 * D1 has no cross-round-trip interactive transactions — see README "D1 transaction
 * limits". A prior redeem may have CAS'd the invitation to `accepted` but failed
 * before inserting the membership row (worker eviction, network blip). Recover
 * idempotently: if a membership already exists, reuse it; otherwise create it.
 */
async function recoverAcceptedMembership(db, invite, input) {
    const existing = await findExistingMembership(db, invite.workspaceId, input.userId);
    if (existing) {
        return { invitation: invite, membershipId: existing.id, alreadyAccepted: true };
    }
    const membershipId = input.membershipId ?? newId("wm");
    // One membership row per (workspace_id, user_id), so this insert cannot be the second
    // row for a principal: a re-invite updates the role the person already holds.
    const [membership] = await db
        .insert(workspaceMembers)
        .values({
        id: membershipId,
        workspaceId: invite.workspaceId,
        userId: input.userId,
        roleId: invite.roleId,
        invitedBy: invite.invitedByUserId,
        createdAt: new Date(),
    })
        .onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        set: { roleId: invite.roleId, invitedBy: invite.invitedByUserId },
    })
        .returning({ id: workspaceMembers.id });
    if (!membership) {
        throw new InviteError("Failed to create membership", "INVITE_MEMBERSHIP_FAILED", 500);
    }
    return { invitation: invite, membershipId: membership.id, alreadyAccepted: true };
}
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
export async function redeemInvitation(db, input, options) {
    const verifiedEmail = normalizeEmail(input.verifiedEmail);
    const [invite] = await db
        .select()
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.id, input.invitationId))
        .limit(1);
    if (!invite) {
        throw new InviteError("Invitation not found", "INVITE_NOT_FOUND", 404);
    }
    if (!verifyOpaqueToken(input.rawToken, invite.tokenHash)) {
        throw new InviteError("Invalid invitation token", "INVITE_TOKEN_INVALID", 403);
    }
    if (invite.email !== verifiedEmail) {
        throw new InviteError("Invite email does not match authenticated user", "INVITE_EMAIL_MISMATCH", 403);
    }
    await assertDelegableRole(db, {
        workspaceId: invite.workspaceId,
        inviterUserId: invite.invitedByUserId,
        roleId: invite.roleId,
        options,
    });
    if (invite.status === "accepted" && invite.acceptedByUserId === input.userId) {
        return recoverAcceptedMembership(db, invite, input);
    }
    if (invite.status !== "pending") {
        throw new InviteError(`Invitation is ${invite.status}`, "INVITE_NOT_PENDING");
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
        await db
            .update(workspaceInvitations)
            .set({ status: "expired", updatedAt: new Date() })
            .where(eq(workspaceInvitations.id, invite.id));
        throw new InviteError("Invitation expired", "INVITE_EXPIRED", 410);
    }
    const now = new Date();
    const membershipId = input.membershipId ?? newId("wm");
    const [cas] = await db
        .update(workspaceInvitations)
        .set({
        status: "accepted",
        acceptedAt: now,
        acceptedByUserId: input.userId,
        updatedAt: now,
    })
        .where(and(eq(workspaceInvitations.id, invite.id), eq(workspaceInvitations.status, "pending"), gt(workspaceInvitations.expiresAt, now)))
        .returning();
    if (!cas) {
        const [again] = await db
            .select()
            .from(workspaceInvitations)
            .where(eq(workspaceInvitations.id, invite.id))
            .limit(1);
        if (again?.status === "accepted" && again.acceptedByUserId === input.userId) {
            return recoverAcceptedMembership(db, again, input);
        }
        throw new InviteError("Invitation already consumed", "INVITE_ALREADY_CONSUMED", 409);
    }
    // One membership row per (workspace_id, user_id). A second invitation for a person who
    // already accepted one supersedes the role rather than adding a row beside it: two rows
    // for the same principal leave the effective role to whichever row the database returns
    // first, and the earlier, higher role is the one that keeps winning.
    const [membership] = await db
        .insert(workspaceMembers)
        .values({
        id: membershipId,
        workspaceId: cas.workspaceId,
        userId: input.userId,
        roleId: cas.roleId,
        invitedBy: cas.invitedByUserId,
        createdAt: now,
    })
        .onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        set: { roleId: cas.roleId, invitedBy: cas.invitedByUserId },
    })
        .returning({ id: workspaceMembers.id });
    if (!membership) {
        throw new InviteError("Failed to create membership", "INVITE_MEMBERSHIP_FAILED", 500);
    }
    return { invitation: cas, membershipId: membership.id, alreadyAccepted: false };
}
export async function listPendingInvitations(db, workspaceId) {
    return db
        .select()
        .from(workspaceInvitations)
        .where(and(eq(workspaceInvitations.workspaceId, workspaceId), eq(workspaceInvitations.status, "pending"), gt(workspaceInvitations.expiresAt, new Date())));
}
export { workspaceInvitations };
