import Stripe from 'stripe';
import { env } from '~/lib/env.server';
import { STRIPE_API_VERSION } from '~/lib/stripe-version';

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
