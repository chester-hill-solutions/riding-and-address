import { Form } from 'react-router';
import type { Route } from './+types/app.settings';
import { isOwnerOrAdmin, requireCustomer, requireOwnerOrAdmin } from '~/lib/customer.server';
import { getDb } from '~/lib/db.server';
import { customerBilling } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { upsertCustomerProjection } from '~/lib/projection.server';
import { DEFAULT_FREE_MONTHLY_ALLOWANCE } from '~/lib/pricing';
import { Panel } from '~/components/Panel';
import { FormFeedback } from '~/components/FormFeedback';
import { SubmitButton } from '~/components/SubmitButton';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'Fuse settings · Riding & Address portal' },
    { name: 'description', content: 'Set the monthly Billable-unit fuse and soft-warn behaviour.' },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { billing, membership } = await requireCustomer(request);
  return { billing, canManageFuse: isOwnerOrAdmin(membership) };
}

export async function action({ request }: Route.ActionArgs) {
  const { billing, membership } = await requireCustomer(request);
  requireOwnerOrAdmin(membership);

  const form = await request.formData();
  const fuseLimit = parseInt(String(form.get('fuseLimit') || billing.fuseLimit), 10);
  const fuseSoftWarn = form.get('fuseSoftWarn') === 'on';

  if (!Number.isFinite(fuseLimit) || fuseLimit < 0) {
    return { error: 'Fuse must be a number of Billable units (0 or more)' };
  }

  try {
    await getDb()
      .update(customerBilling)
      .set({ fuseLimit, fuseSoftWarn, updatedAt: new Date() })
      .where(eq(customerBilling.workspaceId, billing.workspaceId));

    await upsertCustomerProjection({
      id: billing.customerId,
      plan: billing.plan,
      fuseLimit,
      fuseSoftWarn,
      batchEnabled: billing.batchEnabled,
      stripeCustomerId: billing.stripeCustomerId || undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save fuse settings' };
  }

  return { ok: true as const };
}

export default function SettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { billing, canManageFuse } = loaderData;
  return (
    <Panel title="Fuse settings">
      <p className="muted">
        Default is hard-block at the monthly ceiling. Soft-warn continues serving after the fuse and
        logs warnings (and optional email alerts). Owners and admins can change these settings.
      </p>
      <FormFeedback
        error={actionData && 'error' in actionData ? actionData.error : null}
        success={actionData && 'ok' in actionData && actionData.ok ? 'Fuse settings saved.' : null}
      />
      {canManageFuse ? (
        <Form method="post">
          <label htmlFor="fuseLimit">Monthly fuse (Billable units)</label>
          <input
            id="fuseLimit"
            name="fuseLimit"
            type="number"
            min={0}
            defaultValue={billing?.fuseLimit ?? DEFAULT_FREE_MONTHLY_ALLOWANCE}
          />
          <label>
            <input
              type="checkbox"
              name="fuseSoftWarn"
              defaultChecked={Boolean(billing?.fuseSoftWarn)}
            />{' '}
            Soft-warn instead of hard-block
          </label>
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
        </Form>
      ) : (
        <p className="muted">
          Current fuse: <code>{billing?.fuseLimit ?? DEFAULT_FREE_MONTHLY_ALLOWANCE}</code>
          {billing?.fuseSoftWarn ? ' (soft-warn)' : ' (hard-block)'}. Ask an owner or admin to
          change it.
        </p>
      )}
    </Panel>
  );
}
