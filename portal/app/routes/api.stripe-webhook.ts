import type { Route } from './+types/api.stripe-webhook';
import { env } from '~/lib/env.server';
import { getStripe } from '~/lib/stripe.server';
import { uploadCall } from '~/lib/upload.server';

/**
 * Release a paid upload only after a verified Stripe payment webhook.
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
    event = await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret);
  } catch (error) {
    console.error('Stripe webhook signature verification failed', error);
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.metadata?.purpose === 'sheet_upload') {
      const { uploadId, customerId } = session.metadata;
      if (!uploadId || !customerId) return new Response('Missing upload reference', { status: 400 });
      // Storage verifies the expected session, customer, currency, amount and paid status.
      // Failures remain non-2xx so Stripe retries; redirect URLs never grant processing access.
      await uploadCall(customerId, 'paid', uploadId, session);
    }
  }

  return Response.json({ ok: true });
}
