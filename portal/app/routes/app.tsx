import { Form, Link, Outlet, redirect } from 'react-router';
import type { Route } from './+types/app';
import { requireSessionUserId } from '~/lib/auth.server';
import { ensureCustomerForUser, getBilling } from '~/lib/customer.server';
import { eq } from 'drizzle-orm';
import { getDb } from '~/lib/db.server';
import { workspaceMembers } from '~/db/schema';

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireSessionUserId(request);

  const memberships = await getDb()
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);

  let billing = memberships[0]
    ? await getBilling(memberships[0].workspaceId)
    : null;

  if (!billing) {
    billing = await ensureCustomerForUser(userId, 'My organization');
  }
  if (!billing) {
    throw redirect('/signup');
  }

  return {
    userId,
    workspaceId: billing.workspaceId,
    customerId: billing.customerId,
    plan: billing.plan,
    batchEnabled: billing.batchEnabled,
  };
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const { customerId, plan } = loaderData;
  return (
    <main className="shell">
      <nav className="nav">
        <Link className="brand" to="/app">
          Riding Lookup
        </Link>
        <Link to="/app">Usage</Link>
        <Link to="/app/keys">Keys</Link>
        <Link to="/app/billing">Billing</Link>
        <Link to="/app/invites">Invites</Link>
        <Link to="/app/settings">Fuse</Link>
        <Link to="/app/admin">Admin</Link>
        <Form method="post" action="/api/auth/sign-out">
          <button type="submit" className="secondary">
            Sign out
          </button>
        </Form>
      </nav>
      <p className="muted">
        Customer <code>{customerId}</code> · plan <code>{plan}</code>
      </p>
      <Outlet />
    </main>
  );
}
