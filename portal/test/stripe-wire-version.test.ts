import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import Stripe from 'stripe';

import { STRIPE_API_VERSION } from '~/lib/stripe-version';

/**
 * The Stripe wire version, observed rather than declared.
 *
 * The pin in `stripe-version.ts` is the reason a dependency bump cannot move what this deployment
 * sends. That is a claim about *behaviour* — "the SDK sends this version" — and a claim about
 * behaviour is not established by reading the constant that states it. So the SDK is pointed at a
 * local server here, a request is made, and the `Stripe-Version` header it actually sends is read.
 *
 * The second test is the other half: the pin is the newest version the SDK knows. When a future
 * SDK moves its own default, this fails — which is the point. It is the signal that the wire
 * version is about to change, arriving before the change rather than after it.
 */
describe('the Stripe wire version', () => {
  it('is the version the SDK sends on the wire', async () => {
    const seen: (string | undefined)[] = [];
    const server = createServer((request, response) => {
      const header = request.headers['stripe-version'];
      seen.push(Array.isArray(header) ? header[0] : header);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ id: 'cs_test_local', object: 'checkout.session' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const stripe = new Stripe('sk_test_local_only', {
        apiVersion: STRIPE_API_VERSION,
        host: '127.0.0.1',
        port,
        protocol: 'http',
      });
      await stripe.checkout.sessions.create({
        mode: 'payment',
        success_url: 'https://example.test/paid',
        cancel_url: 'https://example.test/cancelled',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: 500,
              product_data: { name: 'A row' },
            },
          },
        ],
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(STRIPE_API_VERSION);
  });

  it('is the newest version the SDK knows, so a bump cannot move the wire version quietly', () => {
    expect(Stripe.API_VERSION).toBe(STRIPE_API_VERSION);
  });
});
