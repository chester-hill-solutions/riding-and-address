import { ACCESS_TOKEN_LIFETIME_MINUTES } from './oauth-lifetime';

/**
 * What the consent screen says about how long the authorisation lasts.
 *
 * **Every clause here is a fact about this deployment, and each one is checked by a test.**
 * The screen used to say "It will act as you until you revoke it. Revoking is in the portal,
 * under settings, and takes effect without the application's cooperation." That was three claims
 * and none of them was true:
 *
 *   - **There is no revoke control in the portal.** The settings page is the monthly usage fuse
 *     and nothing else; the keys page revokes API keys, which are a different thing entirely;
 *     and there is no connected-applications page. Sending a person to look for a button that
 *     does not exist is worse than saying nothing.
 *   - **An issued access token cannot be withdrawn early.** It is a JWT verified against the
 *     JWKS, and the resource server checks the signature, the issuer, the audience and the
 *     expiry — there is no server-side revocation to hook into, because the token does not
 *     point at anything revocable.
 *   - **Signing out does not stop it either.** The token carries the session id it was minted
 *     for, but the resource server never consults the session, so an agent keeps working until
 *     the token expires. Worth knowing before anyone signs out expecting the agent to stop.
 *
 * So the honest answer, and the one a person can act on, is the lifetime itself.
 *
 * It lives in a module rather than inline in the route so the test that keeps it honest can
 * read it — a claim that only exists as JSX is a claim nothing checks.
 */
export const CONSENT_DURATION_COPY =
  `It will act as you until this access token expires — ${ACCESS_TOKEN_LIFETIME_MINUTES} minutes ` +
  'from now. An access token is signed, so it cannot be withdrawn early, and there is no ' +
  'per-application revoke control in the portal yet.';
