# Paid MCP tools — plan

**Status: plan. Not implemented. Depends on the x402 rail being enabled.**

Companion to [`mcp-payment-elicitation.md`](mcp-payment-elicitation.md) (the human path, shipped),
[ADR 0007](../adr/0007-account-free-x402-payments.md) and
[`x402-facilitator-verification.md`](../ops/x402-facilitator-verification.md).

## 1. The gap this closes

Two ways to pay exist, and neither covers an MCP-only autonomous client:

| Path | Works for | Shipped |
|---|---|---|
| x402 over HTTP (`POST /api/quote/accept`) | An agent that can make an authenticated HTTP request | Yes, inert |
| `purchase` (URL-mode elicitation) | A human in the client | Yes |
| **A paid MCP tool call** | **An agent that speaks MCP and holds a wallet** | **No** |

An agent whose only interface is MCP — no HTTP payment layer, no human — can quote but cannot buy.
That is the population the whole agent-first plan was written for, so this is the last structural
gap on the agentic axis.

Cloudflare's Agents SDK ships this shape as `paidTool` + `withX402`: the MCP server's **HTTP
transport** answers `402` for a paid tool, and the client's x402 layer pays and retries. Their docs
confirm the client side works (`withX402Client`), which answers the question this repo had open:
**yes, an MCP client can pay — at the transport, not inside a tool result.**

## 2. The pricing problem, and why MCP solves it

A flat per-tool price is the obvious design, and it does not fit this product. An area search costs
one 250-record unit per 250 records, so **the price is a function of the inputs**: 300 records is
$4, 1,000 is $8. `paidTool`'s flat price cannot express that.

MCP hands us the answer: **every tool call carries its arguments.** So the price does not need to be
negotiated in advance — the server can derive it from the same arguments on every call:

```
client → tools/call quote_area { riding: "Ottawa Centre", maximum_results: 300 }
server → 402 with PAYMENT-REQUIRED: amount 4.00 USD   (derived from the args)
client → tools/call quote_area { ...same args } + PAYMENT-SIGNATURE
server → verify, settle, execute, deliver
```

This is simpler than the HTTP flow, which needs a separate quote because the client's HTTP request
has no notion of "the operation". No offer round trip, no cursor to obtain the price.

### The trade-off, stated

The signed-offer machinery exists to bind *what was agreed* — inputs, vintage, price ceiling,
expiry. Deriving the price from the args means the binding is instead:

- the **derivation is deterministic** from the args (`areaPriceUsd(maximumResults)`, a pinned dataset
  vintage), so the server cannot quote one price and charge another;
- the **client's signature covers the requirements** it was shown (amount, asset, payTo, network), so
  the amount is fixed by the signature, not by trust;
- the server **re-derives and compares** before settling, so a retry with different args is refused
  rather than silently repriced.

What is lost: an explicit expiry on the price, and an offer id to correlate. Both are recoverable
(the `PAYMENT-REQUIRED` body can carry a `resource` URL naming the tool and a hash of the args), but
this plan should not pretend the offer round trip and the derive-from-args path are equivalent.

## 3. Paging over MCP

An area search returns up to 1,000 records. A single tool result of 1,000 rows is a poor MCP citizen —
it lands in a model's context. Options:

