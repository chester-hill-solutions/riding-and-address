import { Card } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Form, redirect } from 'react-router';
import type { Route } from './+types/app.billing';
import { isOwnerOrAdmin, requireCustomer, requireOwnerOrAdmin } from '~/lib/customer.server';
import { env } from '~/lib/env.server';
import {
  createBillingPortalSession,
} from '~/lib/stripe.server';
import { DEFAULT_FREE_MONTHLY_ALLOWANCE, formatMeteredUnitPrice } from '~/lib/pricing';
import { ActionLink } from '~/components/ActionLink';
import { Panel } from '~/components/Panel';
import { FormFeedback } from '~/components/FormFeedback';
import { SubmitButton } from '~/components/SubmitButton';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'Billing · CanCoder portal' },
    { name: 'description', content: 'Usage-based billing and Stripe Customer Portal.' },
  ];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { billing, membership } = await requireCustomer(request, url);
  return {
    billing,
    canManageBilling: isOwnerOrAdmin(membership),
  };
}

export async function action({ request, url }: Route.ActionArgs) {
  const { billing, membership } = await requireCustomer(request, url);
  requireOwnerOrAdmin(membership);

  const form = await request.formData();
  const intent = String(form.get('intent') || '');
  const base = env().baseUrl;

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
  const { billing, canManageBilling } = loaderData;
  return (
    <Panel title="Billing">
      <p className="page-intro">
        You are on the <strong>{billing.plan}</strong> plan. Only successful HTTP 200 lookups and
        searches are billable.
      </p>
      <FormFeedback error={actionData?.error} />

      <div className="pricing-grid pricing-grid--portal">
        <Card role="article" className={`price-card gap-0 p-6 ${billing.plan === 'free' ? 'is-current' : ''}`}>
          <div className="price-card__heading">
            <h2>Free</h2>
            {billing.plan === 'free' ? <Badge variant="secondary">Current plan</Badge> : null}
          </div>
          <p className="price">$0</p>
          <p className="price-detail">No expiry</p>
          <ul className="check-list">
            <li>{DEFAULT_FREE_MONTHLY_ALLOWANCE.toLocaleString('en-CA')} calls each month</li>
            <li>Server and Browser keys</li>
            <li>Monthly usage fuse</li>
          </ul>
        </Card>

        <Card role="article" className={`price-card gap-0 p-6 ${billing.plan === 'metered' ? 'is-current' : ''}`}>
          <div className="price-card__heading">
            <h2>Pay per upload</h2>
            {billing.plan === 'metered' ? (
              <Badge variant="secondary">Current plan</Badge>
            ) : null}
          </div>
          <p className="price">
            {formatMeteredUnitPrice()}
            <span> USD</span>
          </p>
          <p className="price-detail">per successful call after the free allowance</p>
          <ul className="check-list">
            <li>No fixed monthly fee</li>
            <li>Free allowance remains included</li>
            <li>4xx and 5xx responses are not billed</li>
            <li>Control spend with a hard fuse</li>
          </ul>
          <ActionLink to="/app/uploads">Upload a sheet</ActionLink>
        </Card>
      </div>

      <p className="notice">Review your sheet’s price before a one-time payment. Failed paid rows become account credit. No monthly subscription is required.</p>

      {canManageBilling && billing.stripeCustomerId ? (
        <div className="billing-actions">
          <div>
            <h2>Payment details and invoices</h2>
            <p>Update your payment method or download past invoices in Stripe.</p>
          </div>
          <Form method="post">
            <input type="hidden" name="intent" value="portal" />
            <SubmitButton variant="secondary" pendingText="Opening portal…">
              Open billing portal
            </SubmitButton>
          </Form>
        </div>
      ) : null}
    </Panel>
  );
}
