import { Form, Link, redirect, useActionData } from 'react-router';
import type { Route } from './+types/signup';
import { getAuth } from '~/lib/auth.server';
import { ensureCustomerForUser } from '~/lib/customer.server';

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get('email') || '');
  const password = String(form.get('password') || '');
  const name = String(form.get('name') || 'Organization');
  try {
    const result = await getAuth().api.signUpEmail({
      body: { email, password, name },
      asResponse: true,
      headers: request.headers,
    });
    if (!result.ok) {
      return { error: 'Could not create account' };
    }
    const session = await getAuth().api.getSession({ headers: result.headers });
    const userId = session?.user?.id;
    if (userId) {
      await ensureCustomerForUser(userId, name);
    }
    return redirect('/app', { headers: result.headers });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Sign-up failed' };
  }
}

export default function Signup() {
  const data = useActionData<typeof action>();
  return (
    <main className="shell">
      <nav className="nav">
        <Link className="brand" to="/">
          Riding Lookup
        </Link>
      </nav>
      <section className="panel">
        <h1>Create your organization</h1>
        <p className="muted">Free tier includes 1 000 successful lookups/searches per UTC month.</p>
        {data && 'error' in data && data.error ? <p className="error">{data.error}</p> : null}
        <Form method="post">
          <label htmlFor="name">Organization name</label>
          <input id="name" name="name" required />
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          <button type="submit">Sign up</button>
        </Form>
      </section>
    </main>
  );
}
