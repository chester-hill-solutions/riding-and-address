import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Form, Link, data, redirect } from 'react-router';
import type { Route } from './+types/signup';
import { normalizeEmail } from '@chester-hill-solutions/auth';
import { getAuth } from '~/lib/auth.server';
import { ensureCustomerForUser } from '~/lib/customer.server';
import { lookupInviteToken, redeemInviteForUser } from '~/lib/invite.server';
import { AuthLayout } from '~/components/AuthLayout';
import { FormFeedback } from '~/components/FormFeedback';
import { SubmitButton } from '~/components/SubmitButton';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'Sign up · CanCoder portal' },
    {
      name: 'description',
      content: 'Create an organization on CanCoder or join one you were invited to.',
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get('invite');
  if (!token) return { invite: null, inviteError: null };
  const result = await lookupInviteToken(token);
  if (result.status === 'valid') {
    return {
      invite: { orgName: result.invite.orgName, email: result.invite.email, token },
      inviteError: null,
    };
  }
  return { invite: null, inviteError: result.message };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get('email') || '');
  const password = String(form.get('password') || '');
  const name = String(form.get('name') || 'Organization');
  const inviteToken = String(form.get('inviteToken') || '');

  // Re-validate the invite before creating the account so a stale token never
  // silently provisions a fresh organization.
  let invite = null;
  if (inviteToken) {
    const result = await lookupInviteToken(inviteToken);
    if (result.status !== 'valid') {
      return { error: result.message };
    }
    invite = result.invite;
    if (normalizeEmail(email) !== invite.email) {
      return {
        error: `This invitation was sent to ${invite.email}. Sign up with that email, or ask for a new invite.`,
      };
    }
  }

  try {
    const signUp = await getAuth().api.signUpEmail({
      body: { email, password, name },
      headers: request.headers,
      returnHeaders: true,
    });
    const userId = signUp.response?.user?.id;
    if (!userId) {
      return { error: 'Could not create account' };
    }

    if (invite) {
      const redeemed = await redeemInviteForUser({
        invitationId: invite.invitationId,
        rawToken: inviteToken,
        userId,
        verifiedEmail: email,
      });
      if (!redeemed.ok) {
        // Account exists and the session is set; surface why joining failed.
        return data(
          {
            error: `Your account was created, but the invitation could not be applied: ${redeemed.error}. Ask your admin for a new invite link.`,
          },
          { headers: signUp.headers }
        );
      }
    } else {
      await ensureCustomerForUser(userId, name);
    }
    return redirect('/app', { headers: signUp.headers });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Sign-up failed' };
  }
}

export default function Signup({ loaderData, actionData }: Route.ComponentProps) {
  const { invite, inviteError } = loaderData;
  const joining = Boolean(invite);
  return (
    <AuthLayout title={joining ? `Join ${invite!.orgName}` : 'Create your workspace'}
      description={joining ? `You were invited as ${invite!.email}. Create your account to join the team.` : 'Start with 1,000 free calls every month. No credit card required.'}>
        {inviteError ? <p className="error">{inviteError}</p> : null}
        <FormFeedback error={actionData?.error} />
        <Form method="post">
          {joining ? <input type="hidden" name="inviteToken" value={invite!.token} /> : null}
          <Label htmlFor="name">{joining ? 'Your name' : 'Organization name'}</Label>
          <Input size="touch" id="name" name="name" required />
          <Label htmlFor="email">Email</Label>
          <Input size="touch"
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={invite?.email}
            readOnly={joining}
          />
          <Label htmlFor="password">Password</Label>
          <Input size="touch"
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <SubmitButton pendingText={joining ? 'Joining…' : 'Creating…'}>
            {joining ? `Join ${invite!.orgName}` : 'Sign up'}
          </SubmitButton>
        </Form>
        {joining ? (
          <p className="muted">
            Not {invite!.email}? <Link to="/signup">Sign up without the invitation</Link> instead.
          </p>
        ) : null}
    </AuthLayout>
  );
}
