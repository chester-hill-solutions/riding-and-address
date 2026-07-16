import { Form, useLoaderData } from 'react-router';
import type { Route } from './+types/app.admin';
import { isFounder, requireSessionUserId } from '~/lib/auth.server';
import { getDb } from '~/lib/db.server';
import { customerBilling } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { upsertCustomerProjection } from '~/lib/projection.server';

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

  await getDb()
    .update(customerBilling)
    .set({ batchEnabled, plan: batchEnabled ? 'enterprise' : billing.plan, updatedAt: new Date() })
    .where(eq(customerBilling.customerId, customerId));

  await upsertCustomerProjection({
    id: billing.customerId,
    plan: batchEnabled ? 'enterprise' : billing.plan,
    fuseLimit: billing.fuseLimit,
    fuseSoftWarn: billing.fuseSoftWarn,
    batchEnabled,
    stripeCustomerId: billing.stripeCustomerId || undefined,
  });

  return { ok: true };
}

export default function AdminPage() {
  const data = useLoaderData<typeof loader>();
  if (!data.allowed) {
    return (
      <section className="panel">
        <h1>Founder admin</h1>
        <p className="muted">Your user is not listed in FOUNDER_USER_IDS.</p>
      </section>
    );
  }
  return (
    <section className="panel">
      <h1>Founder admin</h1>
      <p className="muted">Flip Enterprise batchEnabled after a sales contract.</p>
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
          {data.customers.map((c) => (
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
                  <button type="submit">Save</button>
                </Form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
