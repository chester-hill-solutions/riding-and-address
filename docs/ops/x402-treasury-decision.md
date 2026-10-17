# x402 treasury and custody decision

**Status: open. This is the gate on enabling the rail in production.**

`docs/adr/0007-account-free-x402-payments.md` records that the rail must not be enabled until
stablecoin receipt, treasury and tax policy are resolved. This is that decision, as a form: each
question has the options, a recommendation, and what changes either way. Answer by editing the
`Answer:` line.

Nothing here is a code change. Once answered, the mechanical steps are in
[What happens once this is answered](#what-happens-once-this-is-answered).

---

## 1. Custody — who holds the receiving key?

The Worker only ever holds the **address**, never the key. It cannot spend, by design, so this is
about who can move the money once it lands.

| Option | Consequence |
|---|---|
| A hot wallet on a laptop or phone | Simplest; the key is one malware infection from the balance |
| A hardware wallet (Ledger, Trezor) | Small hardware cost; manual to spend from |
| A multisig (e.g. 2-of-3) | Needs co-signers and process; strongest for a business |
| A custodial service | Someone else holds it; check their terms and your jurisdiction |

**Recommended:** a hardware wallet or multisig for mainnet. A throwaway hot wallet is fine for the
testnet run below, where the funds are worthless.

**Answer:**

## 2. Network and asset

| Option | Consequence |
|---|---|
| **Base + USDC** | The default across the x402 ecosystem, and what Cloudflare's examples use. Lowest friction for buyers |
| Another EVM chain + USDC | Only if your buyers are there; more facilitator and liquidity risk |
| A non-USDC token | Buyers must hold it; materially reduces who can pay |

**Recommended:** Base mainnet + USDC. Testnet is `base-sepolia` with free USDC from the Circle
faucet — no cost, no real money.

**Answer:**

## 3. Which facilitator settles the payments?

A facilitator verifies and broadcasts the payment. It never holds funds. The rail is configured with
one URL, so switching later is a config change.

| Option | Consequence |
|---|---|
| `https://x402.org/facilitator` | Free, and what Cloudflare's examples use — but x402's own docs say it is **for testnet/development**, not production mainnet |
| A managed production facilitator (Coinbase CDP, thirdweb, xpay, …) | Usually needs an account and an API key; a fee or a free tier. CDP's token drops into `X402_FACILITATOR_TOKEN`, which the rail already supports |
| Self-hosted `x402-rs` | Full control, no third party, and you now own uptime, gas, and upgrades |

**Recommended:** CDP (or another managed facilitator) for production; the public one for the testnet
run.

**Answer:**

## 4. Who reconciles, and how often?

Every settled payment writes a receipt. `GET /api/x402/receipts` (admin) reports what settled, what
was delivered, what failed, and the value by currency.

| Option | Consequence |
|---|---|
| Nobody, until something looks wrong | Money moves without an owner. The failure mode is silent |
| Someone checks on a schedule | Needs a named person and a cadence |

**Recommended:** a named owner, checked weekly, with entries copied into your accounting. State the
cadence — it is the difference between a policy and a hope.

**Answer (who, and how often):**

## 5. Tax and accounting treatment

Stablecoin receipts are income in most jurisdictions, and the *conversion* may be a taxable event.
This is the one question that probably needs your accountant rather than you.

**Recommended:** ask your accountant before enabling. The receipts give them the data — amount,
currency, timestamp, transaction hash — but the treatment is theirs to state.

**Answer:**

## 6. Refund policy

A settled-but-undelivered result is currently a **support ticket**: the receipt records it
(`delivered: false`) with the payer's address, and an operator sends an on-chain refund by hand.
There is no automated refund path.

| Option | Consequence |
|---|---|
| Credit or refund on request, stated publicly | A published promise you have to keep |
| Best-effort, no published promise | Weaker for buyers; simpler for you |

**Recommended:** state it publicly, and keep it narrow — an undelivered result gets refunded, a
delivered result does not. Whatever you choose becomes buyer-facing copy.

**Answer:**

## 7. Per-payer daily cap

The rail already enforces a cap so a runaway agent cannot spend without bound. It bounds a single
wallet in a retry loop — **not** a determined actor, who can generate wallets freely. That limitation
is why this decision exists.

Current default: **$25 per payer per UTC day** (`X402_PAYER_DAILY_CAP_USD`; `0` disables it).

**Recommended:** start at the default, watch real buyer behaviour, raise it deliberately.

**Answer:**

---

## What happens once this is answered

1. `X402_ENABLED`, `X402_PAY_TO`, `X402_NETWORK`, `X402_ASSET`, `X402_FACILITATOR_URL`
   (+ `X402_FACILITATOR_TOKEN` if the facilitator needs one) set on the Worker. `X402_RECEIPTS` and
   the spend counter are already bound.
2. `X402_RPC_URL` set, so `POST /api/x402/reconcile` can confirm settlements on chain.
3. A signed payment run end to end against staging — see
   [`x402-facilitator-verification.md`](x402-facilitator-verification.md) step 2.
4. The security review's remaining items closed (`docs/ops/x402-security-review.md`).
5. The go-live checklist's x402 boxes ticked, then enable.

## What this does not cover

- The facilitator **envelope** — already verified against live testnet facilitators.
- **Automated refunds** — a code change, not a decision, and not required to enable.
- The **Monetization Gateway** — Cloudflare's managed edge version, closed beta for US sellers and
  buyers. A watch item, not a plan.
