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
   Until there is, an undelivered result is a support ticket.
3. **The facilitator envelope is unverified.** The `/verify` and `/settle` request and response shapes
   follow the v2 contract but have never been exercised against a real facilitator. A mis-shape fails
   closed (no charge) but also means the rail simply does not work. **Confirm against the chosen
   facilitator before enabling.**
4. **No per-payer spend cap beyond the offer ceiling.** An agent can accept many offers. The offer
   ceiling bounds each one; nothing bounds the total.
5. **Settlement replay is argued, not tested.** The claim rests on the facilitator/chain rejecting a
   second settlement of the same payload. There is no test for it here because it is not our code —
   but it is the control that prevents double charging, so it should be demonstrated, not assumed.
6. **`OFFER_SIGNING_SECRET` is the root of trust** for both offers and cursors. Rotating it
   invalidates every outstanding offer and cursor (short TTLs make that acceptable, but it should be
   a deliberate act, not a surprise).
7. **Paid paths share the demo rate-limit bucket.** Fine for launch volume; revisit if a paid caller
   can be throttled by an unrelated demo user.

## Reviewer checklist

- [ ] Confirm the rail is off (`X402_ENABLED` unset) and that `/api/quote/accept` returns `503`.
- [ ] Walk the threat table and confirm each control is where it says and the test exists.
- [ ] Confirm the receipt store is required, and that no code path can settle without it.
- [ ] Confirm the boundary/scope check precedes every payment step.
- [ ] Decide items 1–7; item 1 and item 3 gate enabling.
- [ ] Confirm the facilitator against a real deployment on testnet before mainnet.
