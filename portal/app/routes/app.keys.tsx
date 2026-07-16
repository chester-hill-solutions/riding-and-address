import { Form } from 'react-router';
import type { Route } from './+types/app.keys';
import { isOwnerOrAdmin, listKeys, requireCustomer, requireOwnerOrAdmin } from '~/lib/customer.server';
import { mintKey, revokeKey } from '~/lib/projection.server';
import { getDb } from '~/lib/db.server';
import { apiKeyMirror } from '~/db/schema';
import { and, eq } from 'drizzle-orm';
import { Panel } from '~/components/Panel';
import { FormFeedback } from '~/components/FormFeedback';
import { SubmitButton } from '~/components/SubmitButton';
import { CopyButton } from '~/components/CopyButton';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'API keys · Riding & Address portal' },
    { name: 'description', content: 'Mint and revoke Server and Browser keys for your Customer.' },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { billing, membership } = await requireCustomer(request);
  const keys = await listKeys(billing.workspaceId);
  return {
    keys,
    customerId: billing.customerId,
    canManageKeys: isOwnerOrAdmin(membership),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { billing, membership } = await requireCustomer(request);
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
      await revokeKey(id);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Could not revoke the key — try again.',
      };
    }
    await getDb()
      .update(apiKeyMirror)
      .set({ disabled: true })
      .where(and(eq(apiKeyMirror.id, id), eq(apiKeyMirror.workspaceId, billing.workspaceId)));
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
    const minted = await mintKey({
      kind,
      customerId: billing.customerId,
      label,
      origins: kind === 'browser' ? origins : undefined,
    });

    await getDb().insert(apiKeyMirror).values({
      id: minted.key.id,
      workspaceId: billing.workspaceId,
      customerId: billing.customerId,
      kind,
      label,
      origins: origins.join(','),
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
          <label htmlFor="kind">Kind</label>
          <select id="kind" name="kind" defaultValue="server">
            <option value="server">Server (sk_*)</option>
            <option value="browser">Browser (pk_*)</option>
          </select>
          <label htmlFor="label">Label</label>
          <input id="label" name="label" placeholder="Production backend" />
          <label htmlFor="origins">Origins (browser keys, comma-separated)</label>
          <input
            id="origins"
            name="origins"
            placeholder="https://app.example.com,https://*.example.com"
          />
          <SubmitButton pendingText="Minting…">Mint key</SubmitButton>
        </Form>
      ) : (
        <p className="muted">You can view keys; ask an owner or admin to mint or revoke.</p>
      )}

      <table>
        <thead>
          <tr>
            <th>Id</th>
            <th>Kind</th>
            <th>Label</th>
            <th>Origins</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id}>
              <td>
                <code>{key.id}</code>
              </td>
              <td>{key.kind}</td>
              <td>{key.label || '—'}</td>
              <td>{key.origins || '—'}</td>
              <td>
                {!key.disabled && canManageKeys ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="revoke" />
                    <input type="hidden" name="id" value={key.id} />
                    <SubmitButton className="secondary" pendingText="Revoking…">
                      Revoke
                    </SubmitButton>
                  </Form>
                ) : !key.disabled ? (
                  <span className="muted">active</span>
                ) : (
                  <span className="muted">revoked</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
