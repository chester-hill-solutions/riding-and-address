import { Form, useActionData } from 'react-router';
import type { Route } from './+types/app.invites';
import { requireSessionUserId } from '~/lib/auth.server';
import { getDb } from '~/lib/db.server';
import { workspaceInvitations, workspaceMembers, workspaces } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { sendInviteEmail } from '~/lib/email.server';
import { env } from '~/lib/env.server';

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireSessionUserId(request);
  const membership = (
    await getDb().select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId)).limit(1)
  )[0];
  if (!membership) return { error: 'No organization' };
  if (membership.roleId !== 'owner' && membership.roleId !== 'admin') {
    return { error: 'Only owners/admins can invite' };
  }

  const form = await request.formData();
  const email = String(form.get('email') || '').trim().toLowerCase();
  if (!email) return { error: 'Email required' };

  const ws = (
    await getDb().select().from(workspaces).where(eq(workspaces.id, membership.workspaceId)).limit(1)
  )[0];
  const inviteId = crypto.randomUUID();
  const token = crypto.randomUUID().replace(/-/g, '');
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  await getDb().insert(workspaceInvitations).values({
    id: inviteId,
    workspaceId: membership.workspaceId,
    email,
    roleId: 'member',
    invitedByUserId: userId,
    tokenHash,
    status: 'pending',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  });

  const inviteUrl = `${env().baseUrl}/signup?invite=${token}`;
  await sendInviteEmail(email, inviteUrl, ws?.name || 'Riding Lookup org');
  return { ok: true, email };
}

export default function InvitesPage() {
  const data = useActionData<typeof action>();
  return (
    <section className="panel">
      <h1>Invites</h1>
      <p className="muted">Invite teammates as members. Owners manage keys and fuse settings.</p>
      {data && 'error' in data && data.error ? <p className="error">{data.error}</p> : null}
      {data && 'ok' in data && data.ok ? <p>Invite sent to {data.email}</p> : null}
      <Form method="post">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />
        <button type="submit">Send invite</button>
      </Form>
    </section>
  );
}
