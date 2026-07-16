import { Link } from 'react-router';
import type { Route } from './+types/app._index';
import { listKeys, requireCustomer } from '~/lib/customer.server';
import { fetchUsage } from '~/lib/projection.server';
import { DEFAULT_FREE_MONTHLY_ALLOWANCE, formatMeteredUnitPrice } from '~/lib/pricing';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'Usage · CanCoder portal' },
    { name: 'description', content: 'Billable units used this UTC month against your allowance.' },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { billing } = await requireCustomer(request);
  const keys = await listKeys(billing.workspaceId);
  try {
    const usage = await fetchUsage(billing.customerId);
    return {
      customerId: billing.customerId,
      plan: billing.plan,
      activeKeyCount: keys.filter((key) => !key.disabled).length,
      usage,
      error: null,
    };
  } catch (error) {
    return {
      customerId: billing.customerId,
      plan: billing.plan,
      activeKeyCount: keys.filter((key) => !key.disabled).length,
      usage: null,
      error: error instanceof Error ? error.message : 'Could not load usage',
    };
  }
}

export default function UsageDashboard({ loaderData }: Route.ComponentProps) {
  const { activeKeyCount, usage, error } = loaderData;
  const usageLimit = usage?.limit && usage.limit > 0 ? usage.limit : DEFAULT_FREE_MONTHLY_ALLOWANCE;
  const usagePercent = usage ? Math.min((usage.count / usageLimit) * 100, 100) : 0;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Overview</h1>
          <p>Manage access and keep this month’s API usage under control.</p>
        </div>
        <Link className="btn btn--compact" to="/app/keys">
          {activeKeyCount > 0 ? 'Manage keys' : 'Create your first key'}
        </Link>
      </div>

      {activeKeyCount === 0 ? (
        <section className="getting-started" aria-labelledby="getting-started-title">
          <div>
            <p className="progress-label">Setup · 1 of 3 steps</p>
            <h2 id="getting-started-title">Make your first lookup</h2>
            <p>
              Your workspace is ready. Create a key, copy it once, then use it to authenticate your
              first request.
            </p>
          </div>
          <ol>
            <li className="is-complete">
              <span aria-hidden="true">✓</span>
              Create your workspace
            </li>
            <li>
              <span>2</span>
              <Link to="/app/keys">Create an API key</Link>
            </li>
            <li>
              <span>3</span>
              Make an authenticated request
            </li>
          </ol>
        </section>
      ) : null}

      <div className="dashboard-grid">
        <section className="panel usage-panel">
          <div className="panel-heading">
            <div>
              <h2>This month’s usage</h2>
              <p>Resets at the start of each UTC month</p>
            </div>
            <Link to="/app/settings">Set fuse</Link>
          </div>
          {error ? <p className="error">{error}</p> : null}
          {usage ? (
            <>
              <p className="usage-total">
                <strong>{usage.count.toLocaleString('en-CA')}</strong>
                <span> of {usageLimit.toLocaleString('en-CA')} successful calls</span>
              </p>
              <div
                className="usage-meter"
                role="progressbar"
                aria-label="Monthly usage"
                aria-valuenow={usage.count}
                aria-valuemin={0}
                aria-valuemax={usageLimit}
              >
                <span style={{ width: `${usagePercent}%` }} />
              </div>
              <p className="fine-print">
                Cache hits count. 4xx and 5xx responses do not count.
              </p>
            </>
          ) : (
            <p className="muted">Usage will appear after the projection API is configured.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Plan</h2>
              <p>Free allowance included every month</p>
            </div>
            <Link to="/app/billing">View billing</Link>
          </div>
          <p className="usage-total">
            <strong>{DEFAULT_FREE_MONTHLY_ALLOWANCE.toLocaleString('en-CA')}</strong>
            <span> calls included</span>
          </p>
          <p className="fine-print">
            Metered usage is {formatMeteredUnitPrice()} USD per successful call after the allowance.
          </p>
        </section>
      </div>
    </>
  );
}
