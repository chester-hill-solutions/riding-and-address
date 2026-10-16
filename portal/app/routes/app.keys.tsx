import { useState } from 'react';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { NativeSelect } from '~/components/ui/native-select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '~/components/ui/table';
import { Form } from 'react-router';
import type { Route } from './+types/app.keys';
import { isOwnerOrAdmin, listKeys, requireCustomer, requireOwnerOrAdmin } from '~/lib/customer.server';
import { mirrorKeyMinted, mirrorKeyRevoked } from '~/lib/billing-mutations.server';
import { getDb } from '~/lib/db.server';
import { apiKeyMirror } from '~/db/schema';
import { and, eq } from 'drizzle-orm';
import { Panel } from '~/components/Panel';
import { FormFeedback } from '~/components/FormFeedback';
import { SubmitButton } from '~/components/SubmitButton';
import { claimFreeAllowance } from '~/lib/upload.server';
import { CopyButton } from '~/components/CopyButton';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'API keys · CanCoder portal' },
    { name: 'description', content: 'Mint and revoke Server and Browser keys for your Customer.' },
  ];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { billing, membership } = await requireCustomer(request, url);
  const keys = await listKeys(billing.workspaceId);
  return {
    keys,
    customerId: billing.customerId,
    canManageKeys: isOwnerOrAdmin(membership),
  };
}

export async function action({ request, url }: Route.ActionArgs) {
  const { userId, billing, membership } = await requireCustomer(request, url);
  requireOwnerOrAdmin(membership);
  const form = await request.formData();
  const intent = String(form.get('intent') || '');

  if (intent === 'revoke') {
    const id = String(form.get('id') || '');
    const owned = await getDb()
      .select()
      .from(apiKeyMirror)
      .where(and(eq(apiKeyMirror.id, id), eq(apiKeyMirror.workspaceId, billing.workspaceId)))
      .limit(1);
    if (!owned[0]) {
      return { error: 'Key not found in this organization' };
    }
    try {
      await mirrorKeyRevoked({ workspaceId: billing.workspaceId, id });
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Could not revoke the key — try again.',
      };
    }
    return { ok: true as const, message: 'Key revoked.' };
  }

  const kind = String(form.get('kind') || 'server') as 'server' | 'browser';
  const label = String(form.get('label') || '') || undefined;
  const origins = String(form.get('origins') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (kind === 'browser' && origins.length === 0) {
    return { error: 'Browser keys require at least one origin' };
  }

  try {
    if (billing.plan === 'free' && !(await claimFreeAllowance(userId, billing.customerId))) {
      return { error: 'This email identity already has a free allowance in another workspace. Use that workspace or contact support.' };
    }
    const minted = await mirrorKeyMinted({
      workspaceId: billing.workspaceId,
      customerId: billing.customerId,
      kind,
      label,
      origins,
    });

    return {
      secret: minted.secret,
      kind,
      note:
        kind === 'server'
          ? 'Copy this Server key now — it is shown once and stored hashed on the Worker.'
          : 'Browser key is public; security is the origin allowlist.',
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Could not mint the key — the Worker projection API may be unavailable.',
    };
  }
}

export default function KeysPage({ loaderData, actionData }: Route.ComponentProps) {
  const { keys, canManageKeys } = loaderData;
  const [kind, setKind] = useState<'server' | 'browser'>('server');

  return (
    <Panel title="API keys">
      <p className="muted">
        Server keys (<code>sk_*</code>) call lookup/geocode with <code>Authorization: Bearer</code>.
        Browser keys (<code>pk_*</code>) are for <code>/api/search</code> and <code>/embed.js</code>{' '}
        only. Owners and admins manage keys.
      </p>

      <FormFeedback
        error={actionData && 'error' in actionData ? actionData.error : null}
        success={
          actionData && 'message' in actionData && actionData.message ? actionData.message : null
        }
      />
      {actionData && 'secret' in actionData && actionData.secret ? (
        <div className="secret-reveal">
          <strong>{actionData.note}</strong>
          <br />
          <code>{actionData.secret}</code>
          <CopyButton value={actionData.secret} label="Copy key" />
        </div>
      ) : null}

      {canManageKeys ? (
        <Form method="post">
          <input type="hidden" name="intent" value="create" />
          <Label htmlFor="kind">Kind</Label>
          <NativeSelect size="touch" id="kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value === 'browser' ? 'browser' : 'server')}>
            <option value="server">Server (sk_*)</option>
            <option value="browser">Browser (pk_*)</option>
          </NativeSelect>
          <Label htmlFor="label">Label</Label>
          <Input size="touch" id="label" name="label" placeholder="Production backend" />
          {kind === 'browser' ? <>
          <Label htmlFor="origins">Allowed websites (comma-separated)</Label>
          <Input size="touch"
            id="origins"
            name="origins"
            placeholder="https://app.example.com"
            required
          />
          <p className="field-hint">Browser keys only work on the websites you list here.</p>
          </> : null}
          <SubmitButton pendingText="Creating…">Create key</SubmitButton>
        </Form>
      ) : (
        <p className="muted">You can view keys; ask an owner or admin to create or revoke them.</p>
      )}

      {keys.length === 0 ? <div className="empty-state">
        <h2>No API keys yet</h2>
        <p>Your keys will appear here once an owner or admin creates one.</p>
      </div> : <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Id</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Origins</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((key) => (
            <TableRow key={key.id}>
              <TableCell>
                <code>{key.id}</code>
              </TableCell>
              <TableCell>{key.kind}</TableCell>
              <TableCell>{key.label || '—'}</TableCell>
              <TableCell>{key.origins || '—'}</TableCell>
              <TableCell>
                {!key.disabled && canManageKeys ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="revoke" />
                    <input type="hidden" name="id" value={key.id} />
                    <SubmitButton variant="secondary" pendingText="Revoking…">
                      Revoke
                    </SubmitButton>
                  </Form>
                ) : !key.disabled ? (
                  <span className="muted">active</span>
                ) : (
                  <span className="muted">revoked</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>}
    </Panel>
  );
}
