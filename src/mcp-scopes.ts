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
