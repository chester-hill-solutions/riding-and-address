import { Form, Link, redirect, useActionData } from 'react-router';
import type { Route } from './+types/login';
import { getAuth } from '~/lib/auth.server';

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

export default function Login() {
  const data = useActionData<typeof action>();
  return (
    <main className="shell">
      <nav className="nav">
        <Link className="brand" to="/">
          Riding Lookup
        </Link>
      </nav>
      <section className="panel">
        <h1>Log in</h1>
        {data && 'error' in data && data.error ? <p className="error">{data.error}</p> : null}
        <Form method="post">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
          <button type="submit">Continue</button>
        </Form>
        <p className="muted">
          No account? <Link to="/signup">Sign up</Link>
        </p>
      </section>
    </main>
  );
}
