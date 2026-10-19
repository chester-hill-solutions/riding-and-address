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
 * be withdrawn early because it is a self-contained JWT, and signing out does not stop an agent
 * either because the resource server never consults the session.
 *
 * A consent screen is where a person decides whether to trust an application with their account,
 * so a promise of a control that does not exist is not a cosmetic problem. These tests keep the
 * claim aligned with what this deployment actually does — they are the "regression coverage" the
 * issue asks for.
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

  it('says an issued token cannot be withdrawn early, because it cannot be', () => {
    // The resource server verifies the signature, the issuer, the audience and the expiry.
    // There is no server-side revocation to hook into: the token points at nothing revocable.
    expect(CONSENT_DURATION_COPY).toMatch(/cannot be withdrawn early/);
  });

  it('points at no management page for revocation, because there is none', () => {
    // The old claim sent people to "the portal, under settings". Settings is the monthly usage
    // fuse and nothing else — the keys page revokes API keys, which are a different thing — and
    // there is no connected-applications page. If a revoke control is ever added, this test fails
    // and the copy is updated to point at it.
    expect(CONSENT_DURATION_COPY).not.toMatch(/under settings|in settings/);
    expect(readFileSync('portal/app/routes/app.settings.tsx', 'utf8')).not.toMatch(/revoke/i);
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
