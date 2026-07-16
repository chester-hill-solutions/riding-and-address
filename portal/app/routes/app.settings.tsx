import { Form, useLoaderData } from 'react-router';
import type { Route } from './+types/app.settings';
import { requireSessionUserId } from '~/lib/auth.server';
import { getBilling } from '~/lib/customer.server';
import { getDb } from '~/lib/db.server';
import { customerBilling, workspaceMembers } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { upsertCustomerProjection } from '~/lib/projection.server';

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireSessionUserId(request);
  const membership = (
    await getDb().select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId)).limit(1)
  )[0];
  if (!membership) throw new Response('No org', { status: 400 });
  return { billing: await getBilling(membership.workspaceId) };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireSessionUserId(request);
  const membership = (
    await getDb().select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId)).limit(1)
  )[0];
  if (!membership) return { error: 'No org' };
  const billing = await getBilling(membership.workspaceId);
  if (!billing) return { error: 'No billing' };

  const form = await request.formData();
  const fuseLimit = parseInt(String(form.get('fuseLimit') || billing.fuseLimit), 10);
  const fuseSoftWarn = form.get('fuseSoftWarn') === 'on';

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

  return { ok: true };
}

export default function SettingsPage() {
  const { billing } = useLoaderData<typeof loader>();
  return (
    <section className="panel">
      <h1>Fuse settings</h1>
      <p className="muted">
        Default is hard-block at the monthly ceiling. Soft-warn continues serving after the fuse and
        logs warnings (and optional email alerts).
      </p>
      <Form method="post">
        <label htmlFor="fuseLimit">Monthly fuse (Billable units)</label>
        <input
          id="fuseLimit"
          name="fuseLimit"
          type="number"
          min={0}
          defaultValue={billing?.fuseLimit ?? 1000}
        />
        <label>
          <input
            type="checkbox"
            name="fuseSoftWarn"
            defaultChecked={Boolean(billing?.fuseSoftWarn)}
          />{' '}
          Soft-warn instead of hard-block
        </label>
        <button type="submit">Save</button>
      </Form>
    </section>
  );
}
