# CanCoder

Canadian electoral riding and address lookup sold as a hybrid API product: self-serve metered access plus sales-assisted Enterprise batch.

## Language

### Parties

**Customer**:
An organization that holds billing, usage, fuse settings, and API keys.
_Avoid_: Account, tenant, client, org (except as informal synonym)

**User**:
A person who authenticates to the portal and belongs to a Customer.
_Avoid_: Member (except as a role name), account holder

### Credentials

**Server key**:
A secret credential (`sk_*`) for backend calls to lookup and geocode routes.
_Avoid_: API password, BASIC_AUTH (operator-only), Bearer token (transport, not the credential kind)

**Browser key**:
A public credential (`pk_*`) restricted by origin allowlist, used for search and embed only.
_Avoid_: Client key, publishable key (unless explaining Stripe analogy)

### Usage and billing

**Billable unit**:
One successful HTTP 200 lookup or search response counted toward free allowance, fuse, and Stripe metering.
_Avoid_: Request (too broad — errors are not billable), hit, call (informal OK)

**Fuse**:
A Customer-level ceiling on Billable units in a calendar month that hard-blocks by default.
_Avoid_: Rate limit (per-minute throttle), daily cap (Browser-key abuse control only)

**Enterprise**:
A Customer enabled for batch (and related sales-assisted terms) under a separate contract.
_Avoid_: Premium, Pro (unless used as a plan label later)

### Data

**Dataset pin**:
An optional request that selects a specific boundary vintage; unavailable vintages fail hard.
_Avoid_: Version (ambiguous with API version)

**ODA**:
Statistics Canada Open Database of Addresses used for geocoding — not riding boundaries.
_Avoid_: Using “ODA” to mean any open data
