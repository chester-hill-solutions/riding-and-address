import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { CONSENT_DURATION_COPY } from '../portal/app/lib/consent-copy';
import { ACCESS_TOKEN_LIFETIME_MINUTES, ACCESS_TOKEN_LIFETIME_SECONDS } from '../portal/app/lib/oauth-lifetime';

/**
 * The consent screen's claim about how long an authorisation lasts.
 *
 * It used to say the authorisation lasted "until you revoke it", that "revoking is in the portal,
 * under settings", and that revocation "takes effect without the application's cooperation".
 * None of that was true: there is no revoke control in the portal, an issued access token cannot
 * be withdrawn early because it is a self-contained JWT, and signing out did not stop an agent
 * either because the resource server never consulted the session.
 *
 * A consent screen is where a person decides whether to trust an application with their account,
 * so a promise of a control that does not exist is not a cosmetic problem. These tests keep the
 * claim aligned with what this deployment actually does — they are the "regression coverage" the
 * issue asks for.
 *
 * The session clause is the newest of them: the resource server now checks the session an access
 * token was minted for (ADR-0011), so signing out ends the grant. A screen that still said the
 * opposite would be a screen that understates the control a person has.
 */
describe("the consent screen's claim about how long the authorisation lasts", () => {
  it('names the lifetime the authorization server is configured with', () => {
    // One constant, two importers: the server that mints the token and the screen that describes
    // it. A screen saying "an hour" while the server issues ten-minute tokens is a lie that only
    // shows up in a support ticket.
    expect(CONSENT_DURATION_COPY).toContain(String(ACCESS_TOKEN_LIFETIME_MINUTES));
    expect(readFileSync('portal/app/lib/auth.server.ts', 'utf8')).toContain(
      'ACCESS_TOKEN_LIFETIME_SECONDS'
    );
  });

  it('says the grant ends when the token expires, or when the person signs out', () => {
    // Both are true, and the second one only became true with ADR-0011.
    expect(CONSENT_DURATION_COPY).toMatch(/until this access token expires/);
    expect(CONSENT_DURATION_COPY).toMatch(/or until you sign out/i);
  });

  it('backs the sign-out claim with the resource server actually checking the session', () => {
    // The copy is a claim about the code. If the session check were removed, the screen would be
    // promising a control the deployment does not have — the same defect the copy was written to
    // avoid, in the opposite direction.
    const verifier = readFileSync('src/oauth-token.ts', 'utf8');
    expect(verifier).toContain('sessionIsLive');
    expect(verifier).toContain('FROM session WHERE id = ?');
  });

  it('points at no management page for revocation, because there is none', () => {
    // The old claim sent people to "the portal, under settings". Settings is the monthly usage
    // fuse and nothing else — the keys page revokes API keys, which are a different thing — and
    // there is no connected-applications page. If a revoke control is ever added, this test fails
    // and the copy is updated to point at it.
    expect(CONSENT_DURATION_COPY).not.toMatch(/under settings|in settings/);
    expect(readFileSync('portal/app/routes/app.settings.tsx', 'utf8')).not.toMatch(/revoke/i);
  });

  it('still does not promise a per-application revoke control', () => {
    // Signing out ends the grant; it does not create a control for revoking one application while
    // staying signed in. There is still no connected-applications page, so the copy must not imply
    // there is.
    expect(CONSENT_DURATION_COPY).toMatch(/no per-application revoke control/i);
  });

  it('is what the consent screen actually shows', () => {
    // Otherwise the statement could sit in a module while the page kept saying something else.
    expect(readFileSync('portal/app/routes/consent.tsx', 'utf8')).toContain('CONSENT_DURATION_COPY');
  });

  it('states a lifetime in minutes that is a whole number of minutes', () => {
    // The copy says "60 minutes from now". A lifetime that was not a whole number of minutes
    // would read as a fraction, and the seconds constant is the one the server is given.
    expect(Number.isInteger(ACCESS_TOKEN_LIFETIME_MINUTES)).toBe(true);
    expect(ACCESS_TOKEN_LIFETIME_MINUTES * 60).toBe(ACCESS_TOKEN_LIFETIME_SECONDS);
  });
});
