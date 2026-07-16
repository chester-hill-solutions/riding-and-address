import Stripe from 'stripe';
import { env } from '~/lib/env.server';

export function getStripe(): Stripe | null {
  const { stripeSecretKey } = env();
  if (!stripeSecretKey) return null;
  return new Stripe(stripeSecretKey);
}

export async function createMeteredCheckoutSession(opts: {
  stripeCustomerId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string | null> {
  const { paidCheckoutEnabled, stripePriceMetered } = env();
  if (!paidCheckoutEnabled) {
    throw new Error('Paid Checkout is disabled until the product addendum is ready (PAID_CHECKOUT_ENABLED).');
  }
  const stripe = getStripe();
  if (!stripe || !stripePriceMetered) {
    throw new Error('Stripe is not configured');
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: opts.stripeCustomerId,
    line_items: [{ price: stripePriceMetered }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  });
  return session.url;
}

export async function createBillingPortalSession(stripeCustomerId: string, returnUrl: string) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe is not configured');
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
  return session.url;
}
