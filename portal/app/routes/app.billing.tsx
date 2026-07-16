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
      <p className="page-intro">
        You are on the <strong>{billing.plan}</strong> plan. Only successful HTTP 200 lookups and
        searches are billable.
      </p>
      <FormFeedback error={actionData?.error} />

      <div className="pricing-grid pricing-grid--portal">
        <article className={`price-card ${billing.plan === 'free' ? 'is-current' : ''}`}>
          <div className="price-card__heading">
            <h2>Free</h2>
            {billing.plan === 'free' ? <span className="current-badge">Current plan</span> : null}
          </div>
          <p className="price">$0</p>
          <p className="price-detail">No expiry</p>
          <ul className="check-list">
            <li>{DEFAULT_FREE_MONTHLY_ALLOWANCE.toLocaleString('en-CA')} calls each month</li>
            <li>Server and Browser keys</li>
            <li>Monthly usage fuse</li>
          </ul>
        </article>

        <article className={`price-card ${billing.plan === 'metered' ? 'is-current' : ''}`}>
          <div className="price-card__heading">
            <h2>Metered</h2>
            {billing.plan === 'metered' ? (
              <span className="current-badge">Current plan</span>
            ) : null}
          </div>
          <p className="price">
            {formatMeteredUnitPrice()}
            <span> USD</span>
          </p>
          <p className="price-detail">per successful call after the free allowance</p>
          <ul className="check-list">
            <li>Free allowance remains included</li>
            <li>4xx and 5xx responses are not billed</li>
            <li>Control spend with a hard fuse</li>
          </ul>
          {billing.plan === 'free' && canManageBilling && paidCheckoutEnabled ? (
            <Form method="post">
              <input type="hidden" name="intent" value="checkout" />
              <SubmitButton pendingText="Redirecting to Stripe…">
                Start metered subscription
              </SubmitButton>
            </Form>
          ) : null}
        </article>
      </div>

      {!canManageBilling ? (
        <p className="notice">Only workspace owners and admins can change the plan.</p>
      ) : billing.plan === 'free' && !paidCheckoutEnabled ? (
        <p className="notice">
          Metered upgrades are arranged after the product addendum is signed. Contact Chester Hill
          Solutions when you are ready to move beyond the free allowance.
        </p>
      ) : null}

      {canManageBilling && billing.stripeCustomerId ? (
        <div className="billing-actions">
          <div>
            <h2>Payment details and invoices</h2>
            <p>Update your payment method or download past invoices in Stripe.</p>
          </div>
          <Form method="post">
            <input type="hidden" name="intent" value="portal" />
            <SubmitButton className="secondary" pendingText="Opening portal…">
              Open billing portal
            </SubmitButton>
          </Form>
        </div>
      ) : null}
    </Panel>
  );
}
