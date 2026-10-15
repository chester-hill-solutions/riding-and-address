import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Form } from 'react-router';
import type { Route } from './+types/app.settings';
import { isOwnerOrAdmin, requireCustomer, requireOwnerOrAdmin } from '~/lib/customer.server';
import { setFuse } from '~/lib/billing-mutations.server';
import { DEFAULT_FREE_MONTHLY_ALLOWANCE } from '~/lib/pricing';
import { Panel } from '~/components/Panel';
import { FormFeedback } from '~/components/FormFeedback';
import { SubmitButton } from '~/components/SubmitButton';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'Fuse settings · CanCoder portal' },
    { name: 'description', content: 'Set the monthly Billable-unit fuse and soft-warn behaviour.' },
  ];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { billing, membership } = await requireCustomer(request, url);
  return { billing, canManageFuse: isOwnerOrAdmin(membership) };
}

export async function action({ request, url }: Route.ActionArgs) {
  const { billing, membership } = await requireCustomer(request, url);
  requireOwnerOrAdmin(membership);

  const form = await request.formData();
  const fuseLimit = parseInt(String(form.get('fuseLimit') || billing.fuseLimit), 10);
  const fuseSoftWarn = form.get('fuseSoftWarn') === 'on';

  if (!Number.isFinite(fuseLimit) || fuseLimit < 0) {
    return { error: 'Fuse must be a number of Billable units (0 or more)' };
  }

  try {
    await setFuse({ workspaceId: billing.workspaceId, fuseLimit, fuseSoftWarn });
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
          <Label htmlFor="fuseLimit">Monthly fuse (Billable units)</Label>
          <Input size="touch"
            id="fuseLimit"
            name="fuseLimit"
            type="number"
            min={0}
            defaultValue={billing?.fuseLimit ?? DEFAULT_FREE_MONTHLY_ALLOWANCE}
          />
          <Checkbox name="fuseSoftWarn" defaultSelected={Boolean(billing?.fuseSoftWarn)} className="mt-4">Soft-warn instead of hard-block</Checkbox>
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
