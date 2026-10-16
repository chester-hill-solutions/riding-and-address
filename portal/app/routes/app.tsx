import { SiteHeader } from '~/components/SiteHeader';
import { Form, NavLink, Outlet } from 'react-router';
import type { Route } from './+types/app';
import { requireCustomer } from '~/lib/customer.server';
import { isFounder } from '~/lib/auth.server';
import { SubmitButton } from '~/components/SubmitButton';

export async function loader({ request, url }: Route.LoaderArgs) {
  const { userId, billing } = await requireCustomer(request, url);
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
  const { plan, showAdmin } = loaderData;
  return (
    <div className="app-shell">
      <SiteHeader plan={plan} />
      <div className="app-body shell">
        <aside className="app-sidebar">
          <nav aria-label="Portal navigation">
            <NavLink end to="/app">
              Overview
            </NavLink>
            <NavLink to="/app/uploads">Upload a sheet</NavLink>
            <NavLink to="/app/keys">API keys</NavLink>
            <NavLink to="/app/billing">Plan & billing</NavLink>
            <NavLink to="/app/invites">Team</NavLink>
            <NavLink to="/app/settings">Usage fuse</NavLink>
            {showAdmin ? <NavLink to="/app/admin">Admin</NavLink> : null}
          </nav>
          <Form method="post" action="/api/auth/sign-out">
            <SubmitButton variant="secondary" className="sidebar-signout" pendingText="Signing out…">
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
