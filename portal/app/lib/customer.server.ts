import { eq } from 'drizzle-orm';
import { getDb } from '~/lib/db.server';
import { apiKeyMirror, customerBilling, workspaceMembers, workspaces } from '~/db/schema';
import { requireSessionUserId } from '~/lib/auth.server';
import { upsertCustomerProjection } from '~/lib/projection.server';
import { DEFAULT_FREE_MONTHLY_ALLOWANCE } from '~/lib/pricing';

export type CustomerBilling = typeof customerBilling.$inferSelect;
export type WorkspaceMembership = typeof workspaceMembers.$inferSelect;

export type CustomerContext = {
  userId: string;
  membership: WorkspaceMembership;
  billing: CustomerBilling;
};

export function customerIdForWorkspace(workspaceId: string): string {
  return `cust_${workspaceId.replace(/-/g, '').slice(0, 24)}`;
}

export async function ensureCustomerForUser(
  userId: string,
  orgName: string
): Promise<CustomerBilling | null> {
  const db = getDb();
  const memberships = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);

  if (memberships[0]) {
    return getBilling(memberships[0].workspaceId);
  }

  const workspaceId = crypto.randomUUID();
  const customerId = customerIdForWorkspace(workspaceId);
  const slug =
    orgName
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
  const inserted = await db
    .insert(customerBilling)
    .values({
      workspaceId,
      customerId,
      plan: 'free',
      fuseLimit: DEFAULT_FREE_MONTHLY_ALLOWANCE,
      fuseSoftWarn: false,
      batchEnabled: false,
    })
    .returning();
  const billing = inserted[0] ?? null;
  try {
    await upsertCustomerProjection({
      id: customerId,
      plan: 'free',
      fuseLimit: DEFAULT_FREE_MONTHLY_ALLOWANCE,
      fuseSoftWarn: false,
      batchEnabled: false,
      label: orgName,
    });
  } catch (error) {
    // The edge projection is eventually consistent (ADR 0001/0002); a Worker
    // outage must not block signup. Fuse/settings saves re-run the upsert.
    console.error(`customer projection failed during provisioning for ${customerId}`, error);
  }
  return billing;
}

/** Membership + billing for the user's Customer, or null when the user has neither. */
export async function getCustomerContext(userId: string): Promise<CustomerContext | null> {
  const membership = (
    await getDb()
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId))
      .limit(1)
  )[0];
  if (!membership) return null;
  const billing = await getBilling(membership.workspaceId);
  if (!billing) return null;
  return { userId, membership, billing };
}

/**
 * Loader/action guard: authenticated user with a Customer (membership + billing),
 * auto-provisioning a Customer if the user has none yet.
 */
export async function requireCustomer(request: Request): Promise<CustomerContext> {
  const userId = await requireSessionUserId(request);
  let context = await getCustomerContext(userId);
  if (!context) {
    await ensureCustomerForUser(userId, 'My organization');
    context = await getCustomerContext(userId);
  }
  if (!context) throw new Response('No Customer for this user', { status: 400 });
  return context;
}

/** Owners and admins may mint keys, change fuse, and manage billing. Members may not. */
export function isOwnerOrAdmin(membership: WorkspaceMembership): boolean {
  return membership.roleId === 'owner' || membership.roleId === 'admin';
}

export function requireOwnerOrAdmin(membership: WorkspaceMembership): void {
  if (!isOwnerOrAdmin(membership)) {
    throw new Response('Only owners/admins can perform this action', { status: 403 });
  }
}

export async function listKeys(workspaceId: string) {
  return getDb().select().from(apiKeyMirror).where(eq(apiKeyMirror.workspaceId, workspaceId));
}

export async function getBilling(workspaceId: string): Promise<CustomerBilling | null> {
  const rows = await getDb()
    .select()
    .from(customerBilling)
    .where(eq(customerBilling.workspaceId, workspaceId))
    .limit(1);
  return rows[0] || null;
}
