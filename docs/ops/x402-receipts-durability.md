# x402 receipt durability

What happens to a settled payment when delivery or the receipt store fails, and what is still not
covered. Referenced from `src/offers.ts`; background in
[ADR 0007](../adr/0007-account-free-x402-payments.md) and
[the security review](x402-security-review.md) item 2.

## The guarantee

> Every settled payment leaves a durable record before anything else can fail.

`POST /api/quote/accept` records the receipt **immediately after settlement and before delivery**,
then corrects it once the result is in hand. Before this was fixed (#129) the order was deliver →
decode → record, so a delivery that threw, or a body that could not be decoded, lost a payment that
had already moved.

## What happens in each failure

| Failure | Outcome | What holds the obligation |
|---|---|---|
| Settlement succeeds, delivery throws | `502 SETTLEMENT_DELIVERY_FAILED` | the receipt, recorded first, with `delivered: false` |
| Settlement succeeds, delivery returns non-OK | `502 SETTLEMENT_DELIVERY_FAILED` | the same |
| Settlement and delivery succeed, the correction write fails | `200`, `receiptPersisted: true` (the first write landed) | the receipt, which still says `delivered: false` — a **false obligation**, the safe direction |
| Settlement and delivery succeed, *every* write fails | `200` with `receiptPersisted: false` | the log line, plus the caller's copy |
| Settlement succeeds, delivery fails, every write fails | `502`, `receiptPersisted` absent | the log line |

A rejected write is never reported as success. `recordReceipt` returns whether the write happened and
retries once, and the response carries `receiptPersisted` so a caller can tell without guessing.

## What the first live payment found

On 2026-10-17 a real testnet payment settled against a real facilitator, and the receipt **was not
written** — for a reason nothing had caught: the receipt key used the offer id whole, and an offer id
is a signed token of roughly 512 characters, so the key was **549 bytes** against Cloudflare KV's
**512-byte** limit. Every write failed. Fixed in #172.

Two things about that are worth keeping:

- **The fake KV in the tests does not enforce the limit**, so it could not catch it. The guard is now
  a unit test on the key's length, not the end-to-end fixtures — they happen to produce offer ids
  short enough to stay under 512. Said out loud because "the tests pass" was true and meant nothing.
- **It was the residual gap happening for real.** The obligation survived only as a log line, exactly
  as this document predicted, and the settlement hash was in it. That is the argument for the second
  durable sink below.

## The residual gap, stated plainly

**If the receipt store is unavailable for a settlement, the only durable record is the log line.**

That line is deliberately complete — the whole receipt as JSON, including the transaction hash and
the offer id — because it is the recovery path. It is emitted with the marker `RECEIPT NOT PERSISTED`
and lands in Workers Logs, which is queryable:

```
cf analytics sql post --query "SELECT timestamp, message FROM logs.workersLogs \
  WHERE scriptName = 'riding-lookup' AND message LIKE '%RECEIPT NOT PERSISTED%'" \
  --scope-account-tag <account-id>
```

This is not a system of record: Workers Logs has a retention window, and a log is not a database.
The proper fix is a second durable sink for receipts, which has not been built. Until it is, treat a
receipt-store outage during a settlement as an incident to reconcile from the log, and prefer to
settle the refund by hand — the transaction hash in that line is what you need.

Two things make this narrower than it sounds:

- The rail **requires** the binding (`X402_RECEIPTS`), and `/api/quote/accept` fails closed without
  it, so the store cannot be *unconfigured* — only briefly unavailable.
- The caller also receives the receipt in the response body, so a buyer can always prove what they
  paid for, even when our own record is missing.

## Reconciliation

`GET /api/x402/receipts` (admin) reports the settled population: `delivered`, `deliveryFailed`, and
the settled value by currency. A `deliveryFailed` entry is an obligation to credit or refund — the
work ADR 0007 names as still manual.

A receipt that says `delivered: false` because the *correction* write failed is a false obligation:
the buyer got their result. It is recorded that way on purpose, because the alternative — reporting
`delivered: true` without a successful write — is the direction that hides a real failure.
