import { eq } from 'drizzle-orm';
import { getDb } from '~/lib/db.server';
import { apiKeyMirror, customerBilling, workspaceMembers, workspaces } from '~/db/schema';
import { upsertCustomerProjection } from '~/lib/projection.server';
import { DEFAULT_FREE_MONTHLY_ALLOWANCE } from '~/lib/pricing';

export function customerIdForWorkspace(workspaceId: string): string {
  return `cust_${workspaceId.replace(/-/g, '').slice(0, 24)}`;
}

export async function ensureCustomerForUser(userId: string, orgName: string) {
  const db = getDb();
  const memberships = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);

  if (memberships[0]) {
    const billing = await db
      .select()
      .from(customerBilling)
      .where(eq(customerBilling.workspaceId, memberships[0].workspaceId))
      .limit(1);
    return billing[0] || null;
  }

  const workspaceId = crypto.randomUUID();
  const customerId = customerIdForWorkspace(workspaceId);
  const slug = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || `org-${workspaceId.slice(0, 8)}`;

  await db.insert(workspaces).values({
    id: workspaceId,
    name: orgName,
    slug: `${slug}-${workspaceId.slice(0, 6)}`,
  });
  await db.insert(workspaceMembers).values({
    id: crypto.randomUUID(),
    workspaceId,
    userId,
    roleId: 'owner',
  });
  const billing = {
    workspaceId,
    customerId,
    plan: 'free',
    fuseLimit: DEFAULT_FREE_MONTHLY_ALLOWANCE,
    fuseSoftWarn: false,
    batchEnabled: false,
  };
  await db.insert(customerBilling).values(billing);
  await upsertCustomerProjection({
    id: customerId,
    plan: 'free',
    fuseLimit: DEFAULT_FREE_MONTHLY_ALLOWANCE,
    fuseSoftWarn: false,
    batchEnabled: false,
    label: orgName,
  });
  return billing;
}

export async function listKeys(workspaceId: string) {
  return getDb().select().from(apiKeyMirror).where(eq(apiKeyMirror.workspaceId, workspaceId));
}

export async function getBilling(workspaceId: string) {
  const rows = await getDb()
    .select()
    .from(customerBilling)
    .where(eq(customerBilling.workspaceId, workspaceId))
    .limit(1);
  return rows[0] || null;
}
