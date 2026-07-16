import { Form } from 'react-router';
import type { Route } from './+types/app.invites';
import { isOwnerOrAdmin, requireCustomer } from '~/lib/customer.server';
import { createWorkspaceInvite } from '~/lib/invite.server';
import { sendInviteEmail } from '~/lib/email.server';
import { env } from '~/lib/env.server';
import { getDb } from '~/lib/db.server';
import { workspaces } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { Panel } from '~/components/Panel';
import { FormFeedback } from '~/components/FormFeedback';
import { SubmitButton } from '~/components/SubmitButton';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'Invites · Riding Lookup portal' },
    { name: 'description', content: 'Invite teammates to your Customer as members.' },
  ];
}

export async function action({ request }: Route.ActionArgs) {
  const { userId, membership } = await requireCustomer(request);
  if (!isOwnerOrAdmin(membership)) {
    return { error: 'Only owners/admins can invite' };
  }

  const form = await request.formData();
  const email = String(form.get('email') || '')
    .trim()
    .toLowerCase();
  if (!email) return { error: 'Email required' };

  const ws = (
    await getDb().select().from(workspaces).where(eq(workspaces.id, membership.workspaceId)).limit(1)
  )[0];

  try {
    const invite = await createWorkspaceInvite({
      workspaceId: membership.workspaceId,
      email,
      invitedByUserId: userId,
      baseUrl: env().baseUrl,
    });
    await sendInviteEmail(invite.email, invite.inviteUrl, ws?.name || 'Riding Lookup org');
    return { ok: true as const, email: invite.email };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not send the invite' };
  }
}

export default function InvitesPage({ actionData }: Route.ComponentProps) {
  return (
    <Panel title="Invites">
      <p className="muted">
        Invite teammates as members. Owners manage keys and fuse settings. Invitations expire after
        7 days; sending a new invite to the same email replaces the previous one.
      </p>
      <FormFeedback
        error={actionData && 'error' in actionData ? actionData.error : null}
        success={
          actionData && 'ok' in actionData && actionData.ok
            ? `Invite sent to ${actionData.email}`
            : null
        }
      />
      <Form method="post">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />
        <SubmitButton pendingText="Sending…">Send invite</SubmitButton>
      </Form>
    </Panel>
  );
}
