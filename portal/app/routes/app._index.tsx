import type { Route } from './+types/app._index';
import { requireCustomer } from '~/lib/customer.server';
import { fetchUsage } from '~/lib/projection.server';
import { Panel } from '~/components/Panel';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'Usage · Riding Lookup portal' },
    { name: 'description', content: 'Billable units used this UTC month against your allowance.' },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { billing } = await requireCustomer(request);
  try {
    const usage = await fetchUsage(billing.customerId);
    return { customerId: billing.customerId, usage, error: null };
  } catch (error) {
    return {
      customerId: billing.customerId,
      usage: null,
      error: error instanceof Error ? error.message : 'Could not load usage',
    };
  }
}

export default function UsageDashboard({ loaderData }: Route.ComponentProps) {
  const { customerId, usage, error } = loaderData;
  return (
    <Panel title="Usage">
      <p className="muted">
        Billable unit = successful HTTP 200 lookup or search. Cache hits count; 4xx/5xx do not.
        Free allowance resets each UTC calendar month.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {usage ? (
        <p>
          <strong>
            {usage.count.toLocaleString()} / {usage.limit > 0 ? usage.limit.toLocaleString() : '∞'}
          </strong>{' '}
          in {usage.month} for <code>{customerId}</code>
        </p>
      ) : (
        <p className="muted">Usage unavailable until the Worker projection API is configured.</p>
      )}
    </Panel>
  );
}
