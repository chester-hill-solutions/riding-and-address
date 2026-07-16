import { Form, Link, NavLink, Outlet } from 'react-router';
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
    <div className="app-shell">
      <header className="app-header">
        <div className="shell">
          <Link className="brand" to="/app">
            Riding Lookup
          </Link>
          <div className="account-summary">
            <span className="plan-badge">{plan} plan</span>
            <span className="account-summary__id">{customerId}</span>
          </div>
        </div>
      </header>
      <div className="app-body shell">
        <aside className="app-sidebar">
          <nav aria-label="Portal navigation">
            <NavLink end to="/app">
              Overview
            </NavLink>
            <NavLink to="/app/keys">API keys</NavLink>
            <NavLink to="/app/billing">Plan & billing</NavLink>
            <NavLink to="/app/invites">Team</NavLink>
            <NavLink to="/app/settings">Usage fuse</NavLink>
            {showAdmin ? <NavLink to="/app/admin">Admin</NavLink> : null}
          </nav>
          <Form method="post" action="/api/auth/sign-out">
            <SubmitButton className="secondary sidebar-signout" pendingText="Signing out…">
              Sign out
            </SubmitButton>
          </Form>
        </aside>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
