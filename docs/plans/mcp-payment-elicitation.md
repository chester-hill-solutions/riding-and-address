# MCP payment elicitation

**Status: design. Slice 1 implemented in `src/mcp-purchase.ts`.**

How an MCP client gets a *human* to pay, and how that composes with the x402 rail for autonomous
agents. Companion to [ADR 0007](../adr/0007-account-free-x402-payments.md) and
[x402-facilitator-verification.md](../ops/x402-facilitator-verification.md).

## The gap

The rail as built is **autonomous only**. MCP exposes `lookup_riding`, `quote_lookup` and
`quote_area`; acceptance happens over HTTP at `POST /api/quote/accept` with an x402
`PAYMENT-SIGNATURE`. That is the right shape for an agent with a wallet and no user — and it means an
**MCP-only client cannot pay at all**, because the payment step is outside MCP.

There is a second, larger population: a person sitting in Claude, ChatGPT, VS Code or Cursor, whose
agent has hit a paid operation. They have no wallet and no wish to acquire one. MCP has a defined way
to reach them.

## What MCP actually provides

Verified against the installed SDK (`@modelcontextprotocol/server` 2.3.1) and protocol revision
**2026-07-28**.

| Mechanism | Who pays | Shape |
|---|---|---|
| **Transport-level 402** | Autonomous agent | Cloudflare's `paidTool` returns 402 at the MCP server's HTTP transport; an x402-aware client pays and retries |
| **URL-mode elicitation** | A human, in flow | The tool returns `inputRequired` carrying an `elicitation/create` in `url` mode; the client opens the URL, the human completes it, the client retries |
| **OAuth 2.1 + account** | The organisation | Widely supported by clients — but this repo has no authorization server, by choice |

### The spec is prescriptive about payment

> Servers **MUST NOT** use form mode elicitation to request sensitive information such as passwords,
> API keys, access tokens, or **payment credentials**. Servers **MUST** use URL mode for interactions
> involving such sensitive information.

So the in-protocol payment path is URL mode, and collecting a card in a form-mode elicitation is not
merely discouraged — it is forbidden. This is why slice 1 uses `inputRequired.elicitUrl`.

### `requestState` is attacker-controlled, and the SDK says so

The multi-round-trip flow echoes a server-minted `requestState` back through the client. The SDK is
explicit:

> `requestState` round-trips through the client and comes back as attacker-controlled input: a server
> that lets it influence authorization, resource access, or business logic **MUST** integrity-protect
> it (e.g. HMAC or AEAD) and **MUST** reject state that fails verification. **The SDK does not do this
> for you.**

It does, however, ship the mechanism: `createRequestStateCodec` is an opt-in HMAC-SHA256 codec whose
`verify` drops into `ServerOptions.requestState.verify`, fail-closed and constant-time. It is
**signed, not encrypted** — the client can decode the payload — so **no secrets go in it**.

## Non-negotiable rules

1. **Never trust the client's claim that payment happened.** The `inputResponses` say a human was
   *shown a URL*. Whether money moved is a fact we hold, not a fact they report. Slice 1 re-reads the
   account state server-side; the x402 rail already works this way, where the facilitator's answer is
   the evidence and the caller's is not.
2. **`requestState` is signed with the existing root of trust** (`OFFER_SIGNING_SECRET`), carries no
   secrets, and is rejected on any verification failure.
3. **The elicited URL is one we serve.** It is built from the request origin, never from input.

## Design — slice 1: the hand-off

A `purchase` tool that unblocks a human, without inventing a money system.

```
agent → purchase
server → inputRequired {
           inputRequests: { purchase: elicitUrl({ message, url: <our portal> }) },
           requestState:  <signed: { correlationId, authenticated }>
         }
human completes at the URL
agent → purchase (retry, carrying inputResponses + requestState)
server → verify requestState, read the response, then re-read the *account* and report it
```

The URL is the honest one for the caller's state: `/signup` for an anonymous caller (sign up → free
allowance → create a Server key), `/app/keys` for an authenticated one.

**Deliberately no new ledger in slice 1.** The existing machinery already answers "can this caller
pay": the free monthly allowance, Server API keys, and the metered Stripe path. What was missing was
the *hand-off* — the server had no way to tell a client "a human is needed, here". That is the whole
of slice 1, and it is the case the spec names ("credential entry, payment setup").

## Design — slice 2: prepaid credits, if it earns its place

A prepaid balance is the third option, and there is precedent in the repo: `upload:credits` in
`ApiKeyUsageDO` is already a prepaid balance in half-cent **row** units for sheet uploads.

It is **not** in slice 1, because:

- the metered path already serves the human case, so a balance is an optimisation, not a gap;
- a balance in the wrong unit is worse than none — API calls and area records are not upload rows,
  and inventing a second unit is how pricing drifts;
- the x402 rail already gives the *autonomous* case a per-call rail, so credits would mostly duplicate
  it for buyers who can already pay.

If it is built, it should be one unit, priced from the same constants the quote path enforces, and
spendable by both rails — one balance, not one per rail.

## How this composes with the x402 work

The **offer is the shared boundary**. Both rails pay for the same offer, priced by the same
constants:

- **Autonomous:** the agent quotes, then pays at `POST /api/quote/accept` with an x402 signature.
- **Human present:** the agent calls `purchase`, a human completes it at the portal, and the caller
  then uses the normal metered path with a key.

Neither path changes the offer, and neither needs the other's machinery. That is the point of keeping
payment behind the offer boundary, as the product plan required.

## What this does not cover

- **A transport-level 402 for MCP tools** (Cloudflare's `paidTool` shape), so an MCP-only client with
  an x402 HTTP layer can pay without leaving MCP. That composes with the x402 work and is a separate
  decision: it needs the rail enabled and a dynamic price, since our area price depends on the inputs.
- **OAuth** — still deliberately unpublished, because there is no authorization server.
- **MCP Apps, Tasks and Enterprise Managed Authorization** — adjacent 2026-07-28 extensions, none of
  which this needs.

## What building slice 1 found

Details that only showed up by exercising it, worth knowing before anyone else touches this:

- **Clients must declare URL mode specifically.** `elicitation: {}` is not enough — the request must
  carry `elicitation: { url: {} }`, and the SDK refuses with `-32021` naming the exact missing
  capability (`{"requiredCapabilities":{"elicitation":{"url":{}}}}`) when it is absent. That is a
  good failure: the client is told precisely what it cannot do.
- **A modern (2026-07-28) request is routable, not sessionful.** It carries `MCP-Protocol-Version`,
  `Mcp-Method` and `Mcp-Name` headers plus `_meta` capability declarations. A body-only request is
  rejected with `-32020` naming the header that disagrees. This is the stateless revision working as
  described, and it means the server can be routed without parsing the body.
- **Our handler already serves both eras.** `legacy: 'stateless'` governs only how *2025-era* traffic
  is served; modern traffic rides the same handler and can do multi-round trips. A 2025-era client
  gets a clear refusal rather than a broken flow.
- **The codec requires a ≥256-bit secret and throws below that**, so `createPurchaseCodec` returns
  `null` instead. A misconfigured signing secret must not be able to take down `lookup_riding`.

## How we would know it works

- A client that supports elicitation — Claude, VS Code, Cursor and others do — can complete the flow
  and reach a working key without leaving the conversation.
- Unit tests: the codec round-trips; a tampered `requestState` is refused; an expired one is refused;
  the tool never reports success on a response it did not verify; the URL is built from the origin.
