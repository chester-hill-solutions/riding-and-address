# Verifying the x402 facilitator

Closes `docs/ops/x402-security-review.md` **item 3**: the `/verify` and `/settle` envelopes follow the
x402 v2 contract but have never been exercised against a real facilitator. A mis-shape fails closed —
nothing is charged — but it also means the rail silently does not work, and nothing in the code can
tell the difference. This is the last technical unknown before the rail can be enabled.

The harness is `scripts/verify-x402-facilitator.ts` (`bun run verify:x402`).

## What it proves, and what it does not

| Step | Proves | Needs |
|---|---|---|
| `/supported` check | the facilitator advertises the configured network and asset | a facilitator URL |
| **Envelope check** | our `/verify` request shape is understood | a facilitator URL |
| Full journey | settlement and delivery actually work | a signed payload, a funded testnet wallet, a Worker with the rail enabled |

Only the full journey proves the rail works. The envelope check proves the *request shape* is right,
which is the part this repo controls — the signature is the payer's, not ours.

### Why an unsigned payload is enough for the envelope check

Send a structurally valid but **unsigned** payload: every field a facilitator validates is present,
only the signature is absent. A facilitator that understands our envelope parses it and rejects the
*payment* (`invalid signature`). A facilitator that does not understand our envelope rejects the
*request* (`field required`). Those are different answers, and the difference is the whole check.

The harness classifies the response and is deliberately conservative: an unclear answer is reported
**inconclusive**, never a pass. Read the raw body when that happens.

## Step 1 — the envelope check

