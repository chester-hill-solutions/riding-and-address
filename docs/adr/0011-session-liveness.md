# ADR 0011 — Session liveness for OAuth access tokens

**Status:** accepted, implemented.
**Date:** 2026-10-19.
**Context:** an access token outlived the session it was minted for. Signing out did not stop an
agent.

## The problem

`src/oauth-token.ts` verified an access token's signature, issuer, audience and expiry, read the
Customer from a claim, and stopped there. It never asked whether the session the token was minted
for still existed.

So: a person signs out of the portal, and the agent they authorised keeps working until the token
expires — 60 minutes by default. Worse, if the session was revoked because it was *compromised*,
the same thing happened.

The repository had already noticed. The consent screen said so in as many words
(`portal/app/lib/consent-copy.ts`): *"Signing out does not stop it either. The token carries the
session id it was minted for, but the resource server never consults the session, so an agent keeps
working until the token expires."* The screen was telling the truth, and the truth was that the
control a person expects from signing out did not exist.

## What was already in place

Two things, both of which had to be re-derived from the tree rather than assumed:

- **The claim exists.** The authorization server puts the session id in the access token as `sid`.
  The provider does it at issuance — `sid: sessionId` where the token is minted — so nothing had
  to be added to the token to make it checkable. Only the *read* was missing.
- **The provider's own reference implementation does exactly this.** Its JWT validator treats a
  token whose session has ended as inactive, and its own comment says why: *"Revocation is the
  stored backstop, not the primary enforcement: introspection and `/userinfo` already treat a token
  whose session has ended as inactive."*

The second point matters more than the first. It meant this was not an invention; it was the
provider's model of revocation, applied one layer away from where it had been written.

## Decision

**An access token is valid while its own expiry holds *and* the session it was minted for still
exists and has not expired.**

The resource server checks the `sid` claim against the portal's `session` row.

### Why the session and nothing else

A JWT access token is self-contained. There is no server-side record the resource server could
consult to ask *"has this been withdrawn?"* — the provider puts it plainly: *"JWT access tokens are
self-contained and cannot be revoked server-side."*

The session is the one thing in the token that points at mutable server state, and it is exactly the
thing a sign-out deletes. It is therefore the only revocation mechanism a self-contained token has.

### Why the `oauthAccessToken.revoked` column is not read

It is the stored backstop for **opaque** tokens, which the provider can look up by hash. For a
self-contained JWT, reading it would mean hashing the token with the provider's own hasher and
coupling this Worker to that scheme — and it would add nothing today:

- there is no per-token revoke control in the portal to set it (the keys page revokes API keys,
  which are a different thing, and there is no connected-applications page);
- the provider revokes a session's access-token rows on sign-out as hardening anyway, so the flag
  says the same thing the session check says.

So it is not read, and that is a decision rather than an omission.

### The failure policy

**Fail closed.** A database error is not a live session.

But a D1 blip must not take OAuth auth down for every caller at once, so a verdict of *"live"*
survives a database error for a **grace window** of 60 seconds. Inside it, the last known verdict
stands. Outside it, the answer is "not live".

The result is that both properties hold at once: revocation latency is bounded (TTL + grace), and
an availability failure never becomes an unbounded bypass of the check. This is the same shape as
the fuse's fail-closed/fail-open rule in `src/usage-ledger.ts`, applied to a security decision
rather than a quota.

**What a D1 outage actually looks like from the caller's side.** The session query and the
signing-key read hit the same database, and the signing key is cached for 60 seconds. So an
outage breaks token *verification* 60 seconds in, while the grace window keeps a cached "live"
verdict standing for 75. The check therefore does not widen the outage: verification has already
failed before the session check gives up.

The one narrow case is a token presented for the **first** time during an outage: it has no cached
verdict, so the check refuses it while verification would still have succeeded. That window is the
signing key's 60 seconds, and it is the price of failing closed — failing open there would let a
revoked token work for the length of the outage, which is the unbounded bypass this decision
exists to prevent.

### The verdict cache

A session's verdict is cached for **15 seconds**, which is the revocation latency: a person who
signs out can still use the token for at most that long. It also keeps an agent's tool calls from
each costing a query.

### The kill switch

`OAUTH_SESSION_CHECK=off` disables the check. Anything else — including an unset value — leaves it
on, so a typo cannot silently disable it. It exists so a deployment that turns out to be wrong can
be reversed without shipping code, the same reason `isOdaSuggestEnabled` exists.

### The answer to the caller

**Uniform.** A token whose session has ended is refused exactly as a token with a bad signature is
refused, with the same status, the same headers and the same body.

The distinction exists internally, so the log can say what happened, but it does not reach the
caller. "Your signature is wrong" and "you signed out" are not different remedies — authorize again
— and telling them apart would make this an oracle for probing tokens, which is the exact property
the verifier already protected for every other failure.

## What it costs

One indexed read of one row, on a path that already reads `PORTAL_DB` for the signing key. The
read is not new territory: `src/oauth-token.ts` already documents `PORTAL_DB` as a deliberate,
narrow exception, and the `session` table is not tenant data — it is the liveness of a session the
token already names.

The revocation latency is 15 seconds plus the grace window. That is the honest cost of a
self-contained token, and it is a great deal smaller than "until the token expires".

## Consequences

- **Signing out stops an agent**, within the revocation latency. The consent screen says so now,
  and a test asserts that the screen's claim is backed by the code.
- **A compromised session is a compromised token for at most the revocation latency**, not for the
  full token lifetime.
- **Tokens minted before this change keep working.** A token with no `sid` claim — an old token, or
  a client-credentials grant — is not checked. Its own expiry still bounds it, and refusing tokens
  we cannot judge would break live clients for no security gain.
- **The `revoked` column stays unread**, and this ADR is where that is written down rather than
  left as an omission somebody later re-derives.
- **The kill switch is a liability if it is left on.** `OAUTH_SESSION_CHECK=off` in production is
  the old behaviour. It should be absent.

## What this does not solve

There is still **no per-application revoke control**. A person can end the whole grant by signing
out, but cannot revoke one application while staying signed in, because the portal has no
connected-applications page to put one on. The consent screen says so, and says it plainly rather
than pointing at a button that does not exist.

Adding one is a product decision, not an engineering one, and it is out of scope here.
