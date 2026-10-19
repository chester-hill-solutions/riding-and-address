/**
 * Agent-discovery documents beyond the catalogs: the ARD manifest, the MCP Server Card, `/auth.md`
 * and the Agent Skills index.
 *
 * Each one describes something CanCoder actually does. That is the rule here: these formats are
 * read literally by agents, so a document that advertises a capability we do not have is worse than
 * no document at all. Nothing below claims an OAuth server, a registration flow, or a tool that
 * does not exist — see `docs/ops/agent-discovery.md` for what is deliberately not published.
 */

import { getAgentQuickstart } from './mcp';
import { getAllProvincialPaths } from './datasets';

/** The canonical identity used across the discovery documents. */
function did(origin: string): string {
  return `did:web:${new URL(origin).hostname}`;
}

/**
 * ARD (Agentic Resource Discovery) manifest — `/.well-known/ai-catalog.json`.
 *
 * Field names follow the ai-catalog data model: entries carry `identifier` (not `id`), and `host`
 * carries `displayName` + `identifier`. Each entry has exactly one of `url` or `data`, never both.
 */
export function createAiCatalog(origin: string): unknown {
  const host = new URL(origin).hostname;
  return {
    specVersion: '1.0',
    host: { displayName: 'CanCoder', identifier: did(origin) },
    entries: [
      {
        identifier: `urn:air:${host}:api:canadian-riding-lookup`,
        displayName: 'CanCoder Canadian riding lookup API',
        type: 'application/vnd.oai.openapi+json',
        url: `${origin}/api/docs`,
        representativeQueries: [
          'Find the federal electoral district for a Canadian postal code',
          'Look up the provincial electoral district for a Canadian address',
        ],
      },
      {
        identifier: `urn:air:${host}:mcp:cancoder-tools`,
        displayName: 'CanCoder MCP tools',
        type: 'application/json',
        url: `${origin}/mcp`,
        representativeQueries: [
          'Which federal riding contains this Canadian postal code?',
          'Find the provincial riding for a Canadian street address',
        ],
      },
    ],
  };
}

/** MCP Server Card (SEP-1649) — `/.well-known/mcp/server-card.json`. */
export function createMcpServerCard(origin: string): unknown {
  return {
    serverInfo: { name: 'CanCoder', version: '1.0.0' },
    transport: { type: 'streamable-http', endpoint: `${origin}/mcp` },
    capabilities: {
      tools: [
        {
          name: 'lookup_riding',
          description:
            'Map a Canadian postal code, street address, or coordinate pair to an electoral riding.',
        },
        {
          name: 'quote_lookup',
          description:
            'Request a free, expiring offer for a lookup, bound to the inputs, dataset vintage and a maximum price.',
        },
        {
          name: 'quote_area',
          description:
            'Request a free, expiring offer for an address search within a riding or a caller-supplied shape, priced in 250-record units.',
        },
        {
          name: 'purchase',
          description:
            'Hand a payment-setup step to the person using the client, then report their account state. Charges nothing itself.',
        },
      ],
      resources: [],
      prompts: [],
    },
  };
}

/**
 * `/auth.md` — how an agent authenticates.
 *
 * It documents an OAuth 2.1 authorization server that exists, protected-resource metadata that is
 * served, and access tokens that are accepted on `/mcp`. Every one of those was absent a day ago, and
 * each claim here is one that can be checked by fetching the URL it names.
 */
