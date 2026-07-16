import { Form, Link, Outlet } from 'react-router';
import type { Route } from './+types/app';
import { requireCustomer } from '~/lib/customer.server';
import { isFounder } from '~/lib/auth.server';
import { SubmitButton } from '~/components/SubmitButton';

export async function loader({ request }: Route.LoaderArgs) {
  const { userId, billing } = await requireCustomer(request);
  return {
    userId,
    workspaceId: billing.workspaceId,
    customerId: billing.customerId,
    plan: billing.plan,
    batchEnabled: billing.batchEnabled,
    showAdmin: isFounder(userId),
  };
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const { customerId, plan, showAdmin } = loaderData;
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
        {showAdmin ? <Link to="/app/admin">Admin</Link> : null}
        <Form method="post" action="/api/auth/sign-out">
          <SubmitButton className="secondary" pendingText="Signing out…">
            Sign out
          </SubmitButton>
        </Form>
      </nav>
      <p className="muted">
        Customer <code>{customerId}</code> · plan <code>{plan}</code>
      </p>
      <Outlet />
    </main>
  );
}
