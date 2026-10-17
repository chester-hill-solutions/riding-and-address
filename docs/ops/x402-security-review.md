# x402 payment rail — security review packet

**Status: not enabled.** The rail is inert in production: `X402_ENABLED` is unset, so
`/api/quote/accept` fails closed with `PAYMENTS_UNAVAILABLE`. This document is the material for the
review ADR 0007 requires before it can take money. It states what is enforced, where, and what
remains open — including the parts that are not yet safe.

## Scope

The account-free path only: `GET|POST /api/quote`, `POST /api/quote/accept`, `GET|POST /api/area`,
and the `X402_RECEIPTS` store. Workspace Server keys, Stripe metering and the Customer Durable
Object ledger (ADR 0002) are out of scope and unchanged.

## Assets

1. **Money** — stablecoin the payer authorizes; we hold no funds and cannot debit an account.
2. **The address data** — a paid result must not be readable without payment.
3. **The receipts** — the only reconciliation record, since a direct payment deliberately does not
   touch the Customer ledger.

## Threat → control → evidence

| Threat | Control | Where | Evidence |
|---|---|---|---|
| Forged offer | HMAC-SHA256 over the exact payload bytes; no unsigned offer is issued | `signOffer`/`verifyOffer` | `test/offers.test.ts` (wrong secret) |
| Offer tampering | Signature recomputed over the same bytes — no canonicalisation, so key order cannot change the verdict | `verifyOffer` | `test/offers.test.ts` (tampered payload) |
| Expired offer | Expiry checked at verification | `verifyOffer` | `test/offers.test.ts` |
| Charged more than agreed | Requirements' amount **is** the offer's own ceiling | `buildPaymentRequired` | `test/x402-accept.test.ts` (402 challenge amount) |
| Double charge | Settlement can occur once per signed payload (facilitator/chain); the delivered lookup is read-only and idempotent, so a retry cannot charge or change the result | protocol | — (argued; see open items) |
| Reading without paying | Retrieval is **offer-only**; the page cursor is minted solely by the accept path and is unforgeable | `signAreaPageCursor` | `test/area-route.test.ts` (unsigned and foreign cursors refused, 410) |
| Cursor replay across offers/vintages | The cursor carries the offer it belongs to and the scope (riding + vintage, or shape hash); a mismatch is refused | `verifyAreaPageCursor`, `handleAreaRequest` | `test/area-offer.test.ts`, `test/area-route.test.ts` |
| Swapping the shape after quoting | The boundary is hashed and checked **before any payment step** | `handleAcceptRequest` | `test/area-polygon.test.ts` (400, not a settled 502) |
| Unbounded work per request | Scan budget, page size (≤250), `maximumResults` (≤1,000), and geometry vertex/span caps | `readAreaPage`, `validateAreaGeometry` | `test/area-query.test.ts`, `test/area-geometry.test.ts` |
| Charged but not delivered | Receipt recorded with `delivered: false` and the payer address, so a refund has a destination | `handleAcceptRequest`, `payerFromPaymentPayload` | `test/x402-accept.test.ts` (payer recorded) |
| Losing the reconciliation trace | The rail is **closed** unless `X402_RECEIPTS` is bound | `receiptsBound` | `test/x402-accept.test.ts` (unbound → 503) |
| Mis-shaped facilitator call | Fails closed: verify returns invalid, so nothing is charged | `HttpFacilitator` | — (**envelope unverified**, see open items) |

## Open items — not safe to skip

1. **Treasury, receipt and tax policy.** How stablecoin income is received, recorded and reported.
   A business decision, and a prerequisite.
2. **The refund path is manual.** A settled-but-undelivered result is *recorded* (`delivered: false`,
   `payer`), and an operator can send an on-chain refund — but there is no automated credit/refund.
   Until there is, an undelivered result is a support ticket. The record is now written **before**
   delivery is attempted, so a delivery failure cannot lose it; what happens when the receipt store
   itself is down is named in `docs/ops/x402-receipts-durability.md`.
