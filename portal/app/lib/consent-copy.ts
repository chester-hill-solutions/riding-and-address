import { ACCESS_TOKEN_LIFETIME_MINUTES } from './oauth-lifetime';

/**
 * What the consent screen says about how long the authorisation lasts.
 *
 * **Every clause here is a fact about this deployment, and each one is checked by a test.**
 *
 * The screen used to say "It will act as you until you revoke it. Revoking is in the portal,
 * under settings, and takes effect without the application's cooperation." That was three claims
 * and none of them was true:
 *
 *   - **There is no revoke control in the portal.** The settings page is the monthly usage fuse
 *     and nothing else; the keys page revokes API keys, which are a different thing entirely;
 *     and there is no connected-applications page. Sending a person to look for a button that
 *     does not exist is worse than saying nothing.
 *   - **An issued access token cannot be withdrawn early.** It is a JWT verified against the
 *     JWKS, and there is no server-side record of the token to delete — the token does not point
 *     at anything revocable.
 *   - **Signing out did not stop it either.** The token carries the session id it was minted for,
 *     but the resource server never consulted the session, so an agent kept working until the
 *     token expired.
 *
 * The third of those is no longer true, and the copy had to change with it rather than keep
 * describing the old behaviour: **the resource server now checks the session** (ADR-0011), so
 * signing out ends the grant. The token itself still cannot be withdrawn — that part is a property
 * of a self-contained JWT, not a gap — but the *grant* now ends when the session does, which is
 * what a person means by "I signed out".
 *
 * So the honest answer is the two things that end it, and the one control that does not exist.
 *
 * It lives in a module rather than inline in the route so the test that keeps it honest can
 * read it — a claim that only exists as JSX is a claim nothing checks.
 */
export const CONSENT_DURATION_COPY =
  `It will act as you until this access token expires — ${ACCESS_TOKEN_LIFETIME_MINUTES} minutes ` +
  'from now — or until you sign out of CanCoder, whichever comes first. There is no ' +
  'per-application revoke control in the portal yet.';
