/**
 * The OAuth scopes this API issues, and what each one lets an agent do.
 *
 * Here rather than in the portal, because the scopes name **API capabilities** — they are the
 * vocabulary of the thing being protected, not of the login screen. Both ends read this one list:
 * the authorization server publishes it as `scopes_supported`, and the protected-resource metadata
 * publishes it as the scopes a token may carry. Two copies of it would drift, and the drift would be
 * invisible — a client would be told it may request a scope the resource server does not recognise,
 * and the failure would appear at the first tool call rather than at consent.
 *
 * `ridings:area` is deliberately separate from `ridings:lookup`. A lookup is half a cent and an area
 * search can be $8, so one approval must not quietly authorise both. MCP asks a server to treat a
 * broader scope as implying narrower ones; nothing here implies anything, because nothing here is a
 * superset of anything else.
 */
export const MCP_SCOPES = ['ridings:lookup', 'ridings:area'] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

/**
 * The scope a basic lookup needs, and the one a challenge names.
 *
 * Named rather than indexed so the challenge cannot silently start naming a different scope if the
 * list is reordered.
 */
export const LOOKUP_SCOPE: McpScope = 'ridings:lookup';

/** Every scope, as the space-separated string the OAuth wire format uses. */
export function scopesSupported(): string {
  return MCP_SCOPES.join(' ');
}

/**
 * Whether a token carrying `granted` may perform an operation requiring `required`.
 *
 * No implication, by design — see the note above. MCP requires a server to account for hierarchies
 * where they exist; this API has none, and saying so is better than inventing one.
 */
export function hasScope(granted: readonly string[], required: McpScope): boolean {
  return granted.includes(required);
}

/**
 * The scope challenge for an operation that needs `required`.
 *
 * The MCP server calls this before the operation runs, and a returned challenge becomes a
 * `403 insufficient_scope` — so an under-scoped token is refused *before* it executes or bills
 * anything, rather than after.
 *
 * `undefined` means "carry on", in two cases that look alike and are not:
 *
 *   - **No credential at all.** The keyless demo tier is how an agent discovers this service,
 *     and a challenge here would put a credential in front of it.
 *   - **The token already carries the scope.**
 *
 * The comparison is `hasScope`, so the no-implication rule above holds here too: a token holding
 * only `ridings:area` is refused a lookup, because a lookup is a different capability and the
 * two are not a hierarchy.
 *
 * The shape is the MCP server's own, declared structurally rather than imported so that this
 * module stays a leaf — the portal imports the scope list from here and has no business
 * depending on the server package to learn what a scope is.
 */
export interface ScopeChallenge {
  /** The complete scope set to ask for. */
  scopes: readonly [string, ...string[]];
  /** Optional human-readable detail, satisfying the RFC 6750 `error-description` grammar. */
  errorDescription?: string;
}

export interface ScopeChallengeContext {
  /** The verified credential, when the request carried one. */
  authInfo?: { scopes: string[] };
}

export function scopeChallengeFor(
  required: McpScope
): (context: ScopeChallengeContext) => ScopeChallenge | undefined {
  return ({ authInfo }) => {
    if (!authInfo) return undefined;
    if (hasScope(authInfo.scopes, required)) return undefined;
    return {
      scopes: [required],
      // The description is what the refusal says in prose, so it says the actionable thing:
      // re-authorize for this scope. Plain text, per the RFC 6750 `error-description` grammar.
      errorDescription:
        `This access token does not carry the ${required} scope this operation needs. ` +
        `Re-authorize for ${required} to use it.`,
    };
  };
}
