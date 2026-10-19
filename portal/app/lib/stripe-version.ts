/**
 * The Stripe API version this deployment talks.
 *
 * Pinned deliberately, and it is not decoration. Constructed as `new Stripe(key)`, the SDK sends
 * whatever API version *it* defaults to — so a Dependabot bump of `stripe` silently moves the wire
 * version for every call, and the SDK's types cannot catch that: the response shapes, the Checkout
 * Session fields and the webhook payloads all change underneath a green typecheck. `18.5.0` defaults
 * to this value, so pinning it is behaviour-preserving today, and from here an API version change is
 * a decision someone makes rather than a side effect of a version bump.
 *
 * **It is in its own module so a test can read it without the Worker.** `stripe.server.ts` reaches
 * for the Cloudflare environment, which does not exist outside a request, so importing it from a
 * plain test would fail before it could assert anything. The constant is the thing worth checking,
 * and the test that checks it is in `portal/test/stripe-wire-version.test.ts` — it points the SDK at
 * a local server and reads the `Stripe-Version` header the SDK actually sends, so the pin is
 * observed rather than declared.
 */
export const STRIPE_API_VERSION = '2025-08-27.basil';
