import { Form, redirect, useLoaderData } from 'react-router';
import type { Route } from './+types/app.billing';
import { requireSessionUserId } from '~/lib/auth.server';
import { getBilling } from '~/lib/customer.server';
import { env } from '~/lib/env.server';
import { createBillingPortalSession, createMeteredCheckoutSession, getStripe } from '~/lib/stripe.server';
import { getDb } from '~/lib/db.server';
import { customerBilling, workspaceMembers } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { upsertCustomerProjection } from '~/lib/projection.server';

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireSessionUserId(request);
  const membership = (
    await getDb().select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId)).limit(1)
  )[0];
  if (!membership) throw new Response('No org', { status: 400 });
  const billing = await getBilling(membership.workspaceId);
  return {
    billing,
    paidCheckoutEnabled: env().paidCheckoutEnabled,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireSessionUserId(request);
  const membership = (
    await getDb().select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId)).limit(1)
  )[0];
  if (!membership) throw new Response('No org', { status: 400 });
  const billing = await getBilling(membership.workspaceId);
  if (!billing) throw new Response('No billing', { status: 400 });

  const form = await request.formData();
  const intent = String(form.get('intent') || '');
  const base = env().baseUrl;

  if (intent === 'checkout') {
    const stripe = getStripe();
    if (!stripe) throw new Response('Stripe not configured', { status: 503 });
    let stripeCustomerId = billing.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        metadata: { customerId: billing.customerId, workspaceId: billing.workspaceId },
      });
      stripeCustomerId = customer.id;
      await getDb()
        .update(customerBilling)
        .set({ stripeCustomerId, plan: 'metered', updatedAt: new Date() })
        .where(eq(customerBilling.workspaceId, billing.workspaceId));
      await upsertCustomerProjection({
        id: billing.customerId,
        plan: 'metered',
        fuseLimit: billing.fuseLimit,
        fuseSoftWarn: billing.fuseSoftWarn,
        batchEnabled: billing.batchEnabled,
        stripeCustomerId,
      });
    }
    const url = await createMeteredCheckoutSession({
      stripeCustomerId,
      successUrl: `${base}/app/billing?ok=1`,
      cancelUrl: `${base}/app/billing`,
    });
    if (!url) throw new Response('Checkout unavailable', { status: 503 });
    return redirect(url);
  }

  if (intent === 'portal') {
    if (!billing.stripeCustomerId) {
      return { error: 'No Stripe customer yet' };
    }
    const url = await createBillingPortalSession(billing.stripeCustomerId, `${base}/app/billing`);
    return redirect(url);
  }

  return { error: 'Unknown intent' };
}

export default function BillingPage() {
  const { billing, paidCheckoutEnabled } = useLoaderData<typeof loader>();
  return (
    <section className="panel">
      <h1>Billing</h1>
      <p className="muted">
        Free: 1 000 Billable units / UTC month. Overage for metered plan: $0.005 / successful call.
        Paid Checkout stays off until the product addendum is signed.
      </p>
      <p>
        Plan: <code>{billing?.plan}</code>
        {billing?.stripeCustomerId ? (
          <>
            {' '}
            · Stripe <code>{billing.stripeCustomerId}</code>
          </>
        ) : null}
      </p>
      {!paidCheckoutEnabled ? (
        <p className="muted">
          <code>PAID_CHECKOUT_ENABLED</code> is false — free tier works; metered Checkout is locked.
        </p>
      ) : (
        <Form method="post">
          <input type="hidden" name="intent" value="checkout" />
          <button type="submit">Start metered subscription</button>
        </Form>
      )}
      {billing?.stripeCustomerId ? (
        <Form method="post">
          <input type="hidden" name="intent" value="portal" />
          <button type="submit" className="secondary">
            Open Stripe Customer Portal
          </button>
        </Form>
      ) : null}
    </section>
  );
}
