# Account-free agent payments use x402 (W2)

CanCoder adopts **x402** as the single account-free payment rail for v1. A capable agent pays per
query over HTTP `402 Payment Required` with no account, session or key. Workspace Server keys with
Stripe metering remain the organization path unchanged (ADR 0002, ADR 0006).

The target agent ecosystem is x402-capable, which is what selects this rail. UCP Checkout is
**not** the v1 agent rail: its standard flow expects a human in a trusted UI unless an AP2 mandate
authorizes completion, so it cannot serve an autonomous paid call. It stays a candidate for packaged
purchases (a bulk export, an Enterprise order) once those products exist. Workspace-key billing was
rejected as the v1 rail because it requires exactly the account-and-key setup the agent journey is
meant to remove; it remains the default for organizations. Shipping two direct rails at launch was
deferred.

Payment stays behind an offer/fulfillment boundary so a second rail can be added later without
duplicating pricing, result delivery or accounting. The rail is advertised only to compatible
clients; nothing implies every agent can pay this way, and an MCP server never authorizes spending on
a user's behalf.

**Offers.** A quote is free, expiring, idempotently accepted, and bound to the exact request inputs,
dataset vintage and a maximum price. Requesting a quote neither charges nor consumes billable usage.
Acceptance references the offer id and its immutable parameters; the price, vintage and inputs
cannot change after acceptance.

**Spend authority.** The payer's wallet and its spend policy authorize payment — never ours. CanCoder
holds no open-ended credential and cannot debit an account. A request whose price exceeds the
accepted offer's ceiling is refused rather than partially fulfilled.

**Idempotency.** An accepted offer carries an idempotency key. A retry with the same key never
settles twice and never starts a second result job, whether the original attempt succeeded, failed,
or is still in flight.

**Settlement.** Verify, then settle, then deliver. The Worker verifies the submitted payment payload
and settles it either in-process or through an x402 facilitator's `/verify` and `/settle` endpoints.
A result is served only after settlement is confirmed. Per-query settlement ships first; EVM batch
settlement is a later cost optimization and must not change the per-offer semantics above.

**Failure and refund.** If settlement fails, the caller is charged nothing and no result is
delivered. If settlement succeeds but delivery fails, the obligation is persisted as a durable
retry, account credit or refund — a retry must never charge again. Funds are returned as credit or
an on-chain refund under a stated policy; they are not an automatic cash refund.

**Receipts.** Every accepted offer returns a machine-readable receipt carrying the offer id, the
settlement reference, amount, currency, dataset id and vintage, and result count, so a buyer can
reconcile without contacting us.

**Ledger semantics.** An x402 receipt is a **separate record** from the Customer Durable Object
ledger, which stays canonical for workspace billing only (ADR 0002). A direct payment creates no
Customer, increments no Billable unit, and must never be counted against a Stripe meter or a
Customer fuse. Receipts are reconciled against settlements; a mismatch raises an operator alert.
Quote and receipt records are retained for reconciliation and carry no personal information.

**Consequences.** New configuration: a receiving address and a facilitator URL/token, treated as
secrets. `docs/adr/0005-billing-invariants-gate.md` and its script extend to cover the published
offer price so Worker, MCP, UCP and Portal cannot diverge. The UCP profile continues to advertise no
payment handler until this ships. Stablecoin receipt, treasury and tax policy must be resolved
before the rail is enabled in production.

**Considered:** UCP Checkout as the v1 agent rail (human-in-the-loop, so not autonomous); workspace
Server key only (fails the account-free thesis); adopting both direct rails at launch (deferred);
settling in-process only (a facilitator keeps custody out of the Worker).

**Implementation status (W6).** The adapter ships. `GET /api/quote` issues the signed offer and
`POST /api/quote/accept` answers `402` with `PAYMENT-REQUIRED`, verifies and settles through a
facilitator, then delivers the quoted lookup with a machine-readable receipt. The rail is disabled
unless `X402_ENABLED` is set and fully configured, so it cannot charge by accident. Settlement can
only happen once for a given signed payload, and the delivered lookup is a read-only idempotent
operation, so a retry can neither double-charge nor change the result.

Every settled payment is written to the `X402_RECEIPTS` store, which is what reconciles the rail
against the Customer ledger it deliberately bypasses; `GET /api/x402/receipts` (admin) reports what
settled, what was delivered, and what still needs crediting. The rail **requires** that store: with
no place to record a receipt, `/api/quote/accept` fails closed rather than take money it cannot
account for. `POST /api/x402/reconcile` (admin) then confirms each stored settlement against the
chain, so a receipt that merely *looked* settled is distinguishable from one that is paid for.

Still required before enabling it in production: the security review (packet at
[`x402-security-review.md`](../ops/x402-security-review.md)); the credit/refund path for a
settled-but-undelivered result — today it is **recorded** with `delivered: false` and the payer
address, but the refund itself is manual; scheduling the reconciliation job (**done** — it rides the
existing six-hourly cron, and no-ops while the rail is unconfigured); and stablecoin treasury,
receipt and tax policy. The facilitator request/response envelope follows the v2 contract but must
be confirmed against the chosen facilitator.
