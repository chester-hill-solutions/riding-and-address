import { Form, redirect } from 'react-router';
import type { Route } from './+types/app.billing';
import { isOwnerOrAdmin, requireCustomer, requireOwnerOrAdmin } from '~/lib/customer.server';
import { env } from '~/lib/env.server';
import {
  createBillingPortalSession,
  createMeteredCheckoutSession,
  getStripe,
} from '~/lib/stripe.server';
import { getDb } from '~/lib/db.server';
import { customerBilling } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { DEFAULT_FREE_MONTHLY_ALLOWANCE, formatMeteredUnitPrice } from '~/lib/pricing';
import { Panel } from '~/components/Panel';
import { FormFeedback } from '~/components/FormFeedback';
import { SubmitButton } from '~/components/SubmitButton';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'Billing · Riding Lookup portal' },
    { name: 'description', content: 'Plan, metered subscription, and Stripe Customer Portal.' },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { billing, membership } = await requireCustomer(request);
  return {
    billing,
    paidCheckoutEnabled: env().paidCheckoutEnabled,
    canManageBilling: isOwnerOrAdmin(membership),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { billing, membership } = await requireCustomer(request);
  requireOwnerOrAdmin(membership);

  const form = await request.formData();
  const intent = String(form.get('intent') || '');
  const base = env().baseUrl;

  if (intent === 'checkout') {
    const stripe = getStripe();
    if (!stripe) return { error: 'Stripe is not configured yet' };
    try {
      let stripeCustomerId = billing.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          metadata: { customerId: billing.customerId, workspaceId: billing.workspaceId },
        });
        stripeCustomerId = customer.id;
        // Keep plan free until checkout.session.completed (api.stripe-webhook).
        await getDb()
          .update(customerBilling)
          .set({ stripeCustomerId, updatedAt: new Date() })
          .where(eq(customerBilling.workspaceId, billing.workspaceId));
      }
      const url = await createMeteredCheckoutSession({
        stripeCustomerId,
        successUrl: `${base}/app/billing?ok=1`,
        cancelUrl: `${base}/app/billing`,
      });
      if (!url) return { error: 'Checkout unavailable — metered price is not configured' };
      return redirect(url);
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not start Checkout' };
    }
  }

  if (intent === 'portal') {
    if (!billing.stripeCustomerId) {
      return { error: 'No Stripe customer yet' };
    }
    try {
      const url = await createBillingPortalSession(
        billing.stripeCustomerId,
        `${base}/app/billing`
      );
      return redirect(url);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Could not open the Customer Portal',
      };
    }
  }

  return { error: 'Unknown intent' };
}

export default function BillingPage({ loaderData, actionData }: Route.ComponentProps) {
  const { billing, paidCheckoutEnabled, canManageBilling } = loaderData;
  return (
    <Panel title="Billing">
      <p className="muted">
        Free: {DEFAULT_FREE_MONTHLY_ALLOWANCE.toLocaleString('en-CA')} Billable units / UTC month.
        Overage for metered plan: {formatMeteredUnitPrice()} / successful call. Paid Checkout stays
        off until the product addendum is signed. Plan upgrades activate only after Stripe confirms
        Checkout.
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
      <FormFeedback error={actionData?.error} />
      {!canManageBilling ? (
        <p className="muted">Only owners and admins can change billing.</p>
      ) : !paidCheckoutEnabled ? (
        <p className="muted">
          <code>PAID_CHECKOUT_ENABLED</code> is false — free tier works; metered Checkout is locked.
        </p>
      ) : (
        <Form method="post">
          <input type="hidden" name="intent" value="checkout" />
          <SubmitButton pendingText="Redirecting to Stripe…">
            Start metered subscription
          </SubmitButton>
        </Form>
      )}
      {canManageBilling && billing?.stripeCustomerId ? (
        <Form method="post">
          <input type="hidden" name="intent" value="portal" />
          <SubmitButton className="secondary" pendingText="Opening portal…">
            Open Stripe Customer Portal
          </SubmitButton>
        </Form>
      ) : null}
    </Panel>
  );
}