export function createAuthMd(origin: string): string {
  return `# auth.md

How an AI agent authenticates to the CanCoder API.

## Audience

Autonomous agents and the developers running them, calling the riding-lookup API at ${origin}.

## Credentials

CanCoder issues **Server API keys** (\`sk_…\`). There is no self-registration endpoint and no
anonymous account creation.

| Method | How | Use |
| --- | --- | --- |
| Keyless demo | none | \`/api/demo/*\` and \`/mcp\`, rate-limited per IP, not billable |
| Server key | \`Authorization: Bearer sk_…\` | Metered lookup and geocode calls |
| Browser key | \`?key=pk_…\` or \`X-Api-Key\` | Browser search and the embed widget, origin-restricted |

## Provisioning

A Server key is created in the portal by a human, after signing up:

1. A person signs up at ${origin}/signup.
2. They create a Server key at ${origin}/app/keys.
3. The key is shown once; store it as a secret and send it as \`Authorization: Bearer sk_…\`.

Agents cannot mint their own keys. If your workflow needs account-free, autonomous payment, see
${origin}/api/quote — an agent requests a free, expiring offer there.

## OAuth

An OAuth 2.1 authorization server is live. Its issuer is \`${origin}/api/auth\` and its metadata is
at \`${origin}/api/auth/.well-known/oauth-authorization-server\`. It serves the authorization code
flow with PKCE (S256 only), binds access tokens to the MCP server as their audience (RFC 8707), and
publishes signing keys at \`${origin}/api/auth/jwks\`.

**A client identifies itself in one of two ways**, and either is enough:

| Mechanism | Your \`client_id\` | When |
| --- | --- | --- |
| Client ID Metadata Document | the HTTPS URL of a document that describes your client | any client — the server fetches that document to read your name and your redirect URIs |
| Pre-registration | an identifier we issued you | a client we have already set up together |

**Dynamic registration is not enabled**, and there is no self-registration endpoint: a client
identifies itself by publishing a document, not by asking to be registered.

**A client document must carry \`client_name\` and \`redirect_uris\`.** The profile this server
requires is \`mcp-2026-07-28\`, which is stricter than draft-02 for exactly that reason — a
consent screen with neither cannot tell a person what it is asking them to approve. Serve the
document over HTTPS; the server fetches it.

**The scopes are \`ridings:lookup\` and \`ridings:area\`** — the same two the server's metadata
advertises, and the same one the 401 challenge names. A lookup is one call; an area search is
priced per 250 records, so the two are separate lines on a consent screen rather than one.

**A person approves the grant once.** The authorization request ends on a consent screen at
\`${origin}/consent\`, where a signed-in user sees the client and the scopes and accepts or
refuses. An agent cannot approve on the user's behalf, so a headless run has to arrange for that
approval to happen — a browser, once, per user.

**The RFC 9728 protected-resource metadata is published** at
\`${origin}/.well-known/oauth-protected-resource\` (and at the resource-path alias
\`/.well-known/oauth-protected-resource/mcp\`, which is the URL the 401 challenge names). That is the
document an MCP client reads first, so a client can now discover this server on its own: fetch the
metadata, find the issuer, authorize, and send the resulting access token as
\`Authorization: Bearer\`.

**Access tokens are accepted on \`/mcp\`**, and are billed against the Customer the token was issued
for. A Server key still works there and on the REST routes.

The demo tier is unchanged: \`/mcp\` and \`/api/demo/*\` still answer without any credential. What is
new is what happens when the demo allowance runs out — instead of a 429 that a client can only wait
out, \`/mcp\` answers **401 with a \`WWW-Authenticate\` challenge** naming the resource metadata and
the scope needed, which is an instruction the client can act on.

## Credential use

- Never place a live key in a prompt, a public conversation, or client-side code.
- A key is scoped to one Customer; treat it as that Customer's identity.
- Denials carry a stable \`code\` (\`KEY_REQUIRED\`, \`KEY_INVALID\`, \`KEY_DISABLED\`, …); see
  ${origin}/.well-known/cancoder.json.

## Discovery

- Service terms: ${origin}/.well-known/cancoder.json
- API description: ${origin}/api/docs
- Agent guide: ${origin}/docs/agents.md
- MCP server card: ${origin}/.well-known/mcp/server-card.json
`;
}

/** The one skill CanCoder publishes: how to resolve a Canadian location to a riding. */
export function createRidingLookupSkill(origin: string): string {
  return `# CanCoder riding lookup

Resolve a Canadian postal code, street address, or coordinate pair to a federal, provincial, or
combined electoral riding, using the CanCoder API at ${origin}.

## When to use this skill

Use it when a task needs the electoral district for a Canadian location: address validation,
campaign list building, "which riding is this?" questions, or joining an address list to ridings.

## How to call it

Over MCP (preferred), connect to \`${origin}/mcp\` and call \`lookup_riding\`:

- \`location\`: a Canadian postal code or street address
- \`city\`, \`province\`: help resolve a street address
- \`latitude\`, \`longitude\`: an alternative to \`location\`
- \`dataset\`: \`federal\` (default), \`combined\`, or a province code such as \`on\`

Over HTTP: \`GET ${origin}/api/federal?postal=K1A%200A6\`. Provincial routes are
\`/api/{code}\` for ${getAllProvincialPaths().map((path) => path.replace('/api/', '')).join(', ')}.

## What a result means

The response carries the riding name, the boundary dataset id and year, and the geocode method and
confidence. A match is **not** Canada Post-certified. If the result has no riding properties, treat
it as unresolved and ask for a more complete address or coordinates.

## Cost

A keyless demo is available without a key. Metered calls need a Server API key — or an OAuth
access token, because this server is an OAuth 2.1 authorization server: a client can get a
**scoped** token instead of a key, with a person approving the grant once at \`${origin}/consent\`.
\`${origin}/auth.md\` has the endpoints, how a client identifies itself, and the scopes. To price a
lookup before paying, request a free, expiring offer from \`${origin}/api/quote\` (or the
\`quote_lookup\` MCP tool); requesting a quote consumes no billable usage.

See ${origin}/docs/agents.md for the full agent guide.
`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Where the skill artifact is served. */
export function ridingLookupSkillPath(): string {
  return '/.well-known/agent-skills/cancoder-riding-lookup/SKILL.md';
}

/**
 * Agent Skills discovery index (RFC v0.2.0) — `/.well-known/agent-skills/index.json`.
 *
 * The digest is computed from the artifact actually served, so it cannot describe a different
 * document than the one an agent downloads.
 */
export async function createAgentSkillsIndex(origin: string): Promise<unknown> {
  const skill = createRidingLookupSkill(origin);
  return {
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: [
      {
        name: 'cancoder-riding-lookup',
        type: 'skill-md',
        description:
          'Resolve a Canadian postal code, street address, or coordinate pair to a federal, provincial, or combined electoral riding.',
        url: `${origin}${ridingLookupSkillPath()}`,
        digest: `sha256:${await sha256Hex(skill)}`,
      },
    ],
  };
}

/** Kept so the module owns everything it advertises. */
export { getAgentQuickstart };