3. **The facilitator envelope — verified against live facilitators, and one real bug found and
   fixed.** Checking this was worth doing: it found that our `/verify` and `/settle` bodies omitted a
   top-level `x402Version`, without which a facilitator answers `unsupported_scheme`. Proven by
   replaying the exact request four ways against `facilitator.x402.rs` — only the body carrying
   `x402Version` verified, and it verified a **real signature**, reading the payer correctly
   (#170). Two things made this hard to see, both now fixed: our client discarded the facilitator's
   answer, so the reason reached the caller as a bare `502`; and the verification probe's classifier
   matched the whole response text, so the response's `payer` field made `unsupported_scheme` read as
   a *pass*. **The lesson is recorded because it is the general one: a green envelope check did not
   mean the envelope was right.**
   Also learned, and documented in the runbook: the v2 payload must echo `accepted`, and facilitators
   do not necessarily advertise the token in `/supported`.
   **Still to confirm:** a settled payment end to end through `/settle` and a receipt.
   Runbook and known-good list: `docs/ops/x402-facilitator-verification.md`.

4. **Per-payer spend cap — addressed 2026-10-17, with three correctness fixes on review.** The
   initial implementation (#154) had three defects, all filed and fixed:
   - **#158 — it failed open.** The cap was skipped entirely when the payload named no payer, so it
     was unenforced for exactly the payload shapes `payerFromPaymentPayload` does not recognise. Now,
     while the cap is enabled, an unnameable payer is **refused** (`402 PAYER_UNIDENTIFIED`) without
     settling. `X402_PAYER_DAILY_CAP_USD=0` is the explicit, documented cap-disabled mode.
   - **#156 — it released on ambiguous errors.** Any `settle` exception released the reservation,
     including one thrown *after* broadcast. Now only a positive terminal non-payment
     (`success: false`) releases; an ambiguous error keeps the reservation and returns
     `502 SETTLEMENT_UNKNOWN` for reconciliation.
   - **#157 — release could target the wrong day.** A reservation made before UTC midnight and
     released after it subtracted from the new day. `releasePayerSpend` now takes a handle carrying
     the reservation's own day and amount.
   `reservePayerSpend` counts spend per payer per UTC day and refuses past the cap **before**
   settlement, so a capped payer is refused without money moving. The counter lives in the existing
   `ApiKeyUsageDO` (`/spend/reserve`, `/spend/release`), because a new DO class needs a migration the
   versioned deploy pipeline cannot apply (`10211`). The differing *failure direction* lives in the
   clients: the key quota fails open, this fails closed. Default `$25`/day per payer, tunable with
   `X402_PAYER_DAILY_CAP_USD`; `0` disables it.
   **What it does not do:** it bounds a runaway agent — one wallet in a retry loop — not a determined
   actor, who can generate wallets freely. That is why a treasury policy remains a prerequisite
   rather than a substitute. Evidence: `test/x402-spend.test.ts` (cap, independence, casing,
   cross-midnight release, unidentified payer, fail-closed) and `test/x402-accept.test.ts`, which
   asserts the refused accept never reached `/settle` and that an ambiguous settlement keeps its
   reservation.
5. **Settlement replay is argued, not tested.** The claim rests on the facilitator/chain rejecting a
   second settlement of the same payload. There is no test for it here because it is not our code —
   but it is the control that prevents double charging, so it should be demonstrated, not assumed.
6. **`OFFER_SIGNING_SECRET` is the root of trust** for both offers and cursors. Rotating it
   invalidates every outstanding offer and cursor (short TTLs make that acceptable, but it should be
   a deliberate act, not a surprise).
7. **Paid paths share the demo rate-limit bucket — addressed 2026-10-17.** `/api/quote`,
   `/api/quote/accept` and `/api/area` now declare the `paid` bucket, which keys on
   `paid:<client-address>` with its own limit (`PAID_RATE_LIMIT`, default 100/min). A paying caller
   behind a shared egress IP can no longer be throttled by unrelated demo traffic on the same address.
   Evidence: the route-table assertions in `test/routes.test.ts`.

## Reviewer checklist

- [ ] Confirm the rail is off (`X402_ENABLED` unset) and that `/api/quote/accept` returns `503`.
- [ ] Walk the threat table and confirm each control is where it says and the test exists.
- [ ] Confirm the receipt store is required, and that no code path can settle without it.
- [ ] Confirm the boundary/scope check precedes every payment step.
- [ ] Confirm the spend cap precedes settlement, and that a refused accept makes no `/settle` call.
- [ ] Decide items 1–7. Item 1 and item 3 gate enabling; items 4 and 7 were addressed 2026-10-17.
- [ ] Confirm the facilitator against a real deployment on testnet before mainnet.
