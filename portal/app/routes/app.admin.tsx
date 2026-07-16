import { Form } from 'react-router';
import type { Route } from './+types/app.admin';
import { isFounder, requireSessionUserId } from '~/lib/auth.server';
import { getDb } from '~/lib/db.server';
import { customerBilling } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { upsertCustomerProjection } from '~/lib/projection.server';
import { Panel } from '~/components/Panel';
import { FormFeedback } from '~/components/FormFeedback';
import { SubmitButton } from '~/components/SubmitButton';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'Founder admin · Riding Lookup portal' },
    { name: 'description', content: 'Flip Enterprise batch access for Customers.' },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireSessionUserId(request);
  if (!isFounder(userId)) {
    return { allowed: false as const, customers: [] };
  }
  const customers = await getDb().select().from(customerBilling);
  return { allowed: true as const, customers };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireSessionUserId(request);
  if (!isFounder(userId)) return { error: 'Forbidden' };

  const form = await request.formData();
  const customerId = String(form.get('customerId') || '');
  const batchEnabled = form.get('batchEnabled') === 'on';
  const rows = await getDb()
    .select()
    .from(customerBilling)
    .where(eq(customerBilling.customerId, customerId))
    .limit(1);
  const billing = rows[0];
  if (!billing) return { error: 'Customer not found' };

  try {
    await getDb()
      .update(customerBilling)
      .set({
        batchEnabled,
        plan: batchEnabled ? 'enterprise' : billing.plan,
        updatedAt: new Date(),
      })
      .where(eq(customerBilling.customerId, customerId));

    await upsertCustomerProjection({
      id: billing.customerId,
      plan: batchEnabled ? 'enterprise' : billing.plan,
      fuseLimit: billing.fuseLimit,
      fuseSoftWarn: billing.fuseSoftWarn,
      batchEnabled,
      stripeCustomerId: billing.stripeCustomerId || undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not update the Customer' };
  }

  return { ok: true as const, customerId };
}

export default function AdminPage({ loaderData, actionData }: Route.ComponentProps) {
  if (!loaderData.allowed) {
    return (
      <Panel title="Founder admin">
        <p className="muted">Your user is not listed in FOUNDER_USER_IDS.</p>
      </Panel>
    );
  }
  return (
    <Panel title="Founder admin">
      <p className="muted">Flip Enterprise batchEnabled after a sales contract.</p>
      <FormFeedback
        error={actionData && 'error' in actionData ? actionData.error : null}
        success={
          actionData && 'ok' in actionData && actionData.ok
            ? `Saved ${actionData.customerId}.`
            : null
        }
      />
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Plan</th>
            <th>Batch</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {loaderData.customers.map((c) => (
            <tr key={c.customerId}>
              <td>
                <code>{c.customerId}</code>
              </td>
              <td>{c.plan}</td>
              <td>{c.batchEnabled ? 'on' : 'off'}</td>
              <td>
                <Form method="post">
                  <input type="hidden" name="customerId" value={c.customerId} />
                  <label>
                    <input type="checkbox" name="batchEnabled" defaultChecked={c.batchEnabled} />{' '}
                    batchEnabled
                  </label>
                  <SubmitButton pendingText="Saving…">Save</SubmitButton>
                </Form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
