import { Form, useActionData, useLoaderData } from 'react-router';
import type { Route } from './+types/app.keys';
import { requireSessionUserId } from '~/lib/auth.server';
import { getBilling, listKeys } from '~/lib/customer.server';
import { mintKey, revokeKey } from '~/lib/projection.server';
import { getDb } from '~/lib/db.server';
import { apiKeyMirror, workspaceMembers } from '~/db/schema';
import { eq } from 'drizzle-orm';

async function workspaceForUser(userId: string) {
  const memberships = await getDb()
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);
  if (!memberships[0]) throw new Response('No organization', { status: 400 });
  const billing = await getBilling(memberships[0].workspaceId);
  if (!billing) throw new Response('No billing row', { status: 400 });
  return billing;
}

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireSessionUserId(request);
  const billing = await workspaceForUser(userId);
  const keys = await listKeys(billing.workspaceId);
  return { keys, customerId: billing.customerId };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireSessionUserId(request);
  const billing = await workspaceForUser(userId);
  const form = await request.formData();
  const intent = String(form.get('intent') || '');

  if (intent === 'revoke') {
    const id = String(form.get('id') || '');
    await revokeKey(id);
    await getDb()
      .update(apiKeyMirror)
      .set({ disabled: true })
      .where(eq(apiKeyMirror.id, id));
    return { ok: true };
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
}

export default function KeysPage() {
  const { keys } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <section className="panel">
      <h1>API keys</h1>
      <p className="muted">
        Server keys (<code>sk_*</code>) call lookup/geocode with <code>Authorization: Bearer</code>.
        Browser keys (<code>pk_*</code>) are for <code>/api/search</code> and <code>/embed.js</code>{' '}
        only.
      </p>

      {actionData && 'secret' in actionData && actionData.secret ? (
        <p>
          <strong>{actionData.note}</strong>
          <br />
          <code>{actionData.secret}</code>
        </p>
      ) : null}
      {actionData && 'error' in actionData && actionData.error ? (
        <p className="error">{actionData.error}</p>
      ) : null}

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
        <input id="origins" name="origins" placeholder="https://app.example.com,https://*.example.com" />
        <button type="submit">Mint key</button>
      </Form>

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
                {!key.disabled ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="revoke" />
                    <input type="hidden" name="id" value={key.id} />
                    <button type="submit" className="secondary">
                      Revoke
                    </button>
                  </Form>
                ) : (
                  <span className="muted">revoked</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
