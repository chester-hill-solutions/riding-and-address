import { and, eq } from 'drizzle-orm';
import { getDb } from '~/lib/db.server';
import { apiKeyMirror, customerBilling } from '~/db/schema';
import { mintKey, revokeKey, upsertCustomerProjection } from '~/lib/projection.server';
import { DEFAULT_FREE_MONTHLY_ALLOWANCE } from '~/lib/pricing';

export type CustomerBilling = typeof customerBilling.$inferSelect;

type ProjectionOverrides = {
  plan?: string;
  fuseLimit?: number;
  fuseSoftWarn?: boolean;
  batchEnabled?: boolean;
  stripeCustomerId?: string | null;
  label?: string;
};

/**
 * The portal's single owner of Customer billing mutations. D1 is canonical and the KV
 * projection is derived (ADR-0001), so every mutation writes both together; a route cannot
 * silently skip the projection. `label` is the one projection-only field (customer_billing has
 * no label column), so it is passed as an override instead of read back.
 */
async function projectRow(billing: CustomerBilling, overrides: ProjectionOverrides = {}) {
  await upsertCustomerProjection({
    id: billing.customerId,
    plan: overrides.plan ?? billing.plan,
    fuseLimit: overrides.fuseLimit ?? billing.fuseLimit,
    fuseSoftWarn: overrides.fuseSoftWarn ?? billing.fuseSoftWarn,
    batchEnabled: overrides.batchEnabled ?? billing.batchEnabled,
    stripeCustomerId: (overrides.stripeCustomerId ?? billing.stripeCustomerId) || undefined,
    label: overrides.label,
  });
}

async function getBillingForWorkspace(workspaceId: string): Promise<CustomerBilling | null> {
  const rows = await getDb()
    .select()
    .from(customerBilling)
    .where(eq(customerBilling.workspaceId, workspaceId))
    .limit(1);
  return rows[0] ?? null;
}

async function getBillingForCustomer(customerId: string): Promise<CustomerBilling | null> {
  const rows = await getDb()
    .select()
    .from(customerBilling)
    .where(eq(customerBilling.customerId, customerId))
    .limit(1);
  return rows[0] ?? null;
}

/** Signup: insert the Customer's billing row and project it in one step. */
export async function provisionCustomer(input: {
  workspaceId: string;
  customerId: string;
  label?: string;
}): Promise<CustomerBilling | null> {
  const inserted = await getDb()
    .insert(customerBilling)
    .values({
      workspaceId: input.workspaceId,
      customerId: input.customerId,
      plan: 'free',
      fuseLimit: DEFAULT_FREE_MONTHLY_ALLOWANCE,
      fuseSoftWarn: false,
      batchEnabled: false,
    })
    .returning();
  const billing = inserted[0] ?? null;
  if (billing) {
    try {
      await projectRow(billing, { label: input.label });
    } catch (error) {
      // The edge projection is eventually consistent (ADR-0001/0002); a Worker
      // outage must not block signup. Fuse/settings saves re-run the upsert.
      console.error(
        `customer projection failed during provisioning for ${input.customerId}`,
        error
      );
    }
  }
  return billing;
}

/** Fuse settings page: fuseLimit + fuseSoftWarn. */
export async function setFuse(input: {
  workspaceId: string;
  fuseLimit: number;
  fuseSoftWarn: boolean;
}): Promise<void> {
  const billing = await getBillingForWorkspace(input.workspaceId);
  if (!billing) throw new Error('Customer not found');
  await getDb()
    .update(customerBilling)
    .set({ fuseLimit: input.fuseLimit, fuseSoftWarn: input.fuseSoftWarn, updatedAt: new Date() })
    .where(eq(customerBilling.workspaceId, input.workspaceId));
  await projectRow(billing, { fuseLimit: input.fuseLimit, fuseSoftWarn: input.fuseSoftWarn });
}

/** Founder admin: batch access, promoting the plan to enterprise when enabled. */
export async function setBatchEnabled(input: {
  customerId: string;
  batchEnabled: boolean;
}): Promise<void> {
  const billing = await getBillingForCustomer(input.customerId);
  if (!billing) throw new Error('Customer not found');
  const plan = input.batchEnabled ? 'enterprise' : billing.plan;
  await getDb()
    .update(customerBilling)
    .set({ batchEnabled: input.batchEnabled, plan, updatedAt: new Date() })
    .where(eq(customerBilling.customerId, input.customerId));
  await projectRow(billing, { batchEnabled: input.batchEnabled, plan });
}

/** Stripe checkout.session.completed: activate the metered plan for the Stripe Customer. */
export async function activateMeteredPlan(
  stripeCustomerId: string
): Promise<CustomerBilling | null> {
  const rows = await getDb()
    .select()
    .from(customerBilling)
    .where(eq(customerBilling.stripeCustomerId, stripeCustomerId))
    .limit(1);
  const billing = rows[0];
  if (!billing) return null;
  await getDb()
    .update(customerBilling)
    .set({ plan: 'metered', updatedAt: new Date() })
    .where(eq(customerBilling.workspaceId, billing.workspaceId));
  try {
    await projectRow(billing, { plan: 'metered' });
  } catch (error) {
    console.error(`customer projection failed after checkout for ${billing.customerId}`, error);
  }
  return billing;
}

/** Billing page: persist the Stripe Customer id created when Checkout starts. */
export async function linkStripeCustomer(input: {
  workspaceId: string;
  stripeCustomerId: string;
}): Promise<void> {
  const billing = await getBillingForWorkspace(input.workspaceId);
  if (!billing) throw new Error('Customer not found');
  await getDb()
    .update(customerBilling)
    .set({ stripeCustomerId: input.stripeCustomerId, updatedAt: new Date() })
    .where(eq(customerBilling.workspaceId, input.workspaceId));
  try {
    await projectRow(billing, { stripeCustomerId: input.stripeCustomerId });
  } catch (error) {
    console.error(
      `customer projection failed after linking Stripe customer for ${billing.customerId}`,
      error
    );
  }
}

type MintedKey = Awaited<ReturnType<typeof mintKey>>;

/** Key page: mint the Worker key, then mirror it into D1. */
export async function mirrorKeyMinted(input: {
  workspaceId: string;
  customerId: string;
  kind: 'server' | 'browser';
  label?: string;
  origins?: string[];
}): Promise<MintedKey> {
  const origins = input.origins ?? [];
  const minted = await mintKey({
    kind: input.kind,
    customerId: input.customerId,
    label: input.label,
    origins: input.kind === 'browser' ? origins : undefined,
  });
  await getDb().insert(apiKeyMirror).values({
    id: minted.key.id,
    workspaceId: input.workspaceId,
    customerId: input.customerId,
    kind: input.kind,
    label: input.label,
    origins: origins.join(','),
  });
  return minted;
}

/** Key page: revoke the Worker key, then disable its D1 mirror row. */
export async function mirrorKeyRevoked(input: { workspaceId: string; id: string }): Promise<void> {
  await revokeKey(input.id);
  await getDb()
    .update(apiKeyMirror)
    .set({ disabled: true })
    .where(and(eq(apiKeyMirror.id, input.id), eq(apiKeyMirror.workspaceId, input.workspaceId)));
}
