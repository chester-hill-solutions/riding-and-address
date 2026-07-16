import { useRouteLoaderData } from 'react-router';
import type { Route } from './+types/app._index';
import { fetchUsage } from '~/lib/projection.server';

export async function loader({ request }: Route.LoaderArgs) {
  const { loader: appLoader } = await import('./app');
  const parent = await appLoader({ request } as never);
  try {
    const usage = await fetchUsage(parent.customerId);
    return { usage };
  } catch (error) {
    return {
      usage: null,
      error: error instanceof Error ? error.message : 'Could not load usage',
    };
  }
}

export default function UsageDashboard({ loaderData }: Route.ComponentProps) {
  const app = useRouteLoaderData('routes/app') as { customerId: string } | undefined;
  const { usage, error } = loaderData as {
    usage: { month: string; count: number; limit: number } | null;
    error?: string;
  };
  return (
    <section className="panel">
      <h1>Usage</h1>
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
          in {usage.month}
          {app ? (
            <>
              {' '}
              for <code>{app.customerId}</code>
            </>
          ) : null}
        </p>
      ) : (
        <p className="muted">Usage unavailable until the Worker projection API is configured.</p>
      )}
    </section>
  );
}
