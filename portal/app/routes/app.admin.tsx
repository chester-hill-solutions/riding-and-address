import { Checkbox } from '~/components/ui/checkbox';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '~/components/ui/table';
import { Form } from 'react-router';
import type { Route } from './+types/app.admin';
import { isFounder, requireSessionUserId } from '~/lib/auth.server';
import { getDb } from '~/lib/db.server';
import { customerBilling } from '~/db/schema';
import { setBatchEnabled } from '~/lib/billing-mutations.server';
import { Panel } from '~/components/Panel';
import { FormFeedback } from '~/components/FormFeedback';
import { SubmitButton } from '~/components/SubmitButton';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'Founder admin · CanCoder portal' },
    { name: 'description', content: 'Flip Enterprise batch access for Customers.' },
  ];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const userId = await requireSessionUserId(request, url);
  if (!isFounder(userId)) {
    return { allowed: false as const, customers: [] };
  }
  const customers = await getDb().select().from(customerBilling);
  return { allowed: true as const, customers };
}

export async function action({ request, url }: Route.ActionArgs) {
  const userId = await requireSessionUserId(request, url);
  if (!isFounder(userId)) return { error: 'Forbidden' };

  const form = await request.formData();
  const customerId = String(form.get('customerId') || '');
  const batchEnabled = form.get('batchEnabled') === 'on';

  try {
    await setBatchEnabled({ customerId, batchEnabled });
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loaderData.customers.map((c) => (
            <TableRow key={c.customerId}>
              <TableCell>
                <code>{c.customerId}</code>
              </TableCell>
              <TableCell>{c.plan}</TableCell>
              <TableCell>{c.batchEnabled ? 'on' : 'off'}</TableCell>
              <TableCell>
                <Form method="post">
                  <input type="hidden" name="customerId" value={c.customerId} />
                  <Checkbox name="batchEnabled" defaultSelected={c.batchEnabled}>Enable batch</Checkbox>
                  <SubmitButton pendingText="Saving…">Save</SubmitButton>
                </Form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
