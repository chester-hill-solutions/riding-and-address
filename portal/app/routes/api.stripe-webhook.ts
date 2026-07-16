import { eq } from 'drizzle-orm';
import type { Route } from './+types/api.stripe-webhook';
import { getDb } from '~/lib/db.server';
import { customerBilling } from '~/db/schema';
import { env } from '~/lib/env.server';
import { getStripe } from '~/lib/stripe.server';
import { upsertCustomerProjection } from '~/lib/projection.server';

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

    const rows = await getDb()
      .select()
      .from(customerBilling)
      .where(eq(customerBilling.stripeCustomerId, stripeCustomerId))
      .limit(1);
    const billing = rows[0];
    if (!billing) {
      console.warn(`Stripe checkout completed for unknown customer ${stripeCustomerId}`);
      return Response.json({ ok: true, skipped: 'unknown_customer' });
    }

    await getDb()
      .update(customerBilling)
      .set({ plan: 'metered', updatedAt: new Date() })
      .where(eq(customerBilling.workspaceId, billing.workspaceId));

    try {
      await upsertCustomerProjection({
        id: billing.customerId,
        plan: 'metered',
        fuseLimit: billing.fuseLimit,
        fuseSoftWarn: billing.fuseSoftWarn,
        batchEnabled: billing.batchEnabled,
        stripeCustomerId,
      });
    } catch (error) {
      console.error(
        `customer projection failed after checkout for ${billing.customerId}`,
        error
      );
    }
  }

  return Response.json({ ok: true });
}