| Option | Consequence |
|---|---|
| Return page one, plus a signed cursor the client passes back as an argument | One tool, two modes; reuses the cursor machinery already built and tested (#142/#160) |
| A separate `page_area` tool taking a cursor | Clearer in the tool list; one more tool to discover |
| Return everything | Rejected: it is the ceiling, not a page size, that bounds a result |

**Recommended:** the first. The cursor is already signed, already carries the remaining allowance, and
already stops at the paid ceiling — that work exists and is tested.

## 4. Mechanics, as verified

Facts confirmed against the installed SDK and live services, not assumed:

- **The 402 is at the HTTP transport.** `/mcp` is an HTTP endpoint, so the challenge is an HTTP
  response, not a JSON-RPC error. A client without an x402 layer sees a 402 it cannot act on.
- **The modern era is routable, not sessionful.** A 2026-07-28 request carries `MCP-Protocol-Version`,
  `Mcp-Method` and `Mcp-Name` headers plus `_meta` capabilities; a body-only request is refused with
  `-32020` naming the header that disagrees. **The paid check can therefore run before the body is
  parsed** — which is where it belongs.
- **A client must declare the capability it needs.** For elicitation the SDK refuses with `-32021`
  naming `{"elicitation":{"url":{}}}`. The equivalent for payment is the client's x402 support, which
  MCP does not describe — so a 402 is the only signal available, and a client that ignores it must be
  handled as "no payment", not as an error.
- **`/mcp` already has a host check and a rate-limit bucket** (`src/worker.ts`), and the paid bucket
  (`PAID_RATE_LIMIT`) exists from #154. The paid check slots in beside them.

## 5. What must never be unlimited

- **Amount:** the settled amount is checked against the server's own derivation. A signature for less
  than the derived price is refused.
- **Result size:** page one is bounded by `AREA_PAGE_MAX`, and the cursor's allowance bounds the rest
  (#142). Unchanged by this work, and it must stay that way.
- **Spend:** the per-payer daily cap already applies to the accept path (#154, #156–#158). A paid MCP
  call is a **second entry point into the same money**, so it must go through the same reservation —
  not a parallel one. This is the single most important constraint in this plan.
- **Receipts:** the same receipt must be written, before delivery, for a paid MCP call (#129). One
  accounting path, two doors.

## 6. Sequencing

1. **Rail enabled and verified end to end** (blocked on the treasury decision and a funded testnet
   run). Nothing here can be tested before that.
2. **One paid tool, smallest possible:** `lookup_riding` is the wrong candidate (it is the free demo
   tier, and it must stay free). The natural first is a **paid point lookup** — the same operation
   `quote_lookup` prices — because it is one result, no paging, and the price is a constant.
3. **Area search**, once paging over MCP is settled (§3).
4. **Discovery:** the Server Card and `/.well-known/cancoder.json` must declare which tools are paid
   and their price rule, or an agent cannot choose before calling. The card guard
   (`test/mcp-tool-catalog.test.ts`) should be extended to cover the paid/free split.

## 7. Decisions this plan needs

| # | Decision | Leaning |
|---|---|---|
| 1 | Does the free demo tier stay free over MCP while HTTP keeps its own free tier? | Yes — the demo tier is the on-ramp; pricing it would remove the "try before you buy" promise |
| 2 | Price derived from args (§2), or an offer round trip inside MCP? | Derived, for the reasons in §2 — with the trade-off named |
| 3 | One tool with a cursor, or a separate page tool (§3)? | One tool with a cursor |
| 4 | What does a client without x402 support see? | A 402 with a readable body explaining the price and how to pay; never a silent failure |
| 5 | Does a paid MCP call get its own rate-limit bucket? | No — the existing `paid` bucket, and the existing spend cap |

## 8. Acceptance

- An MCP client with an x402 HTTP layer can pay for a tool call and receive the result, without
  leaving MCP and without a separate quote.
- A client without one receives a 402 it can read, and nothing is charged.
- The amount settled equals the amount derived from the args; a signature for less is refused.
- One receipt per settlement, written before delivery, visible in `GET /api/x402/receipts`.
- The per-payer spend cap applies to MCP calls exactly as it does to the HTTP accept path — proven by
  a test that spends through both doors and hits one cap.
- A tampered or replayed cursor is refused; the paid ceiling holds across pages over MCP as it does
  over HTTP.

## 9. What this unblocks

The agent-first plan's central claim — *a clean agent can discover the service, obtain a useful
result, and purchase additional work without a person* — is only fully true once an MCP-only agent
can pay. Today it can discover, try, and quote; this is the last step of that sentence.

It also removes the awkward split where the flagship paid product (area search) is reachable over
HTTP but not over the interface agents actually use.

## 10. Open items

- **A client that ignores the 402.** MCP has no way to declare "I can pay", so a client that cannot
  will retry a 402 forever or give up. Worth deciding whether the tool description should say so
  explicitly, and how loudly.
- **Interactive clients.** A client with a human *and* an x402 layer could do both — pay silently or
  ask. Which wins is a product decision, not a protocol one.
- **Whether to use the SDK's `paidTool` instead.** It would mean adopting Hono and the Agents SDK for
  the MCP surface. This repo has its own route table and a hand-rolled facilitator client; the same
  trade-off as ADR 0007's, and it should be decided deliberately rather than by drift.
