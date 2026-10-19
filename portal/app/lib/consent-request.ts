import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';

/**
 * The provider's own checker, re-exported so a test can sign a query and prove it valid
 * against the same function this module uses — rather than against a copy of it.
 */
export { verifyOAuthQueryParams };

/**
 * The authorisation request a consent link is asking a person to approve.
 */
export type ConsentRequest = {
  /**
   * The client asking. For a Client ID Metadata Document client this is the HTTPS URL of the
   * document that describes it — the thing MCP says to display.
   */
  clientId: string;
  /** The scopes asked for, split on spaces. */
  scopes: string[];
};

/**
 * Read the authorisation request out of a consent link.
 *
 * ## There is no `code` in a consent link
 *
 * The link the authorization server redirects to carries the *authorization request's* own
 * parameters, signed: `client_id`, `scope`, `redirect_uri`, `state`, the PKCE challenge — plus
 * `ba_iat`, `ba_param` and `sig`. It does **not** carry a `code`, because the code is issued
 * *after* the consent is accepted. There is nothing to redeem at this point.
 *
 * A loader that requires a `code` therefore refuses every real link. That is what this one did:
 * a person who followed their agent's authorisation link was told "Nothing to authorise" for a
 * request the provider had just signed, and the agent could never be authorised at all. The
 * check survived because nothing in the test suite walked the flow with a browser — a script
 * posts to the *action*, which never looked at a `code`.
 *
 * ## The signature is checked before anything is displayed
 *
 * The provider's own documentation says to verify the signature with the server's secret
 * before a consent page renders, and there is a reason beyond the rule: the client name and
 * the scopes on the screen come from these parameters. A link with a tampered `client_id`
 * would otherwise put a different application's name in front of a person deciding whether to
 * trust it.
 *
 * A valid signature does not replace the client or session checks. The route still resolves
 * the client through the provider and still requires a signed-in user.
 *
 * @param oauthQuery The query string of the consent request, as received.
 * @param secret The provider's current auth secret.
 * @returns The request, or null when the link is not one this deployment issued.
 */
export async function readConsentRequest(
  oauthQuery: string,
  secret: string,
): Promise<ConsentRequest | null> {
  // Fail closed. Without a secret nothing can be verified, and a consent screen that shows an
  // unverified request is worse than one that shows nothing.
  if (!secret) return null;

  if (!(await verifyOAuthQueryParams(oauthQuery, secret))) return null;

  const params = new URLSearchParams(oauthQuery);
  const clientId = params.get('client_id');
  if (!clientId) return null;

  return {
    clientId,
    scopes: (params.get('scope') ?? '').split(' ').filter(Boolean),
  };
}
