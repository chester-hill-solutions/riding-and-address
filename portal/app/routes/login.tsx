import { Form, Link, redirect } from 'react-router';
import type { Route } from './+types/login';
import { getAuth } from '~/lib/auth.server';
import { Panel } from '~/components/Panel';
import { FormFeedback } from '~/components/FormFeedback';
import { SubmitButton } from '~/components/SubmitButton';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'Log in · Riding & Address portal' },
    { name: 'description', content: 'Sign in to manage keys, usage, and fuse settings.' },
  ];
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get('email') || '');
  const password = String(form.get('password') || '');
  try {
    const result = await getAuth().api.signInEmail({
      body: { email, password },
      asResponse: true,
      headers: request.headers,
    });
    if (!result.ok) {
      return { error: 'Invalid email or password' };
    }
    const continueTo = new URL(request.url).searchParams.get('continue') || '/app';
    return redirect(continueTo, { headers: result.headers });
  } catch {
    return { error: 'Sign-in failed' };
  }
}

export default function Login({ actionData }: Route.ComponentProps) {
  return (
    <main className="shell">
      <nav className="nav">
        <Link className="brand" to="/">
          Riding & Address
        </Link>
      </nav>
      <Panel title="Log in">
        <FormFeedback error={actionData?.error} />
        <Form method="post">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
          <SubmitButton pendingText="Signing in…">Continue</SubmitButton>
        </Form>
        <p className="muted">
          No account? <Link to="/signup">Sign up</Link>
        </p>
      </Panel>
    </main>
  );
}
