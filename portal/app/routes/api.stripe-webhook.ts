import type { Route } from './+types/api.stripe-webhook';
import { env } from '~/lib/env.server';
import { getStripe } from '~/lib/stripe.server';
import { activateMeteredPlan } from '~/lib/billing-mutations.server';

/**
 * Activate metered plan only after Stripe confirms Checkout — not when Checkout starts.
 * Register this URL in Stripe and set STRIPE_WEBHOOK_SECRET.
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const stripe = getStripe();
  const webhookSecret = env().stripeWebhookSecret;
  if (!stripe || !webhookSecret) {
    return new Response('Stripe webhook not configured', { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature', { status: 400 });
  }

  const payload = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error('Stripe webhook signature verification failed', error);
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const stripeCustomerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (!stripeCustomerId) {
      return Response.json({ ok: true, skipped: 'no_customer' });
    }

    const billing = await activateMeteredPlan(stripeCustomerId);
    if (!billing) {
      console.warn(`Stripe checkout completed for unknown customer ${stripeCustomerId}`);
      return Response.json({ ok: true, skipped: 'unknown_customer' });
    }
  }

  return Response.json({ ok: true });
}