No wallet, no funds, no Worker needed. **Done against a live testnet facilitator on 2026-10-17** — see
[Known-good facilitators](#known-good-testnet-facilitators).

```bash
export X402_FACILITATOR_URL=https://your-facilitator.example
export X402_NETWORK=eip155:84532              # testnet chain id
export X402_ASSET=0x…                          # the stablecoin contract
export X402_PAY_TO=0x…                         # the receiving wallet
# Optional:
export X402_FACILITATOR_TOKEN=…                # if the facilitator requires one
export X402_ASSET_DECIMALS=6                   # default 6
export X402_ASSET_NAME=USDC                    # default USDC
export X402_ASSET_VERSION=2                    # default 2
export X402_MAX_TIMEOUT_SECONDS=60             # default 60

bun run verify:x402 --dry-run
```

Expected on success:

```
  PASS  our /verify envelope is understood
        rejected the payment, not the request: invalid_signature
```

Interpretation:

| Result | Meaning | What to do |
|---|---|---|
| `PASS` | the facilitator parsed our fields and judged the payment | continue to step 2 |
| `FAIL … rejected the request shape` | our envelope is wrong | fix `HttpFacilitator` in `src/x402.ts` to match, then re-run |
| `FAIL … no /verify at that URL` | wrong base URL | `X402_FACILITATOR_URL` should be the base; `/verify` is appended |
| `FAIL … could not reach` | network or DNS | check connectivity |
| `WARN … inconclusive` | the answer did not match either pattern | **read the raw body** and decide by hand |

## Known-good testnet facilitators

Checked live on 2026-10-17 against `exact` on Base Sepolia (`eip155:84532`). Both are free, need no
signup, and are **testnet only** — the x402 documentation is explicit that the public facilitator is
not the production path.

| Facilitator | `/supported` | Envelope | Notes |
|---|---|---|---|
| `https://x402.org/facilitator` | `exact` on `eip155:84532` ✅ | **confirmed** — `invalid_exact_evm_signature` | needs `accepted` in the payload (below) |
| `https://facilitator.x402.rs` | `exact` on `eip155:84532` ✅ | **confirmed** | returns `unsupported_scheme` for a payload without a real signature — semantic, not structural |

For production mainnet the options are a managed facilitator (Coinbase CDP, thirdweb, xpay and others
are listed in the x402 ecosystem directory) or self-hosting `x402-rs`
(`ghcr.io/x402-rs/x402-facilitator`). That choice belongs with the treasury decision.

### Three things the live check taught us

**The probe payload must echo `accepted`.** Sending only `{x402Version, scheme, network, payload}`
makes x402.org return `500 Cannot read properties of undefined (reading 'scheme')`. Adding
`accepted: <the requirement being paid>` produces the semantic rejection instead. Both the probe and
any real client must send it — this is a property of the v2 payload, and the harness now pins it.

**The body needs a top-level `x402Version`.** Without it a facilitator answers `unsupported_scheme` —
which looks like "unsupported payment" and is really "unresolvable request". Replayed four ways against
`facilitator.x402.rs`, only the body carrying it verified. Our client was missing it, and the probe
passed anyway, because the response's `payer` field made `unsupported_scheme` read as a semantic
rejection. Both are fixed (#170).

**Facilitators do not necessarily advertise the token.** `/supported` lists schemes and networks;
neither facilitator named the asset. The check now reports "cannot tell" rather than "unsupported" in
that case — an earlier version reported a failure that was not real.

## How Cloudflare recommends doing this

Cloudflare documents x402 for Workers and the Agents SDK at
`developers.cloudflare.com/agents/tools/payments/x402` (checked 2026-10-17). Their recommended flow
is the one implemented here, step for step:

| Cloudflare | This repo |
|---|---|
| `402` + Base64 `PAYMENT-REQUIRED` with price, token, network, merchant address | `buildPaymentRequired` (`src/x402.ts`) |
| Client retries with `PAYMENT-SIGNATURE` | `PAYMENT_SIGNATURE_HEADER` |
| Server verifies and settles — "directly or by calling a facilitator" | `HttpFacilitator` (`/verify`, `/settle`) |
| `PAYMENT-RESPONSE` carries settlement confirmation | `PAYMENT_RESPONSE_HEADER` |

**Their recommended facilitator is `https://x402.org/facilitator`**, "operated by Coinbase and used in
all Cloudflare examples" — and it is the facilitator this repo's envelope was verified against
(above). Their testnet guidance is the same as ours: `base-sepolia` with test USDC from the Circle
faucet.

### Where this repo deliberately differs

**They use the SDKs; this repo hand-rolls the facilitator client.** Cloudflare points at
`x402-hono` (Hono middleware), `@x402/evm` and `agents/x402`. This Worker is not a Hono app — it has
its own route table — and `HttpFacilitator` is about forty lines against the documented contract. The
trade-off is real in both directions: the SDK is less code to own, and a hand-rolled client is a
dependency we do not have and an envelope we had to verify ourselves (which is why the harness above
exists).

**Their MCP story is `paidTool`; this product needs an offer.** `paidTool` in the Agents SDK attaches
a **flat price per tool call**, which is a clean fit for a fixed-price tool and cannot express this
product's pricing: an area search costs one 250-record unit per 250 records, so 300 records is $4 and
1,000 is $8 — a function of the *inputs*. That is why the flow is quote → accept → deliver, with a
signed offer carrying the ceiling, rather than a price on the tool.

**But their MCP answer settles an open question here.** `withX402` + `paidTool` means an **MCP client
can pay**: the 402 challenge is issued at the MCP server's HTTP transport, and the client side
(`agents/x402`, `withX402Client`) pays and retries. So "can MCP carry a payment signature?" is
answered — yes, at the transport, not inside a tool result. That is the shape to follow if this
product ever offers a paid MCP tool rather than MCP-for-quoting plus HTTP-to-accept.

### The managed path, and when it is real

Cloudflare's **Monetization Gateway** is the edge-level version — pricing rules, x402 handshake and
settlement at the edge, "you will not have to build the payment machinery yourself". It is in
**closed beta, US sellers and buyers**, so it is a watch item rather than a plan. If it opens up, the
interesting question is whether it can express input-dependent pricing like an area unit, or only
flat per-request prices.

## Step 2a — producing a signed payload

The harness consumes a signed payload; it does not create one, because signing needs a private key and
an EVM library, and the payer's wallet is the right place for both.

**Use the official client.** Its quickstart is `docs.x402.org/getting-started/quickstart-for-buyers`.
The shape is a wallet-backed signer wrapped into a payment-aware `fetch`:

```ts
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const client = new x402Client();
registerExactEvmScheme(client, { signer: account });
const fetchWithPay = wrapFetchWithPayment(fetch, client);

// The accept route requires POST — `fetchWithPay` does not infer it, so passing no options sends a
// GET that never reaches the handler.
const response = await fetchWithPay('https://your-target/api/quote/accept?offer=…', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
});
```

Two notes, because the SDK is young and the imports have moved once already:

- An earlier form used `createSigner(network, privateKey)` from `x402-fetch`. If the imports above do
  not resolve, check the current quickstart rather than trusting this transcription.
- **Run this against a target, not by hand.** `wrapFetchWithPayment` handles the whole
  `402 → sign → retry` round itself, so it is a complete end-to-end test on its own — it does not need
  the harness. Use the harness (`--payload`) when you want to inspect one payload repeatedly.

**Do not commit a private key.** Pass it in the environment, and use a throwaway testnet wallet.

## Step 2 — the full journey

This needs a signed payment payload. **The harness does not sign one**, on purpose: signing needs a
private key and an EVM library, and the payer's wallet is the right place for both. Produce a payload
with the official x402 client, or any signer, and save it as JSON.

Then point the harness at a Worker with the rail enabled — staging, or `wrangler dev` with
`X402_ENABLED=true` and the rest of the rail configured:

```bash
bun run verify:x402 --target https://riding-lookup-staging.chester-hill-solutions.workers.dev \
  --payload ./signed-payload.json
```

It requests a quote, accepts it with the payload, and reports whether the Worker returned `200` with a
receipt. A `402` means verification or settlement was rejected — the body names the reason, and it is
the facilitator's own answer.

Then confirm the money actually moved:

- the receipt is readable at `GET /api/x402/receipts` (admin), with `delivered: true`;
- the settlement transaction confirms on the testnet explorer;
- `POST /api/x402/reconcile` (admin) agrees, once `X402_RPC_URL` is set.

The harness also asserts the receipt names its payer. With the spend cap enabled an unnameable
payment is **refused**, so a successful accept must carry one — if that check fails, the
facilitator's payload shape is not one `payerFromPaymentPayload` recognises and the extractor needs
aligning with it before the rail is enabled (see #158).

## Step 3 — record the outcome

Update `docs/ops/x402-security-review.md` item 3 with what was run, against which facilitator, on
which date, and the result. If the envelope needed changing, say what changed.

## Still outstanding after this

- **Treasury, receipt and tax policy** (item 1) — a business decision, and the other gate on enabling.
- **Settlement replay** (item 5) — demonstrate that a second settlement of the same payload is
  rejected. The harness does not cover it: submit the same payload twice in step 2 and confirm the
  second does not move money.
- **Refunds** (item 2) — still manual.

## Caveats

- The classification is a heuristic over status codes and message text. It reports what it saw; it
  never upgrades an unclear answer to a pass.
- The probe payload's amount is the point-lookup ceiling. A facilitator that validates the amount
  against the requirements will see them agree.
- Nothing here enables the rail. It is a check you run before enabling it.
