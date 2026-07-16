import { InviteError, hashOpaqueToken } from '@chester-hill-solutions/auth';
import { createInvitation, redeemInvitation } from '@chester-hill-solutions/auth-d1';
import { eq } from 'drizzle-orm';
import { getDb } from '~/lib/db.server';
import { workspaceInvitations, workspaces } from '~/db/schema';

export type PendingInvite = {
  invitationId: string;
  workspaceId: string;
  email: string;
  orgName: string;
};

export type InviteLookup =
  | { status: 'valid'; invite: PendingInvite }
  | { status: 'invalid'; message: string };

/**
 * Create a workspace invitation via the CHS invitation API (supersedes any
 * pending invite for the same email) and return the one-time invite URL.
 */
export async function createWorkspaceInvite(input: {
  workspaceId: string;
  email: string;
  invitedByUserId: string;
  baseUrl: string;
}): Promise<{ inviteUrl: string; email: string }> {
  const { invitation, rawToken } = await createInvitation(getDb(), {
    id: `wi_${crypto.randomUUID()}`,
    workspaceId: input.workspaceId,
    email: input.email,
    roleId: 'member',
    invitedByUserId: input.invitedByUserId,
  });
  return {
    inviteUrl: `${input.baseUrl}/signup?invite=${encodeURIComponent(rawToken)}`,
    email: invitation.email,
  };
}

/**
 * Resolve a raw `?invite=` token to its pending invitation (invitations store
 * only the SHA-256 token hash, so lookup goes through the same hash the CHS
 * API writes and verifies).
 */
export async function lookupInviteToken(rawToken: string): Promise<InviteLookup> {
  const db = getDb();
  const row = (
    await db
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.tokenHash, hashOpaqueToken(rawToken)))
      .limit(1)
  )[0];
  if (!row) {
    return {
      status: 'invalid',
      message: 'This invitation link is not valid. You can still create a new organization below.',
    };
  }
  if (row.status !== 'pending') {
    return {
      status: 'invalid',
      message: `This invitation is no longer active (${row.status}). Ask your admin for a new invite, or create a new organization below.`,
    };
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return {
      status: 'invalid',
      message:
        'This invitation has expired. Ask your admin to send a new one, or create a new organization below.',
    };
  }
  const ws = (
    await db.select().from(workspaces).where(eq(workspaces.id, row.workspaceId)).limit(1)
  )[0];
  return {
    status: 'valid',
    invite: {
      invitationId: row.id,
      workspaceId: row.workspaceId,
      email: row.email,
      orgName: ws?.name || 'your organization',
    },
  };
}

/**
 * Atomically accept the invitation and add the user to the invited workspace
 * (the CHS API marks the invitation accepted and inserts the membership).
 */
export async function redeemInviteForUser(input: {
  invitationId: string;
  rawToken: string;
  userId: string;
  verifiedEmail: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await redeemInvitation(getDb(), input);
    return { ok: true };
  } catch (error) {
    if (error instanceof InviteError || (error as Error | null)?.name === 'InviteError') {
      return { ok: false, error: (error as Error).message };
    }
    throw error;
  }
}
