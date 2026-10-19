import Stripe from 'stripe';
import { env } from '~/lib/env.server';

/**
 * The Stripe API version this deployment talks.
 *
 * Pinned deliberately, and it is not decoration. Constructed as `new Stripe(key)`, the SDK sends
 * whatever API version *it* defaults to — so a Dependabot bump of `stripe` silently moves the wire
 * version for every call, and the SDK's types cannot catch that: the response shapes, the Checkout
 * Session fields and the webhook payloads all change underneath a green typecheck. `18.5.0` defaults
 * to this value, so pinning it is behaviour-preserving today, and from here an API version change is
 * a decision someone makes rather than a side effect of a version bump.
 */
const STRIPE_API_VERSION = '2025-08-27.basil';

export function getStripe(): Stripe | null {
  const { stripeSecretKey } = env();
  if (!stripeSecretKey) return null;
  return new Stripe(stripeSecretKey, { apiVersion: STRIPE_API_VERSION });
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

/** A single paid upload; the immutable server-side quote determines the whole-cent amount. */
export async function createUploadCheckoutSession(opts: {
  id: string; customerId: string; stripeCustomerId: string; chargeCents: number; returnUrl: string; expiresAt: number;
}) {
  if (!env().uploadCheckoutEnabled) throw new Error('Paid uploads are not enabled yet.');
  const stripe = getStripe();
  if (!stripe || !Number.isSafeInteger(opts.chargeCents) || opts.chargeCents < 50) throw new Error('Upload checkout is unavailable.');
  return stripe.checkout.sessions.create({
    mode: 'payment', customer: opts.stripeCustomerId, payment_method_types: ['card'],
    client_reference_id: opts.id,
    metadata: { purpose: 'sheet_upload', uploadId: opts.id, customerId: opts.customerId },
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: opts.chargeCents,
      product_data: { name: 'CanCoder sheet upload', description: 'One-time upload payment. Unused funds and unresolved paid rows remain as account credit.' } } }],
    success_url: opts.returnUrl + '?paid=1', cancel_url: opts.returnUrl,
    expires_at: opts.expiresAt,
  }, { idempotencyKey: `upload-checkout:${opts.id}` });
}
